import fs from 'fs';
import path from 'path';
import { Thought, SearchResult } from '../types';
import { getConfigManager } from '../config/config';

/**
 * Keyword search engine for Mind Palace
 * Performs exact and fuzzy matching on content and metadata
 */
export class KeywordSearchEngine {
  /**
   * Search thoughts by keywords
   */
  static async search(
    keywords: string[],
    thoughts: Thought[],
    fuzzy: boolean = true
  ): Promise<SearchResult> {
    const startTime = performance.now();

    // Score each thought based on keyword matches
    const scored = thoughts
      .map((thought) => ({
        thought,
        score: this.scoreThought(thought, keywords, fuzzy),
      }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score);

    const results = scored.map(({ thought }) => thought);

    return {
      thoughts: results,
      count: results.length,
      totalMatches: thoughts.length,
      scores: Object.fromEntries(scored.map(({ thought, score }) => [thought.id, score])),
      executionTime: performance.now() - startTime,
      searchType: 'keyword',
    };
  }

  /**
   * Score a thought against keywords
   */
  private static scoreThought(
    thought: Thought,
    keywords: string[],
    fuzzy: boolean
  ): number {
    let score = 0;

    const searchText = this.getSearchableText(thought);
    const lowerSearch = searchText.toLowerCase();

    for (const keyword of keywords) {
      const lowerKeyword = keyword.toLowerCase();

      // Exact match in content
      if (lowerSearch.includes(lowerKeyword)) {
        score += 10;
      }

      // Fuzzy match
      if (fuzzy && this.fuzzyMatch(lowerSearch, lowerKeyword)) {
        score += 5;
      }

      // Metadata matches
      if (thought.metadata.topic?.toLowerCase().includes(lowerKeyword)) {
        score += 8;
      }

      if (thought.metadata.tags?.some((tag) => tag.toLowerCase().includes(lowerKeyword))) {
        score += 6;
      }
    }

    return score;
  }

  /**
   * Get all searchable text from a thought
   */
  private static getSearchableText(thought: Thought): string {
    const parts = [
      thought.content,
      thought.metadata.topic || '',
      thought.metadata.category || '',
      thought.metadata.emotionalTone || '',
      thought.source?.userQuery || '',
      thought.source?.domain || '',
      (thought.metadata.tags || []).join(' '),
    ];

    return parts.filter(Boolean).join(' ');
  }

  /**
   * Simple fuzzy match algorithm
   */
  private static fuzzyMatch(text: string, pattern: string): boolean {
    let patternIdx = 0;

    for (let i = 0; i < text.length; i++) {
      if (text[i] === pattern[patternIdx]) {
        patternIdx++;
      }
      if (patternIdx === pattern.length) {
        return true;
      }
    }

    return false;
  }

  /**
   * Highlight matching keywords in content
   */
  static highlight(content: string, keywords: string[]): string {
    let highlighted = content;

    for (const keyword of keywords) {
      const regex = new RegExp(`(${keyword})`, 'gi');
      highlighted = highlighted.replace(regex, '**$1**');
    }

    return highlighted;
  }
}
