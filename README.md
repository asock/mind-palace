# Mind Palace - Clawbot.ai Skill

A persistent knowledge capture system that stores thinking, reasoning, and responses in an eternally accessible "mind palace" - an infinitely stacked room of drawers and file systems.

## Overview

Mind Palace is a Clawbot.ai skill that captures all thinking and thoughts with rich metadata, stores them efficiently with compression, and provides powerful retrieval through multiple search methods:

- **Keyword Search**: Exact and fuzzy matching on content and metadata
- **Semantic Search**: Conceptual similarity matching using vector embeddings
- **Temporal Search**: Date/time range based queries
- **Tag Search**: Filter by user-assigned tags
- **Metadata Filters**: Query by confidence, category, domain, emotional tone
- **Related Search**: Find semantically similar thoughts
- **Advanced Queries**: Complex boolean queries with multiple filters

## Features

✨ **Eternal Storage**: Permanent, immutable thought storage with SQLite indexing
📊 **Rich Metadata**: Topics, confidence scores, emotional tone, model version, references
🔍 **8 Search Methods**: Keyword, semantic, temporal, tags, metadata, relationships, statistics, complex queries
⚡ **Compression**: Efficient LZ4/Deflate compression for storage optimization (~70-80% ratio)
🎛️ **Configuration**: Highly configurable auto-capture, auto-retrieval, search sensitivity
🔌 **CLI Interface**: `!mindpalace` command syntax for easy integration
📈 **Statistics**: View thoughts by category, tone, confidence, tags, domains
💾 **Auto-retrieval** (toggle): Optional feature to surface related past thinking

## Installation

```bash
npm install @clawbot/mind-palace
```

## Quick Start

```typescript
import { mindPalace } from '@clawbot/mind-palace';

// Initialize
await mindPalace.initialize();

// Capture a thought with auto-metadata extraction
const thought = await mindPalace.captureWithAutoMetadata(
  "This is my thinking process...",
  "What was I asked?"
);

// Search by keyword
const results = await mindPalace.search({
  keyword: "database optimization"
});

// Search semantically
const similar = await mindPalace.search({
  semantic: "efficient memory usage"
});

// Filter by metadata
const recent = await mindPalace.search({
  minConfidence: 0.8,
  category: 'response',
  limit: 10
});

// Get related thoughts (auto-retrieval)
const related = await mindPalace.getRelatedThoughts(thought);
const formatted = mindPalace.formatRelatedThoughts(related, 'summary');
console.log(formatted);

// Analyze similar thoughts for patterns and suggestions
const analysis = await mindPalace.analyzeSimilarThoughts(thought);
console.log('Patterns:', analysis.patterns);
console.log('Suggestions:', analysis.suggestions);

// Get compression statistics
const stats = await mindPalace.getCompressionStats();
console.log(`Storage: ${stats.estimatedSize} → ${stats.estimatedCompressed}`);

// Execute CLI command
const output = await mindPalace.executeCommand(
  '!mindpalace -k "optimization" --confidence ">0.8"'
);

console.log(output);
```

## CLI Commands

### Capture
```
!mindpalace --capture "My thought here"
!mindpalace -c "Quick note"
```

### Search
```
!mindpalace -k "keyword search"                 # Keyword search
!mindpalace -s "semantic query"                 # Semantic search
!mindpalace -t "2026-04-01 to 2026-04-11"      # Time range
!mindpalace -t "last 7 days"                    # Relative time
!mindpalace --recent 10                         # Recent thoughts
```

### Filters
```
!mindpalace --tag "important,urgent"            # By tags
!mindpalace --category response                 # By category
!mindpalace --confidence ">0.8"                 # By confidence
!mindpalace --domain backend                    # By domain
```

### Options
```
--limit 20                                      # Limit results
--offset 10                                     # Skip results
--sort recent|relevant|confidence               # Sort order
```

### Configuration & Stats
```
!mindpalace --config                            # Show all config
!mindpalace --config autoCapture=false          # Set value
!mindpalace --stats                             # Show statistics
!mindpalace --help                              # Show help
```

## Configuration

The Mind Palace configuration is stored at `~/.clawbot/mind-palace/config.json`:

```json
{
  "autoCapture": true,
  "autoRetrieval": {
    "enabled": false,
    "threshold": 0.7,
    "maxResults": 3,
    "displayMode": "summary"
  },
  "storage": {
    "compression": "lz4",
    "batchInterval": 3600,
    "maxStorageAge": 157680000
  },
  "search": {
    "enableVectorSearch": true,
    "vectorDimension": 384,
    "semanticSensitivity": 0.75
  },
  "retention": {
    "enabled": true,
    "archiveAfter": 31536000,
    "pruneLowConfidence": false
  }
}
```

## Data Model

Each thought captures:

```typescript
{
  id: string,                    // UUID
  timestamp: ISO-8601,           // When it was captured
  content: string,               // The thinking/response
  metadata: {
    topic?: string,              // Auto-extracted or tagged topic
    confidence: 0-1,             // Confidence in the answer (0-100%)
    modelVersion?: string,       // Which model generated this
    inputLength: number,         // Token count of input
    outputLength: number,        // Token count of output
    tags: string[],              // User-assigned tags
    references?: string[],       // Related thought IDs
    category: string,            // thinking|response|insight|error|question
    emotionalTone?: string       // positive|neutral|uncertain|negative
  },
  source?: {
    conversation?: string,       // Conversation ID
    userQuery?: string,          // Original user input
    domain?: string              // Domain/context
  },
  compressed: boolean,           // Whether content is compressed
  version: number                // Data version
}
```

## Architecture

### Storage
- **JSONL File**: Append-only storage with one thought per line
- **SQLite Index**: Fast metadata queries with indexed columns
- **Compression**: Deflate algorithm for efficient storage

### Search Engines
1. **KeywordSearchEngine**: Fuzzy and exact keyword matching
2. **TemporalSearchEngine**: Date range and relative time queries
3. **FilterSearchEngine**: Metadata-based filtering and statistics
4. **SemanticSearchEngine**: Token-based similarity scoring

### API
- **MindPalace**: Main API class with all operations
- **ThoughtCapturer**: Auto-metadata extraction
- **SearchAPI**: Unified search interface
- **CLICommandHandler**: Command parsing and execution

## Storage Location

All data is stored in `~/.clawbot/mind-palace/`:
- `thoughts.jsonl` - Raw thought data (compressed)
- `thoughts.db` - SQLite index for fast queries
- `config.json` - Configuration

## Auto-Metadata Detection

The Mind Palace automatically detects and extracts:

- **Topic**: First capitalized phrase in content
- **Confidence**: 0.1-1.0 based on uncertainty keywords
- **Category**: error|insight|question|response (detected from content)
- **Emotional Tone**: positive|negative|uncertain (keyword-based)

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Watch for changes
npm run dev

# Run tests
npm test

# Type checking
npm run build
```

## Planned Features

- [ ] Automatic compression of older entries
- [ ] Vector embeddings via Transformers.js
- [ ] Advanced relationship tracking
- [ ] Export/import utilities
- [ ] Multi-user support
- [ ] Performance optimizations for 100k+ thoughts

## License

MIT

## Author

asock
