import { Thought, SearchResult, SearchOptions, ThoughtCategory, EmotionalTone } from '../types';

/**
 * Metadata filter search engine for Mind Palace
 * Filters thoughts by various metadata criteria
 */
export class FilterSearchEngine {
  /**
   * Apply filters to thoughts
   */
  static async search(
    options: SearchOptions,
    thoughts: Thought[]
  ): Promise<SearchResult> {
    const startTime = performance.now();

    let results = [...thoughts];

    // Apply all filters
    if (options.minConfidence !== undefined) {
      results = results.filter((t) => t.metadata.confidence >= options.minConfidence!);
    }

    if (options.maxConfidence !== undefined) {
      results = results.filter((t) => t.metadata.confidence <= options.maxConfidence!);
    }

    if (options.category) {
      results = results.filter((t) => t.metadata.category === options.category);
    }

    if (options.domain) {
      results = results.filter((t) => t.source?.domain === options.domain);
    }

    if (options.tags && options.tags.length > 0) {
      results = results.filter((t) =>
        options.tags!.some((tag) => t.metadata.tags.includes(tag))
      );
    }

    // Sort results
    if (options.sort === 'recent') {
      results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } else if (options.sort === 'confidence') {
      results.sort((a, b) => b.metadata.confidence - a.metadata.confidence);
    }

    // Apply pagination
    const offset = options.offset || 0;
    const limit = options.limit || 100;
    const paginated = results.slice(offset, offset + limit);

    return {
      thoughts: paginated,
      count: paginated.length,
      totalMatches: results.length,
      executionTime: performance.now() - startTime,
      searchType: 'metadata',
    };
  }

  /**
   * Filter by confidence range
   */
  static async filterByConfidence(
    minConfidence: number,
    maxConfidence: number,
    thoughts: Thought[]
  ): Promise<Thought[]> {
    return thoughts.filter(
      (t) => t.metadata.confidence >= minConfidence && t.metadata.confidence <= maxConfidence
    );
  }

  /**
   * Filter by category
   */
  static async filterByCategory(
    category: ThoughtCategory,
    thoughts: Thought[]
  ): Promise<Thought[]> {
    return thoughts.filter((t) => t.metadata.category === category);
  }

  /**
   * Filter by tone
   */
  static async filterByTone(
    tone: EmotionalTone,
    thoughts: Thought[]
  ): Promise<Thought[]> {
    return thoughts.filter((t) => t.metadata.emotionalTone === tone);
  }

  /**
   * Filter by domain
   */
  static async filterByDomain(domain: string, thoughts: Thought[]): Promise<Thought[]> {
    return thoughts.filter((t) => t.source?.domain === domain);
  }

  /**
   * Filter by tags (any tag in list)
   */
  static async filterByTags(tags: string[], thoughts: Thought[]): Promise<Thought[]> {
    return thoughts.filter((t) => tags.some((tag) => t.metadata.tags.includes(tag)));
  }

  /**
   * Filter by all tags (must have all)
   */
  static async filterByAllTags(tags: string[], thoughts: Thought[]): Promise<Thought[]> {
    return thoughts.filter((t) => tags.every((tag) => t.metadata.tags.includes(tag)));
  }

  /**
   * Get statistics about thoughts
   */
  static async getStatistics(thoughts: Thought[]) {
    const stats = {
      total: thoughts.length,
      averageConfidence: this.getAverageConfidence(thoughts),
      categoryCounts: this.getCategoryCounts(thoughts),
      toneCounts: this.getToneCounts(thoughts),
      tagCounts: this.getTagCounts(thoughts),
      topDomains: this.getTopDomains(thoughts),
    };

    return stats;
  }

  /**
   * Get average confidence
   */
  private static getAverageConfidence(thoughts: Thought[]): number {
    if (thoughts.length === 0) return 0;
    const sum = thoughts.reduce((acc, t) => acc + t.metadata.confidence, 0);
    return sum / thoughts.length;
  }

  /**
   * Count by category
   */
  private static getCategoryCounts(thoughts: Thought[]): Record<string, number> {
    const counts: Record<string, number> = {};
    thoughts.forEach((t) => {
      counts[t.metadata.category] = (counts[t.metadata.category] || 0) + 1;
    });
    return counts;
  }

  /**
   * Count by tone
   */
  private static getToneCounts(thoughts: Thought[]): Record<string, number> {
    const counts: Record<string, number> = {};
    thoughts.forEach((t) => {
      if (t.metadata.emotionalTone) {
        counts[t.metadata.emotionalTone] = (counts[t.metadata.emotionalTone] || 0) + 1;
      }
    });
    return counts;
  }

  /**
   * Count by tags
   */
  private static getTagCounts(thoughts: Thought[]): Record<string, number> {
    const counts: Record<string, number> = {};
    thoughts.forEach((t) => {
      t.metadata.tags.forEach((tag) => {
        counts[tag] = (counts[tag] || 0) + 1;
      });
    });
    return counts;
  }

  /**
   * Get top domains
   */
  private static getTopDomains(thoughts: Thought[]): Record<string, number> {
    const counts: Record<string, number> = {};
    thoughts.forEach((t) => {
      if (t.source?.domain) {
        counts[t.source.domain] = (counts[t.source.domain] || 0) + 1;
      }
    });
    return counts;
  }
}
