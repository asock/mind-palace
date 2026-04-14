import { Thought, SearchResult } from '../types';
import { SearchAPI } from '../search/search';
import { SemanticSearchEngine } from '../search/semantic';
import { getConfigManager } from '../config/config';

/**
 * Auto-retrieval system for Mind Palace
 * Automatically surfaces related thoughts after responses
 */
export class AutoRetrieval {
  /**
   * Get related thoughts for a given response
   * Uses configuration thresholds to filter results
   */
  static async getRelatedThoughts(
    thought: Thought,
    allThoughts: Thought[]
  ): Promise<Thought[]> {
    const config = getConfigManager().getConfig();

    if (!config.autoRetrieval.enabled) {
      return [];
    }

    // Search for semantically related thoughts
    const results = await SemanticSearchEngine.findRelated(
      thought.id,
      thought,
      allThoughts,
      config.autoRetrieval.maxResults
    );

    // Filter by threshold
    const filtered = results.thoughts.filter((t) => {
      const score = results.scores?.[t.id] || 0;
      return score >= config.autoRetrieval.threshold;
    });

    return filtered;
  }

  /**
   * Format related thoughts for display
   */
  static formatRelatedThoughts(
    thoughts: Thought[],
    mode: 'full' | 'summary' | 'brief' = 'summary'
  ): string {
    if (thoughts.length === 0) {
      return '';
    }

    let output = '\n💡 Similar past thinking:\n━━━━━━━━━━━━━━━━━━━\n';

    thoughts.forEach((thought, index) => {
      switch (mode) {
        case 'brief':
          output += `${index + 1}. ${thought.metadata.topic || 'Untitled'}\n`;
          break;

        case 'summary':
          output += `${index + 1}. ${thought.metadata.topic || 'Untitled'}\n`;
          output += `   Date: ${new Date(thought.timestamp).toLocaleDateString()}\n`;
          output += `   Category: ${thought.metadata.category}\n`;
          break;

        case 'full':
          output += `${index + 1}. ${thought.metadata.topic || 'Untitled'}\n`;
          output += `   ID: ${thought.id}\n`;
          output += `   Date: ${new Date(thought.timestamp).toLocaleString()}\n`;
          output += `   Category: ${thought.metadata.category}\n`;
          output += `   Confidence: ${(thought.metadata.confidence * 100).toFixed(0)}%\n`;
          if (thought.metadata.tags.length > 0) {
            output += `   Tags: ${thought.metadata.tags.join(', ')}\n`;
          }
          output += `   Content: ${thought.content.substring(0, 150)}${
            thought.content.length > 150 ? '...' : ''
          }\n`;
          break;
      }

      output += '\n';
    });

    return output.trim();
  }

  /**
   * Analyze a new thought and suggest improvements based on past thinking
   */
  static async analyzeSimilarThoughts(
    thought: Thought,
    allThoughts: Thought[]
  ): Promise<{
    similar: Thought[];
    patterns: string[];
    suggestions: string[];
  }> {
    const config = getConfigManager().getConfig();
    const similar = await this.getRelatedThoughts(thought, allThoughts);

    // Analyze patterns
    const patterns: string[] = [];
    const suggestions: string[] = [];

    if (similar.length === 0) {
      return { similar, patterns, suggestions };
    }

    // Pattern 1: Confidence trend
    const avgConfidence =
      similar.reduce((acc, t) => acc + t.metadata.confidence, 0) /
      similar.length;

    if (thought.metadata.confidence < avgConfidence - 0.2) {
      suggestions.push(
        `Your confidence (${(thought.metadata.confidence * 100).toFixed(0)}%) is lower than similar past thoughts (${(avgConfidence * 100).toFixed(0)}%). Consider reviewing relevant past thinking.`
      );
    }

    if (thought.metadata.confidence > avgConfidence + 0.2) {
      patterns.push('High confidence - Higher than similar past thoughts');
    }

    // Pattern 2: Category consistency
    const categoryCounts = new Map<string, number>();
    similar.forEach((t) => {
      categoryCounts.set(
        t.metadata.category,
        (categoryCounts.get(t.metadata.category) || 0) + 1
      );
    });

    const mostCommonCategory = Array.from(categoryCounts.entries()).sort(
      (a, b) => b[1] - a[1]
    )[0];

    if (
      mostCommonCategory &&
      thought.metadata.category !== mostCommonCategory[0]
    ) {
      patterns.push(
        `Similar thoughts are typically categorized as "${mostCommonCategory[0]}" (${mostCommonCategory[1]} times)`
      );
    }

    // Pattern 3: Common tags
    const tagCounts = new Map<string, number>();
    similar.forEach((t) => {
      t.metadata.tags.forEach((tag) => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      });
    });

    const commonTags = Array.from(tagCounts.entries())
      .filter(([_, count]) => count >= similar.length * 0.5)
      .map(([tag]) => tag);

    if (commonTags.length > 0) {
      const missingTags = commonTags.filter(
        (tag) => !thought.metadata.tags.includes(tag)
      );
      if (missingTags.length > 0) {
        suggestions.push(
          `Consider adding tags: ${missingTags.join(', ')} (common in similar thoughts)`
        );
      }
    }

    return { similar, patterns, suggestions };
  }
}

export default AutoRetrieval;
