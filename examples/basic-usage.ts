/**
 * Mind Palace - Basic Usage Example
 */

import {
  mindPalace,
  ThoughtCapturer,
  SearchAPI,
  CLICommandHandler,
} from '../dist/index';

async function main() {
  // Initialize Mind Palace
  console.log('🧠 Initializing Mind Palace...\n');
  await mindPalace.initialize();

  // Example 1: Capture a thought
  console.log('📝 Capturing a thought...');
  const thought = await mindPalace.captureWithAutoMetadata(
    'Database optimization is critical for performance. We should consider indexing frequently queried columns and analyzing query execution plans.',
    'What are best practices for database performance?',
    {
      tags: ['database', 'performance', 'optimization'],
      domain: 'backend',
    }
  );
  console.log(`✓ Captured thought: ${thought.id}\n`);

  // Example 2: Capture another thought
  const thought2 = await mindPalace.captureWithAutoMetadata(
    'Machine learning models require careful data preparation. Normalize features, handle outliers, and ensure balanced training data.',
    'How do I prepare data for machine learning?',
    {
      tags: ['ml', 'data-preparation'],
      domain: 'ml',
      confidence: 0.85,
    }
  );
  console.log(`✓ Captured thought: ${thought2.id}\n`);

  // Example 3: Capture with an error
  const thought3 = await mindPalace.captureWithAutoMetadata(
    'Error occurred when connecting to the database. Check connection string and ensure database server is running.',
    'Why is my database connection failing?',
    {
      tags: ['debugging', 'database'],
      domain: 'backend',
      confidence: 0.6,
    }
  );
  console.log(`✓ Captured thought: ${thought3.id}\n`);

  // Example 4: Keyword search
  console.log('🔍 Searching by keyword...');
  const keywordResults = await mindPalace.search({
    keyword: 'database',
    limit: 5,
  });
  console.log(`✓ Found ${keywordResults.count} thoughts matching "database"\n`);

  // Example 5: Semantic search
  console.log('🧠 Semantic search...');
  const semanticResults = await mindPalace.search({
    semantic: 'data performance optimization',
    limit: 5,
  });
  console.log(`✓ Found ${semanticResults.count} semantically similar thoughts\n`);

  // Example 6: Filter by metadata
  console.log('📊 Filtering by metadata...');
  const filtered = await mindPalace.search({
    minConfidence: 0.7,
    domain: 'backend',
    limit: 10,
  });
  console.log(`✓ Found ${filtered.count} backend thoughts with confidence > 0.7\n`);

  // Example 7: Search by tags
  console.log('🏷️ Searching by tags...');
  const tagResults = await mindPalace.search({
    tags: ['database'],
    limit: 10,
  });
  console.log(`✓ Found ${tagResults.count} thoughts tagged with "database"\n`);

  // Example 8: Find recent thoughts
  console.log('⏱️ Getting recent thoughts...');
  const recent = await mindPalace.search({
    limit: 5,
    sort: 'recent',
  });
  console.log(`✓ Retrieved ${recent.count} recent thoughts\n`);

  // Example 9: CLI command
  console.log('💻 Executing CLI command...');
  const output = await mindPalace.executeCommand(
    '!mindpalace -k "database" --confidence ">0.7" --limit 5'
  );
  console.log(output);
  console.log();

  // Example 10: Get statistics
  console.log('📈 Getting statistics...');
  const count = await mindPalace.count();
  const config = mindPalace.getConfig();
  console.log(`✓ Total thoughts: ${count}`);
  console.log(`✓ Auto-capture enabled: ${config.autoCapture}`);
  console.log(`✓ Auto-retrieval enabled: ${config.autoRetrieval.enabled}\n`);

  // Close Mind Palace
  mindPalace.close();
  console.log('✅ Mind Palace closed.\n');
}

// Run the example
main().catch(console.error);
