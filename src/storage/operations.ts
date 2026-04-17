import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getConfigManager } from '../config/config';
import { getStorageManager } from './store';
import { safeParseThought } from './validation';
import { Thought } from '../types';

/**
 * Operational tooling for Mind Palace:
 *   - JSONL compaction (collapse superseded versions)
 *   - Backup integrity via SHA-256 manifest
 *   - Storage metrics
 */
export class OperationsManager {
  /**
   * Compact the JSONL log by rewriting it with only the latest version of each thought.
   * Returns { removedLines, beforeBytes, afterBytes }.
   */
  static async compactJSONL(): Promise<{
    removedLines: number;
    beforeBytes: number;
    afterBytes: number;
  }> {
    const storageDir = getConfigManager().getStorageDir();
    const jsonlPath = path.join(storageDir, 'thoughts.jsonl');

    if (!fs.existsSync(jsonlPath)) {
      return { removedLines: 0, beforeBytes: 0, afterBytes: 0 };
    }

    const beforeBytes = fs.statSync(jsonlPath).size;
    const raw = fs.readFileSync(jsonlPath, 'utf-8');
    const lines = raw.split('\n').filter(Boolean);

    // Last-write-wins per id
    const latest = new Map<string, Thought>();
    let invalidCount = 0;
    for (const line of lines) {
      const parsed = safeParseThought(line);
      if (parsed) {
        latest.set(parsed.id, parsed);
      } else {
        invalidCount++;
      }
    }

    const deduped = Array.from(latest.values());
    const output = deduped.map((t) => JSON.stringify(t)).join('\n') + (deduped.length ? '\n' : '');

    // Atomic rewrite: write to temp then rename
    const tempPath = jsonlPath + '.compact.tmp';
    fs.writeFileSync(tempPath, output, { mode: 0o600 });
    fs.renameSync(tempPath, jsonlPath);

    const afterBytes = fs.statSync(jsonlPath).size;
    const removedLines = lines.length - deduped.length + invalidCount;

    if (removedLines > 0) {
      console.log(
        `Compacted JSONL: removed ${removedLines} lines, ${beforeBytes} → ${afterBytes} bytes`
      );
    }

    return { removedLines, beforeBytes, afterBytes };
  }

  /**
   * Compute SHA-256 of a file, streaming to avoid loading it in memory.
   */
  static async hashFile(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * Generate a backup manifest mapping storage files → sha256 digests.
   * Written to <storageDir>/manifest.json with 0o600 permissions.
   */
  static async writeBackupManifest(): Promise<{
    path: string;
    files: Record<string, string>;
  }> {
    const storageDir = getConfigManager().getStorageDir();
    const candidates = ['thoughts.jsonl', 'thoughts.db', 'config.json'];
    const files: Record<string, string> = {};

    for (const name of candidates) {
      const filePath = path.join(storageDir, name);
      if (fs.existsSync(filePath)) {
        files[name] = await this.hashFile(filePath);
      }
    }

    const manifest = {
      version: 1,
      generatedAt: new Date().toISOString(),
      files,
    };

    const manifestPath = path.join(storageDir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), { mode: 0o600 });

    return { path: manifestPath, files };
  }

  /**
   * Verify storage files against a manifest. Returns list of mismatches (empty = pass).
   */
  static async verifyBackupManifest(
    manifestPath?: string
  ): Promise<Array<{ file: string; expected: string; actual: string | null }>> {
    const storageDir = getConfigManager().getStorageDir();
    const resolved = manifestPath || path.join(storageDir, 'manifest.json');

    if (!fs.existsSync(resolved)) {
      throw new Error(`Manifest not found: ${resolved}`);
    }

    const manifest = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
    const mismatches: Array<{ file: string; expected: string; actual: string | null }> = [];

    for (const [name, expected] of Object.entries(manifest.files as Record<string, string>)) {
      const filePath = path.join(storageDir, name);
      if (!fs.existsSync(filePath)) {
        mismatches.push({ file: name, expected, actual: null });
        continue;
      }
      const actual = await this.hashFile(filePath);
      if (actual !== expected) {
        mismatches.push({ file: name, expected, actual });
      }
    }

    return mismatches;
  }

  /**
   * Collect operational metrics snapshot for observability.
   */
  static async collectMetrics(): Promise<{
    thoughts: { total: number; compressed: number; encrypted: number };
    storage: { jsonlBytes: number; dbBytes: number };
    performance: { captureLatencyMs: number; searchLatencyMs: number };
  }> {
    const storage = getStorageManager();
    const storageDir = getConfigManager().getStorageDir();

    const total = await storage.count();
    const allThoughts = await storage.getAllThoughts(100000, 0);
    const compressed = allThoughts.filter((t) => t.compressed).length;
    const encrypted = allThoughts.filter((t) => t.encrypted).length;

    const jsonlPath = path.join(storageDir, 'thoughts.jsonl');
    const dbPath = path.join(storageDir, 'thoughts.db');
    const jsonlBytes = fs.existsSync(jsonlPath) ? fs.statSync(jsonlPath).size : 0;
    const dbBytes = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;

    // Benchmark one capture + one search to produce latency samples
    const capStart = performance.now();
    const benchmark = await storage.capture('__metrics_benchmark__', {
      tags: ['__metrics__'],
      confidence: 0.01,
    });
    const captureLatencyMs = performance.now() - capStart;

    const searchStart = performance.now();
    await storage.vectorSearch('benchmark', 5);
    const searchLatencyMs = performance.now() - searchStart;

    // Clean up benchmark thought
    await storage.deleteThought(benchmark.id).catch(() => {});

    return {
      thoughts: { total, compressed, encrypted },
      storage: { jsonlBytes, dbBytes },
      performance: { captureLatencyMs, searchLatencyMs },
    };
  }
}

export default OperationsManager;
