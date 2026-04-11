import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { Thought, RawThought, CaptureOptions, ThoughtMetadata, DEFAULT_CONFIG } from '../types';
import { compress, decompress, shouldCompress } from './compression';
import { getConfigManager } from '../config/config';

/**
 * Storage manager for Mind Palace
 * Handles JSONL + SQLite for efficient storage and fast queries
 */
export class StorageManager {
  private storageDir: string;
  private jsonlPath: string;
  private dbPath: string;
  private db: sqlite3.Database;
  private initialized: boolean = false;

  constructor() {
    const config = getConfigManager();
    this.storageDir = config.getStorageDir();
    this.jsonlPath = path.join(this.storageDir, 'thoughts.jsonl');
    this.dbPath = path.join(this.storageDir, 'thoughts.db');
    this.db = new sqlite3.Database(this.dbPath);
  }

  /**
   * Initialize storage (create tables, indexes)
   */
  public async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.ensureDir();
    await this.createTables();
    this.initialized = true;
  }

  /**
   * Ensure storage directory exists
   */
  private async ensureDir(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdir(this.storageDir, { recursive: true }, (err) => {
          if (err) reject(err);
          else resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Create database tables and indexes
   */
  private async createTables(): Promise<void> {
    return new Promise((resolve, reject) => {
      const statements = [
        // Main thoughts table
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

        // Create indexes for fast queries
        `CREATE INDEX IF NOT EXISTS idx_timestamp ON thoughts(timestamp)`,
        `CREATE INDEX IF NOT EXISTS idx_topic ON thoughts(topic)`,
        `CREATE INDEX IF NOT EXISTS idx_category ON thoughts(category)`,
        `CREATE INDEX IF NOT EXISTS idx_confidence ON thoughts(confidence)`,
        `CREATE INDEX IF NOT EXISTS idx_domain ON thoughts(domain)`,

        // Tags table for tag queries
        `CREATE TABLE IF NOT EXISTS thought_tags (
          thought_id TEXT NOT NULL,
          tag TEXT NOT NULL,
          PRIMARY KEY (thought_id, tag),
          FOREIGN KEY (thought_id) REFERENCES thoughts(id) ON DELETE CASCADE
        )`,

        // References table for related thoughts
        `CREATE TABLE IF NOT EXISTS thought_references (
          source_id TEXT NOT NULL,
          target_id TEXT NOT NULL,
          PRIMARY KEY (source_id, target_id),
          FOREIGN KEY (source_id) REFERENCES thoughts(id) ON DELETE CASCADE,
          FOREIGN KEY (target_id) REFERENCES thoughts(id) ON DELETE CASCADE
        )`,

        // Vector embeddings for semantic search
        `CREATE TABLE IF NOT EXISTS thought_embeddings (
          thought_id TEXT PRIMARY KEY,
          embedding BLOB NOT NULL,
          FOREIGN KEY (thought_id) REFERENCES thoughts(id) ON DELETE CASCADE
        )`,
      ];

      let completed = 0;
      let error: Error | null = null;

      statements.forEach((statement) => {
        this.db.run(statement, (err) => {
          if (err && !error) error = err;
          completed++;
          if (completed === statements.length) {
            if (error) reject(error);
            else resolve();
          }
        });
      });
    });
  }

  /**
   * Capture a new thought
   */
  public async capture(
    content: string,
    options: CaptureOptions = {}
  ): Promise<Thought> {
    const config = getConfigManager().getConfig();
    const id = uuidv4();
    const timestamp = new Date().toISOString();

    // Build metadata
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

    // Store in JSONL
    const storagePath = this.getStoragePath(thought);
    await this.saveToJSONL(thought);

    // Index in SQLite
    await this.indexThought(thought, storagePath);

    return thought;
  }

  /**
   * Save thought to JSONL file
   */
  private async saveToJSONL(thought: Thought): Promise<void> {
    return new Promise((resolve, reject) => {
      const jsonLine = JSON.stringify(thought) + '\n';
      fs.appendFile(this.jsonlPath, jsonLine, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Get storage path for thought (checks if should be compressed)
   */
  private getStoragePath(thought: Thought): string {
    return this.jsonlPath;
  }

  /**
   * Index thought in SQLite
   */
  private async indexThought(thought: Thought, storagePath: string): Promise<void> {
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
      const jsonlOffset = 0; // Simplified - in production, track actual offset

      const stmt = this.db.prepare(
        `INSERT OR REPLACE INTO thoughts
        (id, timestamp, topic, confidence, category, emotionalTone, tags, domain, modelVersion, inputLength, outputLength, compressed, version, jsonlOffset)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      stmt.run(
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
        jsonlOffset,
        async (err: Error | null) => {
          if (err) {
            reject(err);
            return;
          }

          // Index tags
          if (tags.length > 0) {
            await this.indexTags(id, tags);
          }

          resolve();
        }
      );
    });
  }

  /**
   * Index tags for a thought
   */
  private async indexTags(thoughtId: string, tags: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(
        `INSERT OR IGNORE INTO thought_tags (thought_id, tag) VALUES (?, ?)`
      );

      let completed = 0;
      let error: Error | null = null;

      tags.forEach((tag) => {
        stmt.run(thoughtId, tag, (err: Error | null) => {
          if (err && !error) error = err;
          completed++;
          if (completed === tags.length) {
            if (error) reject(error);
            else resolve();
          }
        });
      });
    });
  }

  /**
   * Get thought by ID
   */
  public async getThought(id: string): Promise<Thought | null> {
    return new Promise((resolve, reject) => {
      const query = `SELECT * FROM thoughts WHERE id = ?`;
      this.db.get(query, [id], async (err, row: any) => {
        if (err) {
          reject(err);
          return;
        }

        if (!row) {
          resolve(null);
          return;
        }

        // Load full thought from JSONL
        try {
          const thought = await this.loadThoughtFromJSONL(id);
          resolve(thought);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /**
   * Load thought content from JSONL file
   */
  private async loadThoughtFromJSONL(id: string): Promise<Thought | null> {
    return new Promise((resolve, reject) => {
      fs.readFile(this.jsonlPath, 'utf-8', (err: NodeJS.ErrnoException | null, data: string) => {
        if (err) {
          reject(err);
          return;
        }

        const lines = data.split('\n').filter((line) => line.trim());
        for (const line of lines) {
          try {
            const thought: Thought = JSON.parse(line);
            if (thought.id === id) {
              resolve(thought);
              return;
            }
          } catch (e) {
            // Invalid JSON line, skip
          }
        }

        resolve(null);
      });
    });
  }

  /**
   * Get all thoughts (with optional filtering)
   */
  public async getAllThoughts(limit: number = 100, offset: number = 0): Promise<Thought[]> {
    return new Promise((resolve, reject) => {
      const query = `SELECT id FROM thoughts ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
      this.db.all(query, [limit, offset], async (err, rows: any[]) => {
        if (err) {
          reject(err);
          return;
        }

        try {
          const thoughts: Thought[] = [];
          for (const row of rows) {
            const thought = await this.getThought(row.id);
            if (thought) {
              thoughts.push(thought);
            }
          }
          resolve(thoughts);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /**
   * Get thoughts by tag
   */
  public async getThoughtsByTag(tag: string, limit: number = 100): Promise<Thought[]> {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT DISTINCT t.id FROM thoughts t
        JOIN thought_tags tt ON t.id = tt.thought_id
        WHERE tt.tag = ?
        ORDER BY t.timestamp DESC
        LIMIT ?
      `;
      this.db.all(query, [tag, limit], async (err, rows: any[]) => {
        if (err) {
          reject(err);
          return;
        }

        try {
          const thoughts: Thought[] = [];
          for (const row of rows) {
            const thought = await this.getThought(row.id);
            if (thought) {
              thoughts.push(thought);
            }
          }
          resolve(thoughts);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /**
   * Count total thoughts
   */
  public async count(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.db.get(`SELECT COUNT(*) as count FROM thoughts`, (err, row: any) => {
        if (err) reject(err);
        else resolve(row?.count ?? 0);
      });
    });
  }

  /**
   * Close database connection
   */
  public close(): void {
    this.db.close();
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
