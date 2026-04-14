import { Thought, CaptureOptions, ThoughtMetadata, ThoughtCategory, EmotionalTone } from '../types';
import { getStorageManager } from '../storage/store';
import { getConfigManager } from '../config/config';

/**
 * Thought capturer - main API for capturing thinking/responses
 */
export class ThoughtCapturer {
  /**
   * Capture a thought/response
   */
  static async capture(content: string, options: CaptureOptions = {}): Promise<Thought> {
    const storage = getStorageManager();
    const thought = await storage.capture(content, options);
    return thought;
  }

  /**
   * Capture with auto-metadata extraction
   */
  static async captureWithAutoMetadata(
    content: string,
    userQuery?: string,
    options: CaptureOptions = {}
  ): Promise<Thought> {
    // Extract metadata automatically
    const metadata = this.extractMetadata(content, userQuery);

    return this.capture(content, {
      ...options,
      topic: options.topic || metadata.topic,
      confidence: options.confidence ?? metadata.confidence,
      category: options.category || metadata.category,
      emotionalTone: options.emotionalTone || metadata.emotionalTone,
    });
  }

  /**
   * Extract metadata from content automatically
   */
  private static extractMetadata(content: string, userQuery?: string) {
    const metadata = {
      topic: this.extractTopic(content),
      confidence: this.estimateConfidence(content),
      category: this.detectCategory(content, userQuery),
      emotionalTone: this.detectTone(content),
    };

    return metadata;
  }

  /**
   * Extract likely topic from content
   */
  private static extractTopic(content: string): string | undefined {
    // Simple heuristic: look for first capitalized phrase
    const match = content.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/);
    return match?.[0];
  }

  /**
   * Estimate confidence level (0-1)
   */
  private static estimateConfidence(content: string): number {
    // Heuristic: presence of uncertainty words lowers confidence
    const uncertaintyWords = [
      'maybe',
      'probably',
      'might',
      'could',
      'uncertain',
      'unclear',
      'unknown',
      'guess',
      'not sure',
    ];
    const lowerContent = content.toLowerCase();
    const uncertaintyCount = uncertaintyWords.filter((word) =>
      lowerContent.includes(word)
    ).length;

    // Start at 0.9, reduce by 0.1 per uncertainty word
    let confidence = 0.9 - uncertaintyCount * 0.1;
    return Math.max(0.1, Math.min(1, confidence));
  }

  /**
   * Detect thought category
   */
  private static detectCategory(content: string, userQuery?: string): ThoughtCategory {
    const lowerContent = content.toLowerCase();

    if (lowerContent.includes('error') || lowerContent.includes('failed')) {
      return 'error' as ThoughtCategory;
    }
    if (lowerContent.includes('insight') || lowerContent.includes('discovered')) {
      return 'insight' as ThoughtCategory;
    }
    if (
      userQuery &&
      (lowerContent.includes('?') || content.includes('?'))
    ) {
      return 'question' as ThoughtCategory;
    }

    return 'response' as ThoughtCategory;
  }

  /**
   * Detect emotional tone
   */
  private static detectTone(content: string): EmotionalTone | undefined {
    const lowerContent = content.toLowerCase();

    if (
      lowerContent.includes('great') ||
      lowerContent.includes('excellent') ||
      lowerContent.includes('perfect')
    ) {
      return 'positive' as EmotionalTone;
    }
    if (
      lowerContent.includes('fail') ||
      lowerContent.includes('error') ||
      lowerContent.includes('problem')
    ) {
      return 'negative' as EmotionalTone;
    }
    if (
      lowerContent.includes('maybe') ||
      lowerContent.includes('uncertain') ||
      lowerContent.includes('unclear')
    ) {
      return 'uncertain' as EmotionalTone;
    }

    return undefined; // neutral
  }
}

export default ThoughtCapturer;
