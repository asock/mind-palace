/**
 * Mind Palace - Clawbot.ai Skill
 * A persistent knowledge capture system that stores thinking and reasoning
 */

import { getStorageManager, StorageManager } from './storage/store';
import { getConfigManager, ConfigManager } from './config/config';
import { ThoughtCapturer } from './capture/capturer';
import { SearchAPI } from './search/search';
import { CLICommandHandler } from './commands/cli';
import { AutoRetrieval } from './retrieval/auto-retrieval';
import { CompressionManager } from './storage/compression-manager';
import * as types from './types';

/**
 * Main Mind Palace API
 */
export class MindPalace {
  private storage: StorageManager;
  private config: ConfigManager;
  private initialized: boolean = false;

  constructor() {
    this.storage = getStorageManager();
    this.config = getConfigManager();
  }

  /**
   * Initialize Mind Palace
   */
  public async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.storage.initialize();
    this.initialized = true;
  }

  /**
   * Capture a thought
   */
  public async capture(
    content: string,
    options?: types.CaptureOptions
  ): Promise<types.Thought> {
    await this.initialize();
    return ThoughtCapturer.capture(content, options);
  }

  /**
   * Capture with auto-metadata extraction
   */
  public async captureWithAutoMetadata(
    content: string,
    userQuery?: string,
    options?: types.CaptureOptions
  ): Promise<types.Thought> {
    await this.initialize();
    return ThoughtCapturer.captureWithAutoMetadata(content, userQuery, options);
  }

  /**
   * Get a thought by ID
   */
  public async getThought(id: string): Promise<types.Thought | null> {
    await this.initialize();
    return this.storage.getThought(id);
  }

  /**
   * Get all thoughts
   */
  public async getAllThoughts(
    limit?: number,
    offset?: number
  ): Promise<types.Thought[]> {
    await this.initialize();
    return this.storage.getAllThoughts(limit, offset);
  }

  /**
   * Get thoughts by tag
   */
  public async getThoughtsByTag(tag: string, limit?: number): Promise<types.Thought[]> {
    await this.initialize();
    return this.storage.getThoughtsByTag(tag, limit);
  }

  /**
   * Get configuration
   */
  public getConfig(): types.MindPalaceConfig {
    return this.config.getConfig();
  }

  /**
   * Update configuration
   */
  public updateConfig(updates: Partial<types.MindPalaceConfig>): void {
    this.config.update(updates);
  }

  /**
   * Search thoughts
   */
  public async search(options: types.SearchOptions): Promise<types.SearchResult> {
    await this.initialize();
    return SearchAPI.search(options);
  }

  /**
   * Execute CLI command
   */
  public async executeCommand(command: string): Promise<string> {
    await this.initialize();
    return CLICommandHandler.execute(command);
  }

  /**
   * Get related thoughts with auto-retrieval
   */
  public async getRelatedThoughts(thought: types.Thought): Promise<types.Thought[]> {
    await this.initialize();
    const allThoughts = await this.storage.getAllThoughts(10000, 0);
    return AutoRetrieval.getRelatedThoughts(thought, allThoughts);
  }

  /**
   * Format related thoughts for display
   */
  public formatRelatedThoughts(
    thoughts: types.Thought[],
    mode: 'full' | 'summary' | 'brief' = 'summary'
  ): string {
    return AutoRetrieval.formatRelatedThoughts(thoughts, mode);
  }

  /**
   * Analyze similar thoughts and get suggestions
   */
  public async analyzeSimilarThoughts(
    thought: types.Thought
  ): Promise<{
    similar: types.Thought[];
    patterns: string[];
    suggestions: string[];
  }> {
    await this.initialize();
    const allThoughts = await this.storage.getAllThoughts(10000, 0);
    return AutoRetrieval.analyzeSimilarThoughts(thought, allThoughts);
  }

  /**
   * Get compression statistics
   */
  public async getCompressionStats(): Promise<{
    thoughts: number;
    estimatedSize: string;
    estimatedCompressed: string;
    savings: string;
  }> {
    await this.initialize();
    const stats = await CompressionManager.estimateStorageUsage();
    return {
      thoughts: stats.thoughts,
      estimatedSize: CompressionManager.formatBytes(stats.estimatedSize),
      estimatedCompressed: CompressionManager.formatBytes(stats.estimatedCompressed),
      savings: CompressionManager.formatBytes(stats.savings),
    };
  }

  /**
   * Manually trigger batch compression
   */
  public async compressOldThoughts(): Promise<{ compressed: number; freed: number }> {
    await this.initialize();
    return CompressionManager.compressOldThoughts();
  }

  /**
   * Count total thoughts
   */
  public async count(): Promise<number> {
    await this.initialize();
    return this.storage.count();
  }

  /**
   * Close Mind Palace
   */
  public close(): void {
    this.storage.close();
  }
}

// Export types
export * from './types';
export { StorageManager } from './storage/store';
export { ConfigManager } from './config/config';
export { ThoughtCapturer };
export { SearchAPI };
export { CLICommandHandler };
export { AutoRetrieval };
export { CompressionManager };

// Export search engines
export { KeywordSearchEngine } from './search/keyword';
export { TemporalSearchEngine } from './search/temporal';
export { FilterSearchEngine } from './search/filters';
export { SemanticSearchEngine } from './search/semantic';

// Export compression utilities
export { compress, decompress } from './storage/compression';

// Export singleton instance
export const mindPalace = new MindPalace();
