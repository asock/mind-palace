/**
 * Tests for v0.3 features: vector embeddings, semantic search, thinking chains
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  tokenize,
  hashToken,
  embed,
  cosineSimilarity,
  vectorToBuffer,
  bufferToVector,
  DEFAULT_DIMENSION,
} from './search/embeddings';
import { MindPalace, resetStorageManager, resetConfigManager } from './index';
import { getStorageManager } from './storage/store';

describe('Embedding Primitives', () => {
  test('tokenize filters stopwords and short tokens', () => {
    const tokens = tokenize('The quick brown fox jumps over the lazy dog');
    expect(tokens).not.toContain('the');
    expect(tokens).toContain('quick');
    expect(tokens).toContain('brown');
  });

  test('hashToken is deterministic', () => {
    expect(hashToken('hello')).toBe(hashToken('hello'));
    expect(hashToken('hello')).not.toBe(hashToken('world'));
  });

  test('embed produces vectors of correct dimension', () => {
    const vec = embed('some test content');
    expect(vec.length).toBe(DEFAULT_DIMENSION);
  });

  test('embed produces L2-normalized vectors', () => {
    const vec = embed('machine learning and neural networks');
    let norm = 0;
    for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
    expect(Math.sqrt(norm)).toBeCloseTo(1, 4);
  });

  test('empty input returns zero vector', () => {
    const vec = embed('');
    expect(Array.from(vec).every((v) => v === 0)).toBe(true);
  });

  test('cosine similarity is high for related concepts', () => {
    const a = embed('machine learning neural networks deep learning');
    const b = embed('neural networks and deep learning machine');
    expect(cosineSimilarity(a, b)).toBeGreaterThan(0.5);
  });

  test('cosine similarity is low for unrelated concepts', () => {
    const a = embed('baking chocolate chip cookies');
    const b = embed('quantum physics string theory');
    expect(cosineSimilarity(a, b)).toBeLessThan(0.3);
  });

  test('vector buffer roundtrip preserves values', () => {
    const vec = embed('roundtrip test content');
    const buf = vectorToBuffer(vec);
    const restored = bufferToVector(buf);
    expect(restored.length).toBe(vec.length);
    for (let i = 0; i < vec.length; i++) {
      expect(restored[i]).toBeCloseTo(vec[i], 5);
    }
  });
});

describe('Vector Search & Chains', () => {
  let mindPalace: MindPalace;
  let tempDir: string;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-v30-'));
    resetConfigManager(tempDir);
    resetStorageManager();
    mindPalace = new MindPalace();
    await mindPalace.initialize();
  });

  afterAll(() => {
    mindPalace.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('captured thoughts get embeddings automatically', async () => {
    const thought = await mindPalace.capture('distributed systems and consensus algorithms');
    const storage = getStorageManager();
    const results = await storage.vectorSearch('consensus', 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.id === thought.id)).toBe(true);
  });

  test('vector search ranks related content higher than unrelated', async () => {
    await mindPalace.capture('compiler design and type inference systems');
    await mindPalace.capture('chocolate chip cookie recipe with walnuts');
    await mindPalace.capture('type systems in functional programming languages');

    const storage = getStorageManager();
    const results = await storage.vectorSearch('type inference compiler', 5);

    expect(results.length).toBeGreaterThan(0);
    // Top result should mention compiler/type content, not cookies
    const topThought = await mindPalace.getThought(results[0].id);
    expect(topThought?.content.toLowerCase()).toMatch(/type|compiler/);
  });

  test('references create thinking chains', async () => {
    const a = await mindPalace.capture('first insight');
    const b = await mindPalace.capture('building on the first insight', {
      references: [a.id],
    });

    const storage = getStorageManager();
    const refs = await storage.getReferences(b.id);
    expect(refs).toContain(a.id);

    const backlinks = await storage.getBacklinks(a.id);
    expect(backlinks).toContain(b.id);
  });

  test('backfill generates embeddings for thoughts missing them', async () => {
    // Simulate a thought inserted without embedding via direct SQLite manipulation
    const storage = getStorageManager();
    const orphan = await mindPalace.capture('orphan thought for backfill test');

    // Remove its embedding
    await new Promise<void>((resolve, reject) => {
      (storage as any).getDb().run(
        `DELETE FROM thought_embeddings WHERE thought_id = ?`,
        [orphan.id],
        (err: Error | null) => (err ? reject(err) : resolve())
      );
    });

    const countBefore = await storage.vectorSearch('orphan backfill', 10);
    expect(countBefore.some((r) => r.id === orphan.id)).toBe(false);

    const added = await storage.backfillEmbeddings();
    expect(added).toBeGreaterThanOrEqual(1);

    const countAfter = await storage.vectorSearch('orphan backfill', 10);
    expect(countAfter.some((r) => r.id === orphan.id)).toBe(true);
  });

  test('semantic search via public API returns ranked results', async () => {
    await mindPalace.capture('graph database traversal algorithms');
    const result = await mindPalace.search({ semantic: 'graph traversal' });
    expect(result.count).toBeGreaterThan(0);
    expect(result.searchType).toBe('semantic');
  });
});
