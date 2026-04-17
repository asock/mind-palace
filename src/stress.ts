/**
 * Stress test for Mind Palace at 10k+ thought scale.
 * Validates that capture throughput, search latency, and storage operations
 * remain reasonable under production-sized workloads.
 *
 * Run: npx ts-node src/stress.ts  OR  node dist/stress.js
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { MindPalace, resetConfigManager, resetStorageManager } from './index';
import { OperationsManager } from './storage/operations';

const TARGET_THOUGHTS = parseInt(process.env.STRESS_N || '10000', 10);

const TOPICS = [
  'algorithm', 'architecture', 'database', 'security', 'network',
  'compiler', 'runtime', 'memory', 'performance', 'distributed',
  'consistency', 'latency', 'throughput', 'cache', 'queue',
];

const VERBS = [
  'analyzing', 'designing', 'optimizing', 'debugging', 'refactoring',
  'implementing', 'testing', 'profiling', 'benchmarking', 'documenting',
];

function randomContent(seed: number): string {
  const topic1 = TOPICS[seed % TOPICS.length];
  const topic2 = TOPICS[(seed * 7) % TOPICS.length];
  const verb = VERBS[(seed * 13) % VERBS.length];
  return `Thought ${seed}: ${verb} ${topic1} in the context of ${topic2} systems. Considering tradeoffs and constraints for production deployments.`;
}

async function main(): Promise<void> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-stress-'));
  resetConfigManager(tempDir);
  resetStorageManager();

  const mp = new MindPalace();
  await mp.initialize();

  console.log(`\n🏋️  Stress Test: ${TARGET_THOUGHTS.toLocaleString()} thoughts\n`);
  console.log('─'.repeat(80));

  // Capture phase
  const captureStart = performance.now();
  let progressMark = performance.now();
  for (let i = 0; i < TARGET_THOUGHTS; i++) {
    await mp.capture(randomContent(i), {
      tags: [TOPICS[i % TOPICS.length]],
      confidence: 0.5 + (i % 50) / 100,
    });

    if ((i + 1) % 1000 === 0) {
      const chunkElapsed = performance.now() - progressMark;
      const chunkRate = 1000 / (chunkElapsed / 1000);
      console.log(
        `  captured ${(i + 1).toLocaleString().padStart(8)} | chunk: ${chunkElapsed.toFixed(0).padStart(5)}ms | rate: ${chunkRate.toFixed(0)} ops/sec`
      );
      progressMark = performance.now();
    }
  }
  const captureMs = performance.now() - captureStart;
  const captureRate = (TARGET_THOUGHTS * 1000) / captureMs;

  console.log('─'.repeat(80));
  console.log(
    `Total capture: ${captureMs.toFixed(0)}ms | overall ${captureRate.toFixed(0)} ops/sec`
  );

  // Verify count
  const count = await mp.count();
  console.log(`Verified count: ${count.toLocaleString()} thoughts in store`);
  if (count !== TARGET_THOUGHTS) {
    console.error(`❌ Count mismatch! Expected ${TARGET_THOUGHTS}, got ${count}`);
    process.exit(1);
  }

  // Search phase
  console.log('\nSearch latencies at scale:');
  const searches = [
    { name: 'keyword (common)', op: () => mp.search({ keyword: 'algorithm' }) },
    { name: 'keyword (rare)', op: () => mp.search({ keyword: 'refactoring queue' }) },
    { name: 'semantic (broad)', op: () => mp.search({ semantic: 'distributed systems' }) },
    { name: 'semantic (specific)', op: () => mp.search({ semantic: 'memory profiling debugging' }) },
    { name: 'by tag', op: () => mp.getThoughtsByTag('compiler', 50) },
  ];

  for (const { name, op } of searches) {
    const samples = 20;
    const times: number[] = [];
    for (let i = 0; i < samples; i++) {
      const t0 = performance.now();
      await op();
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const p50 = times[Math.floor(samples * 0.5)];
    const p95 = times[Math.floor(samples * 0.95)];
    console.log(`  ${name.padEnd(25)} p50 ${p50.toFixed(1)}ms | p95 ${p95.toFixed(1)}ms`);
  }

  // Operations
  console.log('\nOperations at scale:');
  const compactStart = performance.now();
  const compactResult = await OperationsManager.compactJSONL();
  console.log(
    `  compact JSONL: ${(performance.now() - compactStart).toFixed(0)}ms | removed ${compactResult.removedLines} lines`
  );

  const manifestStart = performance.now();
  await OperationsManager.writeBackupManifest();
  console.log(`  write manifest (sha256): ${(performance.now() - manifestStart).toFixed(0)}ms`);

  const rebuildStart = performance.now();
  const rebuilt = await mp.rebuildIndex();
  console.log(
    `  rebuild index: ${(performance.now() - rebuildStart).toFixed(0)}ms | ${rebuilt} thoughts`
  );

  const metrics = await mp.metrics();
  console.log('\nFinal snapshot:');
  console.log(`  thoughts: ${metrics.thoughts.total.toLocaleString()}`);
  console.log(`  JSONL:    ${(metrics.storage.jsonlBytes / 1024 / 1024).toFixed(2)} MiB`);
  console.log(`  DB:       ${(metrics.storage.dbBytes / 1024 / 1024).toFixed(2)} MiB`);
  console.log(`  capture:  ${metrics.performance.captureLatencyMs.toFixed(2)}ms`);
  console.log(`  search:   ${metrics.performance.searchLatencyMs.toFixed(2)}ms`);

  console.log('\n✅ Stress test PASSED\n');

  mp.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Stress test failed:', err);
    process.exit(1);
  });
}

export { main };
