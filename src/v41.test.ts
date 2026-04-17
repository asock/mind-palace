/**
 * Tests for v0.4 resilience: index rebuild, config validation, logger.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { MindPalace, resetStorageManager, resetConfigManager, logger } from './index';

describe('Index Rebuild (disaster recovery)', () => {
  let mindPalace: MindPalace;
  let tempDir: string;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-v41a-'));
    resetConfigManager(tempDir);
    resetStorageManager();
    mindPalace = new MindPalace();
    await mindPalace.initialize();
  });

  afterAll(() => {
    mindPalace.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('rebuildIndex restores DB from JSONL', async () => {
    const a = await mindPalace.capture('first thought for rebuild');
    const b = await mindPalace.capture('second thought for rebuild');

    const countBefore = await mindPalace.count();
    expect(countBefore).toBeGreaterThanOrEqual(2);

    const reindexed = await mindPalace.rebuildIndex();
    expect(reindexed).toBe(countBefore);

    const foundA = await mindPalace.getThought(a.id);
    const foundB = await mindPalace.getThought(b.id);
    expect(foundA?.id).toBe(a.id);
    expect(foundB?.id).toBe(b.id);
  });

  test('rebuildIndex is idempotent', async () => {
    const first = await mindPalace.rebuildIndex();
    const second = await mindPalace.rebuildIndex();
    expect(first).toBe(second);
  });

  test('after rebuild, embeddings are re-populated', async () => {
    const thought = await mindPalace.capture('searchable rebuild content: quantum mechanics');
    await mindPalace.rebuildIndex();

    const result = await mindPalace.search({ semantic: 'quantum' });
    expect(result.count).toBeGreaterThan(0);
    expect(result.thoughts.some((t) => t.id === thought.id)).toBe(true);
  });
});

describe('Config Safety', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-v41b-'));
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('config loader ignores prototype pollution attempts', () => {
    const configPath = path.join(tempDir, 'config.json');
    // Write a config with __proto__ pollution
    const malicious = '{"__proto__":{"polluted":true},"autoCapture":false}';
    fs.writeFileSync(configPath, malicious);

    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const cfg = resetConfigManager(tempDir).getConfig();
    warn.mockRestore();

    // Defaults should load because malicious config is rejected
    expect(cfg.autoCapture).toBe(true);
    expect(({} as any).polluted).toBeUndefined();
  });
});

describe('Structured Logger', () => {
  test('respects log level threshold', () => {
    const prev = process.env.MIND_PALACE_LOG_LEVEL;
    process.env.MIND_PALACE_LOG_LEVEL = 'error';

    const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    logger.debug('hidden');
    logger.info('hidden');
    logger.warn('hidden');
    logger.error('shown');

    expect(debugSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();

    debugSpy.mockRestore();
    infoSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();

    if (prev === undefined) delete process.env.MIND_PALACE_LOG_LEVEL;
    else process.env.MIND_PALACE_LOG_LEVEL = prev;
  });

  test('includes metadata in log output', () => {
    const prev = process.env.MIND_PALACE_LOG_LEVEL;
    process.env.MIND_PALACE_LOG_LEVEL = 'debug';

    const spy = jest.spyOn(console, 'debug').mockImplementation(() => {});
    logger.debug('test-message', { thoughtId: 'abc123' });
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0][0]).toContain('thoughtId');
    expect(spy.mock.calls[0][0]).toContain('abc123');

    spy.mockRestore();
    if (prev === undefined) delete process.env.MIND_PALACE_LOG_LEVEL;
    else process.env.MIND_PALACE_LOG_LEVEL = prev;
  });
});
