/**
 * Tests for Mind Palace
 * Uses isolated temp directories for each test run
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { MindPalace, resetStorageManager, resetConfigManager } from './index';

let mindPalace: MindPalace;
let tempDir: string;

beforeAll(async () => {
  // Create an isolated temp directory for test storage
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mind-palace-test-'));

  // Reset singletons to use the temp directory
  resetConfigManager(tempDir);
  resetStorageManager();

  mindPalace = new MindPalace();
  await mindPalace.initialize();
});

afterAll(() => {
  mindPalace.close();

  // Clean up temp directory
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Best effort cleanup
  }
});

describe('Initialization', () => {
  test('should initialize successfully', async () => {
    const count = await mindPalace.count();
    expect(typeof count).toBe('number');
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should create storage files in temp dir', () => {
    expect(fs.existsSync(path.join(tempDir, 'config.json'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'thoughts.db'))).toBe(true);
  });
});

describe('Thought Capture', () => {
  test('should capture a thought with explicit metadata', async () => {
    const thought = await mindPalace.capture('Test thought content', {
      confidence: 0.8,
      tags: ['test'],
    });

    expect(thought.id).toBeDefined();
    expect(thought.content).toBe('Test thought content');
    expect(thought.metadata.confidence).toBe(0.8);
    expect(thought.metadata.tags).toContain('test');
    expect(thought.timestamp).toBeDefined();
    expect(thought.version).toBe(1);
  });

  test('should capture with auto-metadata extraction', async () => {
    const thought = await mindPalace.captureWithAutoMetadata(
      'This is a great response to the question about optimization'
    );

    expect(thought.metadata.emotionalTone).toBe('positive');
    expect(thought.metadata.category).toBe('response');
    expect(thought.metadata.confidence).toBeGreaterThan(0);
    expect(thought.metadata.confidence).toBeLessThanOrEqual(1);
  });

  test('should detect uncertainty and lower confidence', async () => {
    const thought = await mindPalace.captureWithAutoMetadata(
      'I am not sure, maybe this could work but it is uncertain'
    );

    expect(thought.metadata.confidence).toBeLessThan(0.8);
  });

  test('should detect error category', async () => {
    const thought = await mindPalace.captureWithAutoMetadata(
      'The process failed with an error during execution'
    );

    expect(thought.metadata.category).toBe('error');
  });

  test('should store and retrieve domain and userQuery', async () => {
    const thought = await mindPalace.capture('Domain test', {
      domain: 'backend',
      userQuery: 'How does caching work?',
    });

    expect(thought.source?.domain).toBe('backend');
    expect(thought.source?.userQuery).toBe('How does caching work?');
  });
});

describe('Thought Retrieval', () => {
  test('should retrieve a captured thought by ID', async () => {
    const captured = await mindPalace.capture('Retrieve me by ID');
    const retrieved = await mindPalace.getThought(captured.id);

    expect(retrieved).not.toBeNull();
    expect(retrieved?.content).toBe('Retrieve me by ID');
    expect(retrieved?.id).toBe(captured.id);
  });

  test('should return null for non-existent thought', async () => {
    const result = await mindPalace.getThought('non-existent-id');
    expect(result).toBeNull();
  });

  test('should get all thoughts with limit', async () => {
    const all = await mindPalace.getAllThoughts(100);
    expect(Array.isArray(all)).toBe(true);
    expect(all.length).toBeGreaterThan(0);
  });

  test('should respect pagination offset', async () => {
    const first = await mindPalace.getAllThoughts(2, 0);
    const second = await mindPalace.getAllThoughts(2, 2);

    if (first.length > 0 && second.length > 0) {
      expect(first[0].id).not.toBe(second[0].id);
    }
  });
});

describe('Search', () => {
  beforeAll(async () => {
    // Seed data for search tests
    await mindPalace.capture('The quick brown fox jumps over the lazy dog', {
      tags: ['animals', 'classic'],
      domain: 'literature',
    });
    await mindPalace.capture('Database optimization techniques for PostgreSQL', {
      tags: ['database', 'performance'],
      confidence: 0.95,
      domain: 'backend',
    });
    await mindPalace.capture('React component lifecycle and hooks patterns', {
      tags: ['frontend', 'react'],
      confidence: 0.85,
      domain: 'frontend',
    });
  });

  test('should search by keyword', async () => {
    const results = await mindPalace.search({ keyword: 'fox' });

    expect(results.count).toBeGreaterThan(0);
    expect(results.thoughts.some((t) => t.content.includes('fox'))).toBe(true);
    expect(results.searchType).toBe('keyword');
  });

  test('should search by semantic similarity', async () => {
    const results = await mindPalace.search({
      semantic: 'database query speed improvement',
    });

    expect(results.searchType).toBe('semantic');
  });

  test('should filter by tags', async () => {
    const results = await mindPalace.search({ tags: ['database'] });

    expect(results.count).toBeGreaterThan(0);
    results.thoughts.forEach((t) => {
      expect(t.metadata.tags.some((tag: string) => tag === 'database')).toBe(true);
    });
  });

  test('should filter by minimum confidence', async () => {
    const results = await mindPalace.search({ minConfidence: 0.9 });

    results.thoughts.forEach((t) => {
      expect(t.metadata.confidence).toBeGreaterThanOrEqual(0.9);
    });
  });

  test('should filter by domain', async () => {
    const results = await mindPalace.search({ domain: 'backend' });

    results.thoughts.forEach((t) => {
      expect(t.source?.domain).toBe('backend');
    });
  });

  test('should return empty results for non-matching search', async () => {
    const results = await mindPalace.search({
      keyword: 'xyznonexistenttermxyz',
    });

    expect(results.count).toBe(0);
    expect(results.thoughts).toHaveLength(0);
  });
});

describe('Tag Operations', () => {
  test('should get thoughts by tag', async () => {
    await mindPalace.capture('Tagged for retrieval', {
      tags: ['unique-test-tag'],
    });

    const results = await mindPalace.getThoughtsByTag('unique-test-tag');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].metadata.tags).toContain('unique-test-tag');
  });
});

describe('Configuration', () => {
  test('should return config with all expected fields', () => {
    const config = mindPalace.getConfig();
    expect(config.autoCapture).toBeDefined();
    expect(config.autoRetrieval).toBeDefined();
    expect(config.autoRetrieval.threshold).toBeDefined();
    expect(config.autoRetrieval.maxResults).toBeDefined();
    expect(config.storage).toBeDefined();
    expect(config.storage.compression).toBeDefined();
    expect(config.search).toBeDefined();
    expect(config.search.enableVectorSearch).toBeDefined();
    expect(config.retention).toBeDefined();
  });

  test('should update configuration', () => {
    const originalConfig = mindPalace.getConfig();
    mindPalace.updateConfig({ autoCapture: !originalConfig.autoCapture });

    const updated = mindPalace.getConfig();
    expect(updated.autoCapture).toBe(!originalConfig.autoCapture);

    // Reset
    mindPalace.updateConfig({ autoCapture: originalConfig.autoCapture });
  });

  test('should preserve nested config on partial update', () => {
    const config = mindPalace.getConfig();
    const originalThreshold = config.autoRetrieval.threshold;

    // Update only autoCapture, should not lose autoRetrieval.threshold
    mindPalace.updateConfig({ autoCapture: false });
    const updated = mindPalace.getConfig();

    expect(updated.autoRetrieval.threshold).toBe(originalThreshold);
  });
});

describe('CLI Commands', () => {
  test('should show help', async () => {
    const output = await mindPalace.executeCommand('!mindpalace --help');
    expect(output).toContain('Mind Palace');
    expect(output).toContain('CAPTURE');
    expect(output).toContain('SEARCH');
    expect(output).toContain('FILTERS');
  });

  test('should capture via CLI', async () => {
    const output = await mindPalace.executeCommand(
      '!mindpalace --capture "Test CLI capture"'
    );
    expect(output).toContain('Thought captured');
  });

  test('should search via CLI with keyword', async () => {
    const output = await mindPalace.executeCommand('!mindpalace -k "fox"');
    // Should get results or no results, but not an error
    expect(output).not.toContain('Error');
  });

  test('should show stats', async () => {
    const output = await mindPalace.executeCommand('!mindpalace --stats');
    expect(output).toContain('Mind Palace Statistics');
    expect(output).toContain('Total Thoughts');
  });

  test('should show stats with compression', async () => {
    const output = await mindPalace.executeCommand(
      '!mindpalace --stats --compression'
    );
    expect(output).toContain('Storage & Compression');
  });

  test('should show config', async () => {
    const output = await mindPalace.executeCommand('!mindpalace --config');
    expect(output).toContain('autoCapture');
    expect(output).toContain('autoRetrieval');
  });

  test('should handle empty command as help', async () => {
    const output = await mindPalace.executeCommand('!mindpalace');
    expect(output).toContain('Mind Palace');
  });
});

describe('Count', () => {
  test('should count thoughts accurately', async () => {
    const countBefore = await mindPalace.count();
    await mindPalace.capture('Counting test thought');
    const countAfter = await mindPalace.count();

    expect(countAfter).toBe(countBefore + 1);
  });
});
