/**
 * Tests for v0.4 features: JSONL compaction, manifest integrity, metrics.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { MindPalace, resetStorageManager, resetConfigManager } from './index';
import { OperationsManager } from './storage/operations';

describe('Operations Layer', () => {
  let mindPalace: MindPalace;
  let tempDir: string;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-v40-'));
    resetConfigManager(tempDir);
    resetStorageManager();
    mindPalace = new MindPalace();
    await mindPalace.initialize();
  });

  afterAll(() => {
    mindPalace.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('JSONL compaction removes superseded versions', async () => {
    const thought = await mindPalace.capture('original content');
    const jsonlPath = path.join(tempDir, 'thoughts.jsonl');

    // Append two more superseded versions of the same thought
    const withNewContent = { ...thought, content: 'updated content' };
    fs.appendFileSync(jsonlPath, JSON.stringify(withNewContent) + '\n');
    fs.appendFileSync(jsonlPath, JSON.stringify({ ...thought, content: 'final' }) + '\n');

    const before = fs
      .readFileSync(jsonlPath, 'utf-8')
      .split('\n')
      .filter(Boolean).length;
    expect(before).toBeGreaterThanOrEqual(3);

    const result = await OperationsManager.compactJSONL();
    expect(result.removedLines).toBeGreaterThanOrEqual(2);

    const after = fs
      .readFileSync(jsonlPath, 'utf-8')
      .split('\n')
      .filter(Boolean).length;
    expect(after).toBe(before - result.removedLines);

    // Latest version wins
    const retrieved = await mindPalace.getThought(thought.id);
    expect(retrieved?.content).toBe('final');
  });

  test('compaction on empty/missing file is safe', async () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-empty-'));
    resetConfigManager(emptyDir);
    const result = await OperationsManager.compactJSONL();
    expect(result.removedLines).toBe(0);
    expect(result.beforeBytes).toBe(0);

    fs.rmSync(emptyDir, { recursive: true, force: true });
    // Restore original
    resetConfigManager(tempDir);
  });

  test('manifest contains sha256 of storage files', async () => {
    await mindPalace.capture('content for manifest test');

    const { path: manifestPath, files } = await OperationsManager.writeBackupManifest();
    expect(fs.existsSync(manifestPath)).toBe(true);

    expect(files['thoughts.jsonl']).toMatch(/^[a-f0-9]{64}$/);
    expect(files['thoughts.db']).toMatch(/^[a-f0-9]{64}$/);
    expect(files['config.json']).toMatch(/^[a-f0-9]{64}$/);
  });

  test('verify passes immediately after manifest is written', async () => {
    await OperationsManager.writeBackupManifest();
    const mismatches = await OperationsManager.verifyBackupManifest();
    expect(mismatches).toEqual([]);
  });

  test('verify detects tampering', async () => {
    await OperationsManager.writeBackupManifest();

    // Tamper with JSONL
    const jsonlPath = path.join(tempDir, 'thoughts.jsonl');
    fs.appendFileSync(jsonlPath, '\n');

    const mismatches = await OperationsManager.verifyBackupManifest();
    expect(mismatches.length).toBeGreaterThan(0);
    expect(mismatches.some((m) => m.file === 'thoughts.jsonl')).toBe(true);
  });

  test('metrics snapshot reports non-negative values', async () => {
    const metrics = await OperationsManager.collectMetrics();

    expect(metrics.thoughts.total).toBeGreaterThanOrEqual(0);
    expect(metrics.thoughts.compressed).toBeGreaterThanOrEqual(0);
    expect(metrics.thoughts.encrypted).toBeGreaterThanOrEqual(0);
    expect(metrics.storage.jsonlBytes).toBeGreaterThan(0);
    expect(metrics.storage.dbBytes).toBeGreaterThan(0);
    expect(metrics.performance.captureLatencyMs).toBeGreaterThan(0);
    expect(metrics.performance.searchLatencyMs).toBeGreaterThanOrEqual(0);
  });

  test('metrics benchmark thought does not pollute storage', async () => {
    const countBefore = await mindPalace.count();
    await OperationsManager.collectMetrics();
    const countAfter = await mindPalace.count();
    expect(countAfter).toBe(countBefore);
  });
});
