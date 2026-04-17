import fs from 'fs';
import readline from 'readline';
import path from 'path';
import sqlite3 from 'sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { Thought, CaptureOptions, ThoughtMetadata, DEFAULT_CONFIG } from '../types';
import { compress, decompress, shouldCompress } from './compression';
import { getConfigManager } from '../config/config';
import { safeParseThought } from './validation';
import { encrypt, decrypt, getEncryptionKey } from './encryption';
import { embed, vectorToBuffer, bufferToVector, cosineSimilarity, DEFAULT_DIMENSION } from '../search/embeddings';

/**
 * Storage manager for Mind Palace
 * Handles JSONL + SQLite for efficient storage and fast queries
 */
export class StorageManager {
  private storageDir: string;
  private jsonlPath: string;
  private dbPath: string;
  private db: sqlite3.Database | null = null;
  private initialized: boolean = false;

  constructor() {
    const config = getConfigManager();
    this.storageDir = config.getStorageDir();
    this.jsonlPath = path.join(this.storageDir, 'thoughts.jsonl');
    this.dbPath = path.join(this.storageDir, 'thoughts.db');
  }

  /**
   * Initialize storage (create tables, indexes)
   */
  public async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.ensureDir();
    this.db = new sqlite3.Database(this.dbPath);
    await this.createTables();
    this.initialized = true;
  }

  private getDb(): sqlite3.Database {
    if (!this.db) {
      throw new Error('StorageManager not initialized. Call initialize() first.');
    }
    return this.db;
  }

  /**
   * Ensure storage directory exists with proper permissions
   */
  private async ensureDir(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdir(this.storageDir, { recursive: true, mode: 0o700 }, (err) => {
          if (err) reject(err);
          else resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Create database tables and indexes using serialize for safe sequential execution
   */
  private async createTables(): Promise<void> {
    const db = this.getDb();

    return new Promise((resolve, reject) => {
      db.serialize(() => {
        const statements = [
          `CREATE TABLE IF NOT EXISTS thoughts (
            id TEXT PRIMARY KEY,
            timestamp TEXT NOT NULL,
            topic TEXT,
            confidence REAL NOT NULL,
            category TEXT NOT NULL,
            emotionalTone TEXT,
            tags TEXT,
            domain TEXT,
            modelVersion TEXT,
            inputLength INTEGER,
            outputLength INTEGER,
            compressed BOOLEAN DEFAULT 0,
            version INTEGER DEFAULT 1,
            jsonlOffset INTEGER NOT NULL
          )`,
          `CREATE INDEX IF NOT EXISTS idx_timestamp ON thoughts(timestamp)`,
          `CREATE INDEX IF NOT EXISTS idx_topic ON thoughts(topic)`,
          `CREATE INDEX IF NOT EXISTS idx_category ON thoughts(category)`,
          `CREATE INDEX IF NOT EXISTS idx_confidence ON thoughts(confidence)`,
          `CREATE INDEX IF NOT EXISTS idx_domain ON thoughts(domain)`,
          `CREATE TABLE IF NOT EXISTS thought_tags (
            thought_id TEXT NOT NULL,
            tag TEXT NOT NULL,
            PRIMARY KEY (thought_id, tag),
            FOREIGN KEY (thought_id) REFERENCES thoughts(id) ON DELETE CASCADE
          )`,
          `CREATE INDEX IF NOT EXISTS idx_tag ON thought_tags(tag)`,
          `CREATE TABLE IF NOT EXISTS thought_references (
            source_id TEXT NOT NULL,
            target_id TEXT NOT NULL,
            PRIMARY KEY (source_id, target_id),
            FOREIGN KEY (source_id) REFERENCES thoughts(id) ON DELETE CASCADE,
            FOREIGN KEY (target_id) REFERENCES thoughts(id) ON DELETE CASCADE
          )`,
          `CREATE TABLE IF NOT EXISTS thought_embeddings (
            thought_id TEXT PRIMARY KEY,
            embedding BLOB NOT NULL,
            FOREIGN KEY (thought_id) REFERENCES thoughts(id) ON DELETE CASCADE
          )`,
        ];

        let error: Error | null = null;
        let completed = 0;

        for (const statement of statements) {
          db.run(statement, (err) => {
            if (err && !error) error = err;
            completed++;
            if (completed === statements.length) {
              if (error) reject(error);
              else resolve();
            }
          });
        }
      });
    });
  }

  /**
   * Capture a new thought with transactional safety.
   * SQLite index is committed first; if JSONL append fails, the index entry
   * is rolled back to keep storage consistent.
   */
  public async capture(
    content: string,
    options: CaptureOptions = {}
  ): Promise<Thought> {
    const id = uuidv4();
    const timestamp = new Date().toISOString();

    const metadata: ThoughtMetadata = {
      confidence: options.confidence ?? 0.7,
      inputLength: options.userQuery?.length ?? 0,
      outputLength: content.length,
      tags: options.tags ?? [],
      category: options.category ?? 'response',
      topic: options.topic,
      emotionalTone: options.emotionalTone,
      modelVersion: options.modelVersion,
    };

    const thought: Thought = {
      id,
      timestamp,
      content,
      metadata,
      source: {
        userQuery: options.userQuery,
        conversation: options.conversationId,
        domain: options.domain,
      },
      compressed: false,
      version: 1,
    };

    // Index first, then write to JSONL. Rollback index if JSONL fails.
    await this.indexThought(thought);
    try {
      await this.saveToJSONL(thought);
      await this.storeEmbedding(id, content).catch((err) =>
        console.warn(`Failed to store embedding for ${id}:`, err)
      );
      if (options.references && options.references.length > 0) {
        await this.storeReferences(id, options.references).catch((err) =>
          console.warn(`Failed to store references for ${id}:`, err)
        );
      }
    } catch (jsonlErr) {
      await this.deleteThoughtIndex(id).catch((err) =>
        console.error(`Failed to rollback index for ${id}:`, err)
      );
      throw jsonlErr;
    }

    return thought;
  }

  /**
   * Store embedding vector for a thought in SQLite BLOB table.
   */
  public async storeEmbedding(thoughtId: string, content: string): Promise<void> {
    const db = this.getDb();
    const vec = embed(content, DEFAULT_DIMENSION);
    const buf = vectorToBuffer(vec);

    return new Promise((resolve, reject) => {
      db.run(
        `INSERT OR REPLACE INTO thought_embeddings (thought_id, embedding) VALUES (?, ?)`,
        [thoughtId, buf],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  /**
   * Store references (forward links) between thoughts for thinking chains.
   */
  public async storeReferences(sourceId: string, targetIds: string[]): Promise<void> {
    const db = this.getDb();

    return new Promise((resolve, reject) => {
      let completed = 0;
      let error: Error | null = null;
      if (targetIds.length === 0) return resolve();

      for (const targetId of targetIds) {
        db.run(
          `INSERT OR IGNORE INTO thought_references (source_id, target_id) VALUES (?, ?)`,
          [sourceId, targetId],
          (err: Error | null) => {
            if (err && !error) error = err;
            completed++;
            if (completed === targetIds.length) {
              if (error) reject(error);
              else resolve();
            }
          }
        );
      }
    });
  }

  /**
   * Get all thought IDs referenced by a source thought (forward chain).
   */
  public async getReferences(sourceId: string): Promise<string[]> {
    const db = this.getDb();
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT target_id FROM thought_references WHERE source_id = ?`,
        [sourceId],
        (err, rows: any[]) => {
          if (err) reject(err);
          else resolve((rows || []).map((r) => r.target_id));
        }
      );
    });
  }

  /**
   * Get all thought IDs that reference the target (backward chain / backlinks).
   */
  public async getBacklinks(targetId: string): Promise<string[]> {
    const db = this.getDb();
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT source_id FROM thought_references WHERE target_id = ?`,
        [targetId],
        (err, rows: any[]) => {
          if (err) reject(err);
          else resolve((rows || []).map((r) => r.source_id));
        }
      );
    });
  }

  /**
   * Vector similarity search using stored embeddings.
   * Returns thought IDs ranked by cosine similarity (highest first).
   */
  public async vectorSearch(
    queryText: string,
    topK: number = 10
  ): Promise<Array<{ id: string; score: number }>> {
    const db = this.getDb();
    const queryVec = embed(queryText, DEFAULT_DIMENSION);

    const rows: Array<{ thought_id: string; embedding: Buffer }> = await new Promise(
      (resolve, reject) => {
        db.all(
          `SELECT thought_id, embedding FROM thought_embeddings`,
          (err, rows: any[]) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      }
    );

    const scored = rows
      .map((row) => ({
        id: row.thought_id,
        score: cosineSimilarity(queryVec, bufferToVector(row.embedding)),
      }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, topK));

    return scored;
  }

  /**
   * Delete thought index entries (used for transaction rollback)
   */
  private async deleteThoughtIndex(id: string): Promise<void> {
    const db = this.getDb();

    return new Promise((resolve, reject) => {
      db.run(`DELETE FROM thoughts WHERE id = ?`, [id], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Rebuild the SQLite index from the JSONL source-of-truth log.
   * Use this to recover from a corrupted or deleted DB file.
   * Returns the number of thoughts re-indexed.
   */
  public async rebuildIndex(): Promise<number> {
    const db = this.getDb();

    await new Promise<void>((resolve, reject) => {
      db.serialize(() => {
        db.run('DELETE FROM thought_tags');
        db.run('DELETE FROM thought_references');
        db.run('DELETE FROM thought_embeddings');
        db.run('DELETE FROM thoughts', (err) => (err ? reject(err) : resolve()));
      });
    });

    const thoughts = await this.readAllFromJSONL();
    // Last-write-wins: latest entry per id
    const latest = new Map<string, Thought>();
    for (const t of thoughts) {
      latest.set(t.id, this.maybeDecryptThought(t));
    }

    let reindexed = 0;
    for (const thought of latest.values()) {
      await this.indexThought(thought);
      if (!thought.compressed && !thought.encrypted) {
        await this.storeEmbedding(thought.id, thought.content).catch(() => {});
      }
      reindexed++;
    }

    return reindexed;
  }

  /**
   * Generate and persist embeddings for any thoughts missing them.
   * Useful after enabling vector search or importing external data.
   */
  public async backfillEmbeddings(): Promise<number> {
    const db = this.getDb();

    const existingIds: Set<string> = await new Promise((resolve, reject) => {
      db.all(`SELECT thought_id FROM thought_embeddings`, (err, rows: any[]) => {
        if (err) reject(err);
        else resolve(new Set((rows || []).map((r) => r.thought_id)));
      });
    });

    const thoughts = await this.getAllThoughts(100000, 0);
    let indexed = 0;

    for (const thought of thoughts) {
      if (existingIds.has(thought.id)) continue;
      if (thought.compressed || thought.encrypted) continue;
      await this.storeEmbedding(thought.id, thought.content);
      indexed++;
    }

    return indexed;
  }

  /**
   * Save thought to JSONL file (encrypts content if enabled).
   */
  private async saveToJSONL(thought: Thought): Promise<void> {
    const toPersist = this.maybeEncryptThought(thought);
    return new Promise((resolve, reject) => {
      const jsonLine = JSON.stringify(toPersist) + '\n';
      fs.appendFile(this.jsonlPath, jsonLine, { mode: 0o600 }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Encrypt thought.content if encryption is enabled.
   * Marks the thought with `encrypted: true` so decryption is symmetric.
   */
  private maybeEncryptThought(thought: Thought): Thought {
    const config = getConfigManager().getConfig();
    if (!config.storage.encryption || thought.encrypted) return thought;

    try {
      const key = getEncryptionKey(this.storageDir);
      return { ...thought, content: encrypt(thought.content, key), encrypted: true };
    } catch (error) {
      console.error(`Failed to encrypt thought ${thought.id}:`, error);
      return thought;
    }
  }

  /**
   * Decrypt thought.content if it was stored encrypted.
   */
  private maybeDecryptThought(thought: Thought): Thought {
    if (!thought.encrypted) return thought;

    try {
      const key = getEncryptionKey(this.storageDir);
      return { ...thought, content: decrypt(thought.content, key), encrypted: false };
    } catch (error) {
      console.error(`Failed to decrypt thought ${thought.id}:`, error);
      return thought;
    }
  }

  /**
   * Stream JSONL file line-by-line. Yields validated Thought objects.
   * Use this instead of readAllFromJSONL when memory efficiency matters.
   */
  public async *streamThoughts(): AsyncGenerator<Thought, void, void> {
    if (!fs.existsSync(this.jsonlPath)) return;

    const stream = fs.createReadStream(this.jsonlPath, { encoding: 'utf-8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    try {
      for await (const line of rl) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const thought = safeParseThought(trimmed);
        if (thought) yield this.maybeDecryptThought(thought);
      }
    } finally {
      rl.close();
      stream.close();
    }
  }

  /**
   * Index thought in SQLite
   */
  private async indexThought(thought: Thought): Promise<void> {
    const db = this.getDb();

    return new Promise((resolve, reject) => {
      const {
        id,
        timestamp,
        metadata: {
          topic,
          confidence,
          category,
          emotionalTone,
          tags,
          modelVersion,
          inputLength,
          outputLength,
        },
        source,
        compressed,
        version,
      } = thought;

      const tagsString = JSON.stringify(tags);

      db.run(
        `INSERT OR REPLACE INTO thoughts
        (id, timestamp, topic, confidence, category, emotionalTone, tags, domain, modelVersion, inputLength, outputLength, compressed, version, jsonlOffset)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          timestamp,
          topic,
          confidence,
          category,
          emotionalTone,
          tagsString,
          source?.domain,
          modelVersion,
          inputLength,
          outputLength,
          compressed ? 1 : 0,
          version,
          0,
        ],
        async (err: Error | null) => {
          if (err) {
            reject(err);
            return;
          }

          try {
            if (tags.length > 0) {
              await this.indexTags(id, tags);
            }
            resolve();
          } catch (tagErr) {
            reject(tagErr);
          }
        }
      );
    });
  }

  /**
   * Index tags for a thought
   */
  private async indexTags(thoughtId: string, tags: string[]): Promise<void> {
    const db = this.getDb();

    return new Promise((resolve, reject) => {
      let completed = 0;
      let error: Error | null = null;

      for (const tag of tags) {
        db.run(
          `INSERT OR IGNORE INTO thought_tags (thought_id, tag) VALUES (?, ?)`,
          [thoughtId, tag],
          (err: Error | null) => {
            if (err && !error) error = err;
            completed++;
            if (completed === tags.length) {
              if (error) reject(error);
              else resolve();
            }
          }
        );
      }
    });
  }

  /**
   * Get thought by ID - reads from JSONL.
   * Returns the LATEST version (last write wins for append-only updates).
   */
  public async getThought(id: string): Promise<Thought | null> {
    const thoughts = await this.readAllFromJSONL();
    let latest: Thought | null = null;
    for (const t of thoughts) {
      if (t.id === id) latest = t;
    }
    return latest;
  }

  /**
   * Read and parse the entire JSONL file once (cached per call)
   */
  private async readAllFromJSONL(): Promise<Thought[]> {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(this.jsonlPath)) {
        resolve([]);
        return;
      }

      fs.readFile(this.jsonlPath, 'utf-8', (err: NodeJS.ErrnoException | null, data: string) => {
        if (err) {
          if (err.code === 'ENOENT') {
            resolve([]);
            return;
          }
          reject(err);
          return;
        }

        const thoughts: Thought[] = [];
        const lines = data.split('\n');
        let invalidCount = 0;
        for (let i = 0; i < lines.length; i++) {
          const trimmed = lines[i].trim();
          if (!trimmed) continue;
          const thought = safeParseThought(trimmed);
          if (thought) {
            thoughts.push(this.maybeDecryptThought(thought));
          } else {
            invalidCount++;
            console.warn(`Invalid/unsafe JSONL line ${i + 1} skipped`);
          }
        }
        if (invalidCount > 0) {
          console.warn(`Total invalid JSONL lines skipped: ${invalidCount}/${lines.length}`);
        }

        resolve(thoughts);
      });
    });
  }

  /**
   * Get all thoughts with pagination (reads JSONL once, uses SQLite for ordering)
   */
  public async getAllThoughts(limit: number = 100, offset: number = 0): Promise<Thought[]> {
    const db = this.getDb();

    // Get ordered IDs from SQLite
    const ids: string[] = await new Promise((resolve, reject) => {
      const query = `SELECT id FROM thoughts ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
      db.all(query, [limit, offset], (err, rows: any[]) => {
        if (err) {
          reject(err);
          return;
        }
        resolve((rows || []).map((r) => r.id));
      });
    });

    if (ids.length === 0) return [];

    // Read JSONL once and filter
    const allThoughts = await this.readAllFromJSONL();
    const idSet = new Set(ids);
    const thoughtMap = new Map<string, Thought>();

    for (const thought of allThoughts) {
      if (idSet.has(thought.id)) {
        thoughtMap.set(thought.id, thought);
      }
    }

    // Return in the order SQLite gave us
    const results: Thought[] = [];
    for (const id of ids) {
      const thought = thoughtMap.get(id);
      if (thought) results.push(thought);
    }

    return results;
  }

  /**
   * Get thoughts by tag
   */
  public async getThoughtsByTag(tag: string, limit: number = 100): Promise<Thought[]> {
    const db = this.getDb();

    const ids: string[] = await new Promise((resolve, reject) => {
      const query = `
        SELECT DISTINCT t.id FROM thoughts t
        JOIN thought_tags tt ON t.id = tt.thought_id
        WHERE tt.tag = ?
        ORDER BY t.timestamp DESC
        LIMIT ?
      `;
      db.all(query, [tag, limit], (err, rows: any[]) => {
        if (err) {
          reject(err);
          return;
        }
        resolve((rows || []).map((r) => r.id));
      });
    });

    if (ids.length === 0) return [];

    const allThoughts = await this.readAllFromJSONL();
    const idSet = new Set(ids);
    const thoughtMap = new Map<string, Thought>();

    for (const thought of allThoughts) {
      if (idSet.has(thought.id)) {
        thoughtMap.set(thought.id, thought);
      }
    }

    const results: Thought[] = [];
    for (const id of ids) {
      const thought = thoughtMap.get(id);
      if (thought) results.push(thought);
    }

    return results;
  }

  /**
   * Count total thoughts
   */
  public async count(): Promise<number> {
    const db = this.getDb();

    return new Promise((resolve, reject) => {
      db.get(`SELECT COUNT(*) as count FROM thoughts`, (err, row: any) => {
        if (err) reject(err);
        else resolve(row?.count ?? 0);
      });
    });
  }

  /**
   * Update an existing thought. Appends a new version to JSONL (append-only log)
   * and updates the SQLite index. Readers return the latest version.
   */
  public async updateThought(thought: Thought): Promise<void> {
    await this.saveToJSONL(thought);
    await this.updateThoughtIndex(thought);
  }

  /**
   * Update only the SQLite index entry for a thought.
   */
  private async updateThoughtIndex(thought: Thought): Promise<void> {
    const db = this.getDb();

    return new Promise((resolve, reject) => {
      const {
        id,
        timestamp,
        metadata: {
          topic,
          confidence,
          category,
          emotionalTone,
          tags,
          modelVersion,
          inputLength,
          outputLength,
        },
        source,
        compressed,
        version,
      } = thought;

      const tagsString = JSON.stringify(tags);

      db.run(
        `UPDATE thoughts SET
          timestamp = ?, topic = ?, confidence = ?, category = ?,
          emotionalTone = ?, tags = ?, domain = ?, modelVersion = ?,
          inputLength = ?, outputLength = ?, compressed = ?, version = ?
         WHERE id = ?`,
        [
          timestamp,
          topic,
          confidence,
          category,
          emotionalTone,
          tagsString,
          source?.domain,
          modelVersion,
          inputLength,
          outputLength,
          compressed ? 1 : 0,
          version,
          id,
        ],
        (err: Error | null) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  /**
   * Update thought content (for compression/decompression)
   */
  public async updateThoughtContent(id: string, content: string): Promise<void> {
    const thought = await this.getThought(id);
    if (!thought) throw new Error(`Thought ${id} not found`);

    thought.content = content;
    await this.saveToJSONL(thought);
    await this.updateThought(thought);
  }

  /**
   * Delete a thought from both the SQLite index and the JSONL file.
   * JSONL is rewritten without the target thought.
   */
  public async deleteThought(id: string): Promise<void> {
    await this.deleteThoughtIndex(id);

    if (!fs.existsSync(this.jsonlPath)) return;

    const thoughts = await this.readAllFromJSONL();
    const remaining = thoughts.filter((t) => t.id !== id);
    const serialized = remaining.map((t) => JSON.stringify(t)).join('\n') + (remaining.length ? '\n' : '');

    return new Promise((resolve, reject) => {
      fs.writeFile(this.jsonlPath, serialized, { mode: 0o600 }, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Close database connection
   */
  public close(): void {
    if (this.db) {
      this.db.close((err) => {
        if (err) {
          console.error('Error closing database:', err);
        }
      });
      this.db = null;
    }
    this.initialized = false;
  }
}

// Singleton instance
let storageManager: StorageManager | null = null;

/**
 * Get storage manager instance
 */
export function getStorageManager(): StorageManager {
  if (!storageManager) {
    storageManager = new StorageManager();
  }
  return storageManager;
}

/**
 * Reset storage manager (for testing)
 */
export function resetStorageManager(): void {
  if (storageManager) {
    storageManager.close();
    storageManager = null;
  }
}
