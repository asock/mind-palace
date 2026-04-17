/**
 * Performance benchmark suite for Mind Palace.
 *
 * Run with: npx ts-node src/benchmark.ts
 * Or:      node dist/benchmark.js
 *
 * Measures throughput and latency for capture, search, and operations
 * across realistic scales (1k → 10k thoughts).
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { MindPalace, resetConfigManager, resetStorageManager } from './index';
import { OperationsManager } from './storage/operations';

interface BenchmarkResult {
  name: string;
  n: number;
  totalMs: number;
  perOpMs: number;
  opsPerSec: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
  return sorted[idx];
}

async function measure<T>(name: string, n: number, fn: () => Promise<T>): Promise<BenchmarkResult> {
  const start = performance.now();
  for (let i = 0; i < n; i++) {
    await fn();
  }
  const totalMs = performance.now() - start;
  return {
    name,
    n,
    totalMs,
    perOpMs: totalMs / n,
    opsPerSec: (n * 1000) / totalMs,
  };
}

async function measureLatencies(
  name: string,
  n: number,
  fn: () => Promise<unknown>
): Promise<{ name: string; n: number; p50: number; p95: number; p99: number }> {
  const samples: number[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    await fn();
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  return {
    name,
    n,
    p50: percentile(samples, 0.5),
    p95: percentile(samples, 0.95),
    p99: percentile(samples, 0.99),
  };
}

function formatResult(r: BenchmarkResult): string {
  return `${r.name.padEnd(40)} n=${r.n.toString().padStart(6)} | ${r.totalMs.toFixed(1).padStart(8)}ms | ${r.perOpMs.toFixed(3).padStart(8)}ms/op | ${r.opsPerSec.toFixed(0).padStart(7)} ops/s`;
}

function formatLatency(r: {
  name: string;
  n: number;
  p50: number;
  p95: number;
  p99: number;
}): string {
  return `${r.name.padEnd(40)} n=${r.n.toString().padStart(6)} | p50 ${r.p50.toFixed(2)}ms | p95 ${r.p95.toFixed(2)}ms | p99 ${r.p99.toFixed(2)}ms`;
}

const SAMPLE_CONTENT = [
  'Distributed consensus algorithms and their impact on system design.',
  'The mathematics of type theory in modern programming languages.',
  'How garbage collectors balance throughput and latency tradeoffs.',
  'Compiler optimization techniques for dynamically typed languages.',
  'Event sourcing and CQRS patterns in microservice architectures.',
  'Cache coherence protocols in multi-core processors.',
  'The history of programming language paradigms from Lisp to Rust.',
  'Database indexing strategies: B-trees vs LSM-trees.',
  'Network protocols for high-throughput messaging systems.',
  'Memory models and their implications for concurrent programming.',
];

async function run(): Promise<void> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-bench-'));
  resetConfigManager(tempDir);
  resetStorageManager();

  const mp = new MindPalace();
  await mp.initialize();

  const results: BenchmarkResult[] = [];
  const latencies: Array<{ name: string; n: number; p50: number; p95: number; p99: number }> = [];

  console.log('\n🔬 Mind Palace Benchmarks\n');
  console.log('─'.repeat(100));

  // Capture throughput at 1k scale
  let i = 0;
  results.push(
    await measure('capture @ 1k cold', 1000, async () => {
      await mp.capture(SAMPLE_CONTENT[i++ % SAMPLE_CONTENT.length] + ` #${i}`);
    })
  );

  // Capture latencies at 1k scale
  i = 0;
  latencies.push(
    await measureLatencies('capture latency (n=500)', 500, async () => {
      await mp.capture(SAMPLE_CONTENT[i++ % SAMPLE_CONTENT.length] + ` #latency-${i}`);
    })
  );

  // Search at 1.5k scale
  latencies.push(
    await measureLatencies('semantic search (n=100)', 100, async () => {
      await mp.search({ semantic: 'distributed systems consensus', limit: 10 });
    })
  );

  latencies.push(
    await measureLatencies('keyword search (n=100)', 100, async () => {
      await mp.search({ keyword: 'compiler optimization', limit: 10 });
    })
  );

  latencies.push(
    await measureLatencies('get by id (n=200)', 200, async () => {
      await mp.getAllThoughts(1, 0);
    })
  );

  // Operations
  const compactStart = performance.now();
  const compactResult = await OperationsManager.compactJSONL();
  const compactMs = performance.now() - compactStart;
  console.log(
    `compact JSONL                            | ${compactMs.toFixed(1)}ms | removed ${compactResult.removedLines} lines | ${compactResult.beforeBytes} → ${compactResult.afterBytes} bytes`
  );

  const manifestStart = performance.now();
  await OperationsManager.writeBackupManifest();
  console.log(`write backup manifest (sha256)           | ${(performance.now() - manifestStart).toFixed(1)}ms`);

  const verifyStart = performance.now();
  await OperationsManager.verifyBackupManifest();
  console.log(`verify backup manifest                   | ${(performance.now() - verifyStart).toFixed(1)}ms`);

  const rebuildStart = performance.now();
  const rebuilt = await mp.rebuildIndex();
  console.log(
    `rebuild index from JSONL                 | ${(performance.now() - rebuildStart).toFixed(1)}ms | ${rebuilt} thoughts`
  );

  console.log('\n─'.repeat(100));
  console.log('Throughput:');
  results.forEach((r) => console.log('  ' + formatResult(r)));

  console.log('\nLatency distributions:');
  latencies.forEach((r) => console.log('  ' + formatLatency(r)));

  const metrics = await mp.metrics();
  console.log('\nFinal storage snapshot:');
  console.log(`  thoughts: ${metrics.thoughts.total} total`);
  console.log(`  JSONL:    ${metrics.storage.jsonlBytes} bytes`);
  console.log(`  DB:       ${metrics.storage.dbBytes} bytes`);
  console.log('─'.repeat(100));

  mp.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
}

if (require.main === module) {
  run().catch((err) => {
    console.error('Benchmark failed:', err);
    process.exit(1);
  });
}

export { run };
