/**
 * Mind Palace - Advanced Usage Example
 * Demonstrates auto-retrieval, compression, and advanced search patterns
 */

import {
  mindPalace,
  AutoRetrieval,
  CompressionManager,
} from '../src/index';

async function main() {
  console.log('🧠 Mind Palace - Advanced Features Demo\n');
  console.log('========================================\n');

  // Initialize
  await mindPalace.initialize();

  // Example 1: Capture multiple thoughts about the same topic
  console.log('📝 Capturing related thoughts about performance optimization...\n');

  const thoughts = [
    {
      content: 'Caching is one of the most effective performance optimization techniques. Redis provides fast in-memory storage.',
      query: 'How can I optimize performance?',
      tags: ['performance', 'caching', 'redis'],
    },
    {
      content: 'Database indexing dramatically improves query performance. Analyze query execution plans to identify slow queries.',
      query: 'What makes databases slow?',
      tags: ['performance', 'database', 'indexing'],
    },
    {
      content: 'Load balancing distributes traffic across multiple servers. This improves reliability and performance.',
      query: 'How do I scale my application?',
      tags: ['performance', 'scaling', 'load-balancing'],
    },
  ];

  for (const thought of thoughts) {
    const captured = await mindPalace.captureWithAutoMetadata(
      thought.content,
      thought.query,
      {
        tags: thought.tags,
        domain: 'backend',
        confidence: 0.85,
      }
    );
    console.log(`✓ Captured: "${captured.metadata.topic}"`);
  }

  console.log('\n');

  // Example 2: Auto-Retrieval - Get related thoughts
  console.log('💡 Auto-Retrieval: Finding related thoughts...\n');

  const newThought = await mindPalace.captureWithAutoMetadata(
    'Application bottleneck analysis: We need to identify slow queries and optimize database performance.'
  );

  const related = await mindPalace.getRelatedThoughts(newThought);

  if (related.length > 0) {
    console.log('Found related thoughts:');
    console.log(mindPalace.formatRelatedThoughts(related, 'summary'));
  } else {
    console.log('No related thoughts found.');
  }

  console.log('\n');

  // Example 3: Analyze patterns in similar thoughts
  console.log('🔍 Pattern Analysis: Learning from past thinking...\n');

  const analysis = await mindPalace.analyzeSimilarThoughts(newThought);

  if (analysis.patterns.length > 0) {
    console.log('Patterns identified:');
    analysis.patterns.forEach((pattern) => {
      console.log(`  • ${pattern}`);
    });
    console.log();
  }

  if (analysis.suggestions.length > 0) {
    console.log('Suggestions:');
    analysis.suggestions.forEach((suggestion) => {
      console.log(`  💡 ${suggestion}`);
    });
    console.log();
  }

  // Example 4: Compression statistics
  console.log('💾 Storage & Compression Analysis\n');

  const stats = await mindPalace.getCompressionStats();
  console.log(`Total thoughts:      ${stats.thoughts}`);
  console.log(`Estimated size:      ${stats.estimatedSize}`);
  console.log(`With compression:    ${stats.estimatedCompressed}`);
  console.log(`Potential savings:   ${stats.savings}`);
  console.log();

  // Example 5: Complex search combining multiple filters
  console.log('🔎 Complex Search: Combining multiple search methods\n');

  const complexResults = await mindPalace.search({
    keyword: 'performance',
    minConfidence: 0.8,
    tags: ['database'],
    sort: 'confidence',
    limit: 5,
  });

  console.log(`Found ${complexResults.count} thoughts matching:
  • Keyword: "performance"
  • Confidence: > 0.8
  • Tags: "database"
  • Sorted by confidence`);

  if (complexResults.thoughts.length > 0) {
    console.log('\nTop result:');
    const best = complexResults.thoughts[0];
    console.log(`  Title: ${best.metadata.topic || 'Untitled'}`);
    console.log(`  Score: ${(complexResults.scores?.[best.id] || 0).toFixed(2)}`);
    console.log(`  Content: ${best.content.substring(0, 100)}...`);
  }

  console.log('\n');

  // Example 6: CLI commands
  console.log('💻 CLI Examples\n');

  // Help command
  console.log('Help command output:');
  const helpOutput = await mindPalace.executeCommand('!mindpalace --help');
  const helpLines = helpOutput.split('\n').slice(0, 10).join('\n');
  console.log(helpLines + '\n...\n');

  // Stats with compression
  console.log('Statistics with compression:');
  const statsOutput = await mindPalace.executeCommand(
    '!mindpalace --stats --compression'
  );
  const statsLines = statsOutput.split('\n');
  statsLines.forEach((line) => {
    if (line.includes('Total') || line.includes('Storage') || line.includes('Compression') || line.includes('Savings')) {
      console.log(line);
    }
  });

  console.log('\n');

  // Example 7: Search via CLI
  console.log('Search via CLI:');
  const searchOutput = await mindPalace.executeCommand(
    '!mindpalace -k "performance" --confidence ">0.8"'
  );
  const searchLines = searchOutput.split('\n').slice(0, 5).join('\n');
  console.log(searchLines + '\n...\n');

  // Example 8: Configuration
  console.log('📋 Configuration Management\n');

  const config = mindPalace.getConfig();
  console.log('Current configuration:');
  console.log(`  Auto-capture: ${config.autoCapture}`);
  console.log(`  Auto-retrieval enabled: ${config.autoRetrieval.enabled}`);
  console.log(`  Auto-retrieval threshold: ${(config.autoRetrieval.threshold * 100).toFixed(0)}%`);
  console.log(`  Compression: ${config.storage.compression}`);
  console.log(`  Vector search enabled: ${config.search.enableVectorSearch}`);

  console.log('\n');

  // Example 9: Semantic search
  console.log('🧠 Semantic Search Example\n');

  const semanticResults = await mindPalace.search({
    semantic: 'speeding up applications and database queries',
    limit: 3,
  });

  console.log(`Found ${semanticResults.count} semantically similar thoughts:`);
  semanticResults.thoughts.forEach((thought, index) => {
    const score = semanticResults.scores?.[thought.id] || 0;
    console.log(`  ${index + 1}. ${thought.metadata.topic || 'Untitled'} (similarity: ${(score * 100).toFixed(0)}%)`);
  });

  console.log('\n');

  // Cleanup
  mindPalace.close();
  console.log('✅ Mind Palace session closed.\n');
}

// Run the example
main().catch(console.error);
