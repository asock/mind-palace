/**
 * Tests for v2.1 features: encryption, validation, delete, export/import, retention
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { encrypt, decrypt, getEncryptionKey, resetEncryptionCache } from './storage/encryption';
import { safeParseThought, validateThought, isSafeObject } from './storage/validation';
import { MindPalace, resetStorageManager, resetConfigManager } from './index';
import { CompressionManager } from './storage/compression-manager';

describe('Encryption (AES-256-GCM)', () => {
  let tempDir: string;
  let key: Buffer;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-enc-'));
    resetEncryptionCache();
    key = getEncryptionKey(tempDir);
  });

  afterAll(() => {
    resetEncryptionCache();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('persists key file with 0o600 permissions', () => {
    const keyPath = path.join(tempDir, 'encryption.key');
    expect(fs.existsSync(keyPath)).toBe(true);
    const mode = fs.statSync(keyPath).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  test('generates 256-bit key', () => {
    expect(key.length).toBe(32);
  });

  test('reuses cached key across calls', () => {
    const key2 = getEncryptionKey(tempDir);
    expect(key.equals(key2)).toBe(true);
  });

  test('roundtrip encrypt/decrypt preserves plaintext', () => {
    const plaintext = 'The quick brown fox jumps over the lazy dog';
    const ciphertext = encrypt(plaintext, key);
    expect(decrypt(ciphertext, key)).toBe(plaintext);
  });

  test('different IV per encryption (non-deterministic)', () => {
    const plaintext = 'hello world';
    const a = encrypt(plaintext, key);
    const b = encrypt(plaintext, key);
    expect(a).not.toBe(b);
  });

  test('tampered ciphertext fails authentication', () => {
    const ciphertext = encrypt('sensitive', key);
    const bytes = Buffer.from(ciphertext, 'base64');
    bytes[bytes.length - 1] ^= 0xff;
    const tampered = bytes.toString('base64');
    expect(() => decrypt(tampered, key)).toThrow();
  });

  test('wrong key fails decryption', () => {
    const ciphertext = encrypt('sensitive', key);
    const wrongKey = crypto.randomBytes(32);
    expect(() => decrypt(ciphertext, wrongKey)).toThrow();
  });
});

describe('Schema Validation', () => {
  test('rejects __proto__ pollution attempts', () => {
    const malicious = JSON.parse('{"__proto__":{"polluted":true},"id":"x","timestamp":"2026-01-01","content":"","metadata":{"confidence":0.5,"category":"response","tags":[],"inputLength":0,"outputLength":0}}');
    expect(isSafeObject(malicious)).toBe(false);
  });

  test('rejects constructor pollution attempts', () => {
    const malicious = { constructor: { prototype: { bad: true } } };
    expect(isSafeObject(malicious)).toBe(false);
  });

  test('rejects excessively nested objects', () => {
    let deep: any = {};
    let cursor = deep;
    for (let i = 0; i < 20; i++) {
      cursor.next = {};
      cursor = cursor.next;
    }
    expect(isSafeObject(deep)).toBe(false);
  });

  test('accepts valid thought', () => {
    const valid = {
      id: 'test-id',
      timestamp: '2026-04-17T00:00:00.000Z',
      content: 'hello',
      metadata: {
        confidence: 0.8,
        category: 'response',
        tags: ['a', 'b'],
        inputLength: 5,
        outputLength: 5,
      },
      compressed: false,
      version: 1,
    };
    expect(() => validateThought(valid)).not.toThrow();
  });

  test('safeParseThought returns null for malformed JSON', () => {
    expect(safeParseThought('{not valid json')).toBeNull();
  });

  test('safeParseThought returns null for prototype pollution', () => {
    const payload = '{"__proto__":{"x":1},"id":"a","timestamp":"2026-01-01","content":"","metadata":{"confidence":0.5,"category":"response","tags":[],"inputLength":0,"outputLength":0}}';
    expect(safeParseThought(payload)).toBeNull();
  });

  test('rejects confidence outside [0,1]', () => {
    const invalid = {
      id: 'x',
      timestamp: '2026-01-01T00:00:00Z',
      content: 'x',
      metadata: { confidence: 2.5, category: 'response', tags: [], inputLength: 0, outputLength: 0 },
      compressed: false,
      version: 1,
    };
    expect(() => validateThought(invalid)).toThrow(/confidence/);
  });
});

describe('v2.0 & v2.1 Integration', () => {
  let mindPalace: MindPalace;
  let tempDir: string;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-v21-'));
    resetConfigManager(tempDir);
    resetStorageManager();
    mindPalace = new MindPalace();
    await mindPalace.initialize();
  });

  afterAll(() => {
    mindPalace.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('captured thought persists and retrieves correctly', async () => {
    const thought = await mindPalace.capture('test content for v2.1');
    expect(thought.id).toBeTruthy();

    const retrieved = await mindPalace.getThought(thought.id);
    expect(retrieved?.content).toBe('test content for v2.1');
  });

  test('compression actually persists', async () => {
    const thought = await mindPalace.capture('a'.repeat(2000));

    // Backdate: rewrite JSONL entry with an old timestamp and update SQLite
    const { getStorageManager } = await import('./storage/store');
    const storage = getStorageManager();
    const jsonlPath = path.join(tempDir, 'thoughts.jsonl');
    const lines = fs.readFileSync(jsonlPath, 'utf-8').split('\n').filter(Boolean);
    const rewritten = lines.map((l) => {
      const parsed = JSON.parse(l);
      if (parsed.id === thought.id) {
        parsed.timestamp = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      }
      return JSON.stringify(parsed);
    });
    fs.writeFileSync(jsonlPath, rewritten.join('\n') + '\n', { mode: 0o600 });
    thought.timestamp = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    await storage.updateThought(thought);

    const before = await mindPalace.getThought(thought.id);
    expect(before?.compressed).toBe(false);

    await mindPalace.compressOldThoughts();

    const after = await mindPalace.getThought(thought.id);
    expect(after?.compressed).toBe(true);
  });

  test('retention enforcement prunes low-confidence old thoughts', async () => {
    mindPalace.updateConfig({
      retention: { enabled: true, archiveAfter: 1, pruneLowConfidence: true },
    } as any);

    const lowConf = await mindPalace.capture('low confidence thought', { confidence: 0.1 });
    const { getStorageManager } = await import('./storage/store');
    const storage = getStorageManager();

    // Backdate: rewrite JSONL entry
    const jsonlPath = path.join(tempDir, 'thoughts.jsonl');
    const lines = fs.readFileSync(jsonlPath, 'utf-8').split('\n').filter(Boolean);
    const rewritten = lines.map((l) => {
      const parsed = JSON.parse(l);
      if (parsed.id === lowConf.id) {
        parsed.timestamp = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
      }
      return JSON.stringify(parsed);
    });
    fs.writeFileSync(jsonlPath, rewritten.join('\n') + '\n', { mode: 0o600 });
    lowConf.timestamp = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    await storage.updateThought(lowConf);

    await CompressionManager.enforceRetention();

    const remaining = await mindPalace.getThought(lowConf.id);
    expect(remaining).toBeNull();

    // Restore config
    mindPalace.updateConfig({
      retention: { enabled: true, archiveAfter: 31536000, pruneLowConfidence: false },
    } as any);
  });

  test('executeCommand --export produces importable JSON', async () => {
    const exportPath = path.join(tempDir, 'test-export.json');
    const output = await mindPalace.executeCommand(`!mindpalace --export ${exportPath}`);
    expect(output).toMatch(/Exported/);
    expect(fs.existsSync(exportPath)).toBe(true);

    const parsed = JSON.parse(fs.readFileSync(exportPath, 'utf-8'));
    expect(Array.isArray(parsed.thoughts)).toBe(true);
  });
});
