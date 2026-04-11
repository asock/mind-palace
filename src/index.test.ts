/**
 * Basic tests for Mind Palace
 */

import { MindPalace } from './index';

describe('MindPalace', () => {
  let mindPalace: MindPalace;

  beforeAll(async () => {
    mindPalace = new MindPalace();
    await mindPalace.initialize();
  });

  afterAll(() => {
    mindPalace.close();
  });

  test('should initialize successfully', async () => {
    const count = await mindPalace.count();
    expect(typeof count).toBe('number');
  });

  test('should capture a thought', async () => {
    const thought = await mindPalace.capture('Test thought content', {
      confidence: 0.8,
      tags: ['test'],
    });

    expect(thought.id).toBeDefined();
    expect(thought.content).toBe('Test thought content');
    expect(thought.metadata.confidence).toBe(0.8);
    expect(thought.metadata.tags).toContain('test');
  });

  test('should capture with auto-metadata', async () => {
    const thought = await mindPalace.captureWithAutoMetadata(
      'This is a great response to the question about optimization'
    );

    expect(thought.metadata.emotionalTone).toBe('positive');
    expect(thought.metadata.category).toBe('response');
  });

  test('should retrieve a captured thought', async () => {
    const captured = await mindPalace.capture('Test retrieval');
    const retrieved = await mindPalace.getThought(captured.id);

    expect(retrieved).not.toBeNull();
    expect(retrieved?.content).toBe('Test retrieval');
    expect(retrieved?.id).toBe(captured.id);
  });

  test('should search by keyword', async () => {
    await mindPalace.capture('The quick brown fox jumps', {
      tags: ['animals'],
    });

    const results = await mindPalace.search({
      keyword: 'fox',
    });

    expect(results.count).toBeGreaterThan(0);
    expect(results.thoughts.some((t) => t.content.includes('fox'))).toBe(true);
  });

  test('should filter by tags', async () => {
    await mindPalace.capture('Tagged thought', {
      tags: ['important', 'urgent'],
    });

    const results = await mindPalace.search({
      tags: ['important'],
    });

    expect(results.count).toBeGreaterThan(0);
  });

  test('should get all thoughts', async () => {
    const all = await mindPalace.getAllThoughts(100);
    expect(Array.isArray(all)).toBe(true);
    expect(all.length).toBeGreaterThanOrEqual(0);
  });

  test('should get configuration', () => {
    const config = mindPalace.getConfig();
    expect(config.autoCapture).toBeDefined();
    expect(config.storage).toBeDefined();
    expect(config.search).toBeDefined();
  });

  test('should update configuration', () => {
    const originalConfig = mindPalace.getConfig();
    mindPalace.updateConfig({
      autoCapture: !originalConfig.autoCapture,
    });

    const updated = mindPalace.getConfig();
    expect(updated.autoCapture).toBe(!originalConfig.autoCapture);

    // Reset
    mindPalace.updateConfig({
      autoCapture: originalConfig.autoCapture,
    });
  });

  test('should execute CLI command - help', async () => {
    const output = await mindPalace.executeCommand('!mindpalace --help');
    expect(output).toContain('Mind Palace');
    expect(output).toContain('CAPTURE');
    expect(output).toContain('SEARCH');
  });

  test('should execute CLI command - capture', async () => {
    const output = await mindPalace.executeCommand(
      '!mindpalace --capture "Test CLI capture"'
    );
    expect(output).toContain('✨ Thought captured');
  });
});
