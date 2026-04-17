/**
 * Core types for Mind Palace
 */

export type ThoughtCategory = 'thinking' | 'response' | 'insight' | 'error' | 'question';
export type EmotionalTone = 'positive' | 'neutral' | 'uncertain' | 'negative';
export type CompressionType = 'lz4' | 'gzip' | 'none';
export type SearchType = 'keyword' | 'semantic' | 'temporal' | 'tag' | 'metadata' | 'related' | 'statistical';

/**
 * Metadata for a thought entry
 */
export interface ThoughtMetadata {
  topic?: string;
  confidence: number; // 0-1
  modelVersion?: string;
  inputLength: number;
  outputLength: number;
  tags: string[];
  references?: string[];
  category: ThoughtCategory;
  emotionalTone?: EmotionalTone;
}

/**
 * Source context for a thought
 */
export interface ThoughtSource {
  conversation?: string;
  userQuery?: string;
  domain?: string;
}

/**
 * A single thought entry in the mind palace
 */
export interface Thought {
  id: string; // UUID
  timestamp: string; // ISO-8601
  content: string;
  metadata: ThoughtMetadata;
  source?: ThoughtSource;
  compressed: boolean;
  version: number;
  encrypted?: boolean; // Set when content is AES-256-GCM ciphertext
}

/**
 * Raw thought entry (as stored in file)
 */
export interface RawThought extends Thought {
  _rawContent?: Buffer; // Compressed content if needed
}

/**
 * Search result
 */
export interface SearchResult {
  thoughts: Thought[];
  count: number;
  totalMatches: number;
  scores?: Record<string, number>; // ID -> relevance score
  executionTime: number;
  searchType: SearchType;
}

/**
 * Configuration
 */
export interface MindPalaceConfig {
  autoCapture: boolean;
  autoRetrieval: {
    enabled: boolean;
    threshold: number; // 0-1
    maxResults: number;
    displayMode: 'full' | 'summary' | 'brief';
  };
  storage: {
    compression: CompressionType;
    batchInterval: number; // seconds
    maxStorageAge: number; // seconds
    encryption: boolean; // AES-256-GCM at-rest encryption
  };
  search: {
    enableVectorSearch: boolean;
    vectorDimension: number;
    semanticSensitivity: number; // 0-1
  };
  retention: {
    enabled: boolean;
    archiveAfter: number; // seconds
    pruneLowConfidence: boolean;
  };
}

/**
 * Default configuration
 */
export const DEFAULT_CONFIG: MindPalaceConfig = {
  autoCapture: true,
  autoRetrieval: {
    enabled: false,
    threshold: 0.7,
    maxResults: 3,
    displayMode: 'summary',
  },
  storage: {
    compression: 'lz4',
    batchInterval: 3600,
    maxStorageAge: 157680000, // 5 years
    encryption: false, // opt-in; requires stable MIND_PALACE_KEY or persistent keyfile
  },
  search: {
    enableVectorSearch: true,
    vectorDimension: 384,
    semanticSensitivity: 0.75,
  },
  retention: {
    enabled: true,
    archiveAfter: 31536000, // 1 year
    pruneLowConfidence: false,
  },
};

/**
 * Capture options
 */
export interface CaptureOptions {
  topic?: string;
  confidence?: number;
  tags?: string[];
  category?: ThoughtCategory;
  emotionalTone?: EmotionalTone;
  domain?: string;
  userQuery?: string;
  conversationId?: string;
  modelVersion?: string;
  references?: string[]; // IDs of thoughts this one builds on
}

/**
 * Search options
 */
export interface SearchOptions {
  query?: string;
  keyword?: string;
  semantic?: string;
  timeRange?: {
    start: Date;
    end: Date;
  };
  tags?: string[];
  minConfidence?: number;
  maxConfidence?: number;
  category?: ThoughtCategory;
  domain?: string;
  relatedTo?: string;
  limit?: number;
  offset?: number;
  sort?: 'recent' | 'relevant' | 'confidence';
}
