import { Thought, SearchResult } from '../types';

/**
 * Temporal search engine for Mind Palace
 * Searches by date ranges and time-based queries
 */
export class TemporalSearchEngine {
  /**
   * Search thoughts by date range
   */
  static async search(
    startDate: Date,
    endDate: Date,
    thoughts: Thought[]
  ): Promise<SearchResult> {
    const startTime = performance.now();

    const results = thoughts
      .filter((thought) => {
        const thoughtDate = new Date(thought.timestamp);
        return thoughtDate >= startDate && thoughtDate <= endDate;
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return {
      thoughts: results,
      count: results.length,
      totalMatches: thoughts.length,
      executionTime: performance.now() - startTime,
      searchType: 'temporal',
    };
  }

  /**
   * Get thoughts from the last N days
   */
  static async searchLastDays(days: number, thoughts: Thought[]): Promise<SearchResult> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return this.search(startDate, endDate, thoughts);
  }

  /**
   * Get thoughts from the last N hours
   */
  static async searchLastHours(hours: number, thoughts: Thought[]): Promise<SearchResult> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setHours(startDate.getHours() - hours);

    return this.search(startDate, endDate, thoughts);
  }

  /**
   * Get thoughts from specific date
   */
  static async searchByDate(date: Date, thoughts: Thought[]): Promise<SearchResult> {
    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

    return this.search(startDate, endDate, thoughts);
  }

  /**
   * Get most recent thoughts
   */
  static async searchRecent(count: number, thoughts: Thought[]): Promise<SearchResult> {
    const startTime = performance.now();

    const results = thoughts
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, count);

    return {
      thoughts: results,
      count: results.length,
      totalMatches: thoughts.length,
      executionTime: performance.now() - startTime,
      searchType: 'temporal',
    };
  }

  /**
   * Parse human-readable time range (e.g., "last 7 days", "2026-04-01 to 2026-04-11")
   */
  static parseTimeRange(rangeString: string): { start: Date; end: Date } | null {
    // Parse "last N days/hours/weeks"
    const lastMatch = rangeString.match(/last\s+(\d+)\s+(days?|hours?|weeks?)/i);
    if (lastMatch) {
      const amount = parseInt(lastMatch[1]);
      const unit = lastMatch[2].toLowerCase();

      const endDate = new Date();
      const startDate = new Date();

      if (unit.startsWith('day')) {
        startDate.setDate(startDate.getDate() - amount);
      } else if (unit.startsWith('hour')) {
        startDate.setHours(startDate.getHours() - amount);
      } else if (unit.startsWith('week')) {
        startDate.setDate(startDate.getDate() - amount * 7);
      }

      return { start: startDate, end: endDate };
    }

    // Parse "YYYY-MM-DD to YYYY-MM-DD"
    const rangeMatch = rangeString.match(/(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})/i);
    if (rangeMatch) {
      const start = new Date(rangeMatch[1]);
      const end = new Date(rangeMatch[2]);
      end.setHours(23, 59, 59, 999);

      return { start, end };
    }

    // Parse single date
    const dateMatch = rangeString.match(/(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      const date = new Date(dateMatch[1]);
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);

      return { start, end };
    }

    return null;
  }
}
