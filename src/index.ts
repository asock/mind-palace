/**
 * Mind Palace - Clawbot.ai Skill
 * A persistent knowledge capture system that stores thinking and reasoning
 */

import { getStorageManager, StorageManager } from './storage/store';
import { getConfigManager, ConfigManager } from './config/config';
import { ThoughtCapturer } from './capture/capturer';
import { SearchAPI } from './search/search';
import { CLICommandHandler } from './commands/cli';
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

// Export search engines
export { KeywordSearchEngine } from './search/keyword';
export { TemporalSearchEngine } from './search/temporal';
export { FilterSearchEngine } from './search/filters';
export { SemanticSearchEngine } from './search/semantic';

// Export singleton instance
export const mindPalace = new MindPalace();
