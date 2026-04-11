import { Thought, SearchResult } from '../types';

/**
 * Simple semantic search using word embeddings
 * Uses TF-IDF-like scoring for semantic similarity
 */
export class SemanticSearchEngine {
  /**
   * Search thoughts semantically
   */
  static async search(
    query: string,
    thoughts: Thought[],
    sensitivity: number = 0.75
  ): Promise<SearchResult> {
    const startTime = performance.now();

    const queryTokens = this.tokenize(query);
    const queryVocab = this.buildVocabulary(queryTokens);

    // Score each thought
    const scored = thoughts
      .map((thought) => {
        const thoughtTokens = this.tokenize(thought.content);
        const similarity = this.cosineSimilarity(queryVocab, thoughtTokens);
        return { thought, score: similarity };
      })
      .filter(({ score }) => score >= 1 - sensitivity)
      .sort((a, b) => b.score - a.score);

    const results = scored.map(({ thought }) => thought);

    return {
      thoughts: results,
      count: results.length,
      totalMatches: thoughts.length,
      scores: Object.fromEntries(scored.map(({ thought, score }) => [thought.id, score])),
      executionTime: performance.now() - startTime,
      searchType: 'semantic',
    };
  }

  /**
   * Tokenize text into words
   */
  private static tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/\W+/)
      .filter((token) => token.length > 0 && !this.isStopword(token));
  }

  /**
   * Simple stopword list
   */
  private static isStopword(word: string): boolean {
    const stopwords = new Set([
      'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by',
      'for', 'if', 'in', 'into', 'is', 'it',
      'no', 'not', 'of', 'on', 'or', 'such',
      'that', 'the', 'their', 'then', 'there', 'these', 'they', 'this', 'to',
      'was', 'will', 'with', 'has', 'have', 'had', 'do', 'does', 'did',
      'can', 'could', 'would', 'should', 'may', 'might', 'must'
    ]);
    return stopwords.has(word);
  }

  /**
   * Build vocabulary vector from tokens
   */
  private static buildVocabulary(tokens: string[]): Record<string, number> {
    const vocab: Record<string, number> = {};
    tokens.forEach((token) => {
      vocab[token] = (vocab[token] || 0) + 1;
    });
    return vocab;
  }

  /**
   * Calculate cosine similarity between two token sets
   */
  private static cosineSimilarity(
    vec1: Record<string, number>,
    vec2: string[]
  ): number {
    const vocab2 = this.buildVocabulary(vec2);

    let dotProduct = 0;
    let magnitude1 = 0;
    let magnitude2 = 0;

    // Calculate dot product
    for (const word in vec1) {
      if (vocab2[word]) {
        dotProduct += vec1[word] * vocab2[word];
      }
      magnitude1 += vec1[word] * vec1[word];
    }

    // Calculate magnitude of vec2
    for (const word in vocab2) {
      magnitude2 += vocab2[word] * vocab2[word];
    }

    // Avoid division by zero
    if (magnitude1 === 0 || magnitude2 === 0) {
      return 0;
    }

    magnitude1 = Math.sqrt(magnitude1);
    magnitude2 = Math.sqrt(magnitude2);

    return dotProduct / (magnitude1 * magnitude2);
  }

  /**
   * Find semantically related thoughts
   */
  static async findRelated(
    thoughtId: string,
    thought: Thought,
    allThoughts: Thought[],
    limit: number = 10
  ): Promise<SearchResult> {
    const startTime = performance.now();

    const results = await this.search(thought.content,
      allThoughts.filter(t => t.id !== thoughtId),
      0.5
    );

    return {
      ...results,
      thoughts: results.thoughts.slice(0, limit),
      count: Math.min(limit, results.count),
      executionTime: performance.now() - startTime,
      searchType: 'semantic',
    };
  }

  /**
   * Find thoughts similar to a query across multiple fields
   */
  static async searchSimilar(
    query: string,
    thoughts: Thought[],
    weight: { content: number; topic: number; tags: number } = {
      content: 0.6,
      topic: 0.3,
      tags: 0.1,
    }
  ): Promise<SearchResult> {
    const startTime = performance.now();

    const contentSearch = await this.search(query, thoughts, 0.5);
    const topicSearch = await this.search(query, thoughts.map(t => ({
      ...t,
      content: t.metadata.topic || ''
    })), 0.5);

    // Combine scores
    const scores: Record<string, number> = {};

    contentSearch.thoughts.forEach((t) => {
      scores[t.id] = (scores[t.id] || 0) + (contentSearch.scores?.[t.id] || 0) * weight.content;
    });

    topicSearch.thoughts.forEach((t) => {
      scores[t.id] = (scores[t.id] || 0) + (topicSearch.scores?.[t.id] || 0) * weight.topic;
    });

    const results = thoughts
      .filter(t => scores[t.id] !== undefined && scores[t.id] > 0)
      .sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0));

    return {
      thoughts: results,
      count: results.length,
      totalMatches: thoughts.length,
      scores,
      executionTime: performance.now() - startTime,
      searchType: 'semantic',
    };
  }
}
