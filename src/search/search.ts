import { Thought, SearchResult, SearchOptions, SearchType } from '../types';
import { KeywordSearchEngine } from './keyword';
import { TemporalSearchEngine } from './temporal';
import { FilterSearchEngine } from './filters';
import { SemanticSearchEngine } from './semantic';
import { getStorageManager } from '../storage/store';
import { getConfigManager } from '../config/config';

/**
 * Main search API for Mind Palace
 * Combines multiple search strategies
 */
export class SearchAPI {
  /**
   * Execute search with combined results
   */
  static async search(options: SearchOptions): Promise<SearchResult> {
    const storage = getStorageManager();
    const config = getConfigManager().getConfig();

    // Validate input bounds
    if (options.limit !== undefined) {
      options.limit = Math.max(1, Math.min(10000, options.limit));
    }
    if (options.offset !== undefined) {
      options.offset = Math.max(0, options.offset);
    }
    if (options.minConfidence !== undefined) {
      options.minConfidence = Math.max(0, Math.min(1, options.minConfidence));
    }
    if (options.maxConfidence !== undefined) {
      options.maxConfidence = Math.max(0, Math.min(1, options.maxConfidence));
    }

    // Get all thoughts
    const allThoughts = await storage.getAllThoughts(10000, 0);

    // Route to appropriate search engine
    if (options.keyword) {
      return this.keywordSearch(options.keyword, allThoughts);
    }

    if (options.semantic && config.search.enableVectorSearch) {
      return this.semanticSearch(options.semantic, allThoughts, config.search.semanticSensitivity);
    }

    if (options.timeRange) {
      return this.temporalSearch(options.timeRange.start, options.timeRange.end, allThoughts);
    }

    if (options.relatedTo) {
      const thought = await storage.getThought(options.relatedTo);
      if (thought) {
        return this.relatedSearch(options.relatedTo, thought, allThoughts);
      }
    }

    // Default to filter search
    return FilterSearchEngine.search(options, allThoughts);
  }

  /**
   * Keyword search
   */
  static async keywordSearch(query: string, thoughts: Thought[]): Promise<SearchResult> {
    const keywords = query.split(/\s+/).filter((k) => k.length > 0);
    return KeywordSearchEngine.search(keywords, thoughts);
  }

  /**
   * Semantic search using persisted vector embeddings when available,
   * falling back to token-based similarity otherwise.
   */
  static async semanticSearch(
    query: string,
    thoughts: Thought[],
    sensitivity: number = 0.75
  ): Promise<SearchResult> {
    const startTime = performance.now();
    const storage = getStorageManager();

    try {
      const ranked = await storage.vectorSearch(query, 100);
      if (ranked.length > 0) {
        const byId = new Map(thoughts.map((t) => [t.id, t]));
        const minScore = 1 - sensitivity;
        const hits = ranked
          .filter((r) => r.score >= minScore && byId.has(r.id))
          .map((r) => ({ thought: byId.get(r.id)!, score: r.score }));

        return {
          thoughts: hits.map((h) => h.thought),
          count: hits.length,
          totalMatches: thoughts.length,
          scores: Object.fromEntries(hits.map((h) => [h.thought.id, h.score])),
          executionTime: performance.now() - startTime,
          searchType: 'semantic',
        };
      }
    } catch (err) {
      console.warn('Vector search failed, falling back to token similarity:', err);
    }

    return SemanticSearchEngine.searchSimilar(query, thoughts);
  }

  /**
   * Temporal search
   */
  static async temporalSearch(
    startDate: Date,
    endDate: Date,
    thoughts: Thought[]
  ): Promise<SearchResult> {
    return TemporalSearchEngine.search(startDate, endDate, thoughts);
  }

  /**
   * Find related thoughts
   */
  static async relatedSearch(
    thoughtId: string,
    thought: Thought,
    allThoughts: Thought[]
  ): Promise<SearchResult> {
    return SemanticSearchEngine.findRelated(thoughtId, thought, allThoughts);
  }

  /**
   * Complex query parsing and execution
   */
  static async executeQuery(query: string): Promise<SearchResult> {
    const options = this.parseQuery(query);
    return this.search(options);
  }

  /**
   * Parse complex query string
   * Examples:
   *   "database optimization"
   *   "tag:important confidence:>0.8"
   *   "domain:backend time:last-7-days"
   *   "category:error tone:negative"
   */
  private static parseQuery(query: string): SearchOptions {
    const options: SearchOptions = {};

    // Split by spaces but respect quoted strings
    const parts = query.match(/"[^"]*"|'[^']*'|\S+/g) || [];

    for (const part of parts) {
      const cleanPart = part.replace(/^["']|["']$/g, '');

      // Parse key:value pairs
      const [key, ...valueParts] = cleanPart.split(':');
      const value = valueParts.join(':');

      if (value) {
        // Specific key-value queries
        switch (key.toLowerCase()) {
          case 'tag':
          case 'tags':
            options.tags = value.split(',').map((t) => t.trim());
            break;

          case 'category':
          case 'cat':
            options.category = value as any;
            break;

          case 'domain':
            options.domain = value;
            break;

          case 'confidence':
          case 'conf':
            this.parseConfidenceRange(value, options);
            break;

          case 'time':
          case 'date':
            const parsed = TemporalSearchEngine.parseTimeRange(value);
            if (parsed) {
              options.timeRange = parsed;
            }
            break;

          case 'tone':
            options.query = value; // Store for later processing
            break;

          case 'limit':
            options.limit = parseInt(value);
            break;

          case 'offset':
            options.offset = parseInt(value);
            break;

          case 'sort':
            options.sort = value as any;
            break;

          default:
            // Treat as keyword search
            options.keyword = cleanPart;
        }
      } else {
        // No value, treat as keyword
        if (!options.keyword) {
          options.keyword = cleanPart;
        } else {
          options.keyword += ' ' + cleanPart;
        }
      }
    }

    return options;
  }

  /**
   * Parse confidence range (e.g., ">0.8", "0.5-0.9", ">=0.8")
   */
  private static parseConfidenceRange(value: string, options: SearchOptions): void {
    if (value.includes('-') && !value.startsWith('>') && !value.startsWith('<')) {
      const [min, max] = value.split('-').map((v) => parseFloat(v.trim()));
      if (!isNaN(min)) options.minConfidence = Math.max(0, Math.min(1, min));
      if (!isNaN(max)) options.maxConfidence = Math.max(0, Math.min(1, max));
    } else if (value.startsWith('>=')) {
      const val = parseFloat(value.substring(2));
      if (!isNaN(val)) options.minConfidence = Math.max(0, Math.min(1, val));
    } else if (value.startsWith('<=')) {
      const val = parseFloat(value.substring(2));
      if (!isNaN(val)) options.maxConfidence = Math.max(0, Math.min(1, val));
    } else if (value.startsWith('>')) {
      const val = parseFloat(value.substring(1));
      if (!isNaN(val)) options.minConfidence = Math.max(0, Math.min(1, val));
    } else if (value.startsWith('<')) {
      const val = parseFloat(value.substring(1));
      if (!isNaN(val)) options.maxConfidence = Math.max(0, Math.min(1, val));
    }
  }

  /**
   * Get search statistics
   */
  static async getStatistics(): Promise<any> {
    const storage = getStorageManager();
    const thoughts = await storage.getAllThoughts(10000, 0);
    return FilterSearchEngine.getStatistics(thoughts);
  }
}

export default SearchAPI;
