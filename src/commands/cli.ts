import fs from 'fs';
import path from 'path';
import { SearchAPI } from '../search/search';
import { ThoughtCapturer } from '../capture/capturer';
import { getConfigManager } from '../config/config';
import { getStorageManager } from '../storage/store';
import { CompressionManager } from '../storage/compression-manager';
import { OperationsManager } from '../storage/operations';
import { SearchResult } from '../types';

/**
 * CLI command handler for Mind Palace
 * Implements !mindpalace command syntax
 */
export class CLICommandHandler {
  /**
   * Parse and execute mindpalace command
   */
  static async execute(commandString: string): Promise<string> {
    try {
      const args = this.parseArguments(commandString);

      if (args.capture) {
        return await this.handleCapture(args);
      }

      if (args.config !== undefined) {
        return this.handleConfig(args);
      }

      if (args.help) {
        return this.getHelpMessage();
      }

      if (args.stats) {
        return await this.handleStats(args);
      }

      if (args.clear) {
        return await this.handleClear();
      }

      if (args.export) {
        return await this.handleExport(args);
      }

      if (args.import) {
        return await this.handleImport(args);
      }

      if (args.compact) {
        return await this.handleCompact();
      }

      if (args.manifest) {
        return await this.handleManifest();
      }

      if (args.verify) {
        return await this.handleVerify();
      }

      if (args.metrics) {
        return await this.handleMetrics();
      }

      if (args.rebuild) {
        return await this.handleRebuild();
      }

      if (args.backfill) {
        return await this.handleBackfill();
      }

      // Default: search
      return await this.handleSearch(args);
    } catch (error) {
      return `Error executing command: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Strip surrounding quotes from a string
   */
  private static stripQuotes(s: string): string {
    return s.replace(/^["']|["']$/g, '');
  }

  /**
   * Parse command arguments
   */
  private static parseArguments(commandString: string): Record<string, any> {
    const args: Record<string, any> = {};

    // Remove "!mindpalace" prefix if present
    const trimmed = commandString.replace(/^!mindpalace\s*/, '').trim();

    if (!trimmed) {
      args.help = true;
      return args;
    }

    // Split by spaces but respect quotes
    const parts = trimmed.match(/"[^"]*"|'[^']*'|\S+/g) || [];

    let i = 0;
    while (i < parts.length) {
      const part = parts[i];

      if (part === '--capture' || part === '-c') {
        args.capture = this.joinQuotedArgs(parts, ++i);
        break;
      }

      if (part === '--config') {
        args.config = this.joinQuotedArgs(parts, ++i) || '';
        break;
      }

      if (part === '--help' || part === '-h') {
        args.help = true;
        i++;
        continue;
      }

      if (part === '--stats') {
        args.stats = true;
        i++;
        continue;
      }

      if (part === '--compression') {
        args.compression = true;
        i++;
        continue;
      }

      if (part === '--clear') {
        args.clear = true;
        i++;
        continue;
      }

      if (part === '--export') {
        if (i + 1 < parts.length && !parts[i + 1].startsWith('-')) {
          args.export = this.stripQuotes(parts[++i]);
        } else {
          args.export = '';
        }
        i++;
        continue;
      }

      if (part === '--import') {
        if (i + 1 < parts.length && !parts[i + 1].startsWith('-')) {
          args.import = this.stripQuotes(parts[++i]);
        } else {
          args.import = '';
        }
        i++;
        continue;
      }

      if (part === '--compact') {
        args.compact = true;
        i++;
        continue;
      }

      if (part === '--manifest') {
        args.manifest = true;
        i++;
        continue;
      }

      if (part === '--verify') {
        args.verify = true;
        i++;
        continue;
      }

      if (part === '--metrics') {
        args.metrics = true;
        i++;
        continue;
      }

      if (part === '--rebuild') {
        args.rebuild = true;
        i++;
        continue;
      }

      if (part === '--backfill') {
        args.backfill = true;
        i++;
        continue;
      }

      if (part === '-k' || part === '--keyword') {
        if (i + 1 < parts.length) args.keyword = this.stripQuotes(parts[++i] || '');
        i++;
        continue;
      }

      if (part === '-s' || part === '--semantic') {
        if (i + 1 < parts.length) args.semantic = this.stripQuotes(parts[++i] || '');
        i++;
        continue;
      }

      if (part === '-t' || part === '--time') {
        if (i + 1 < parts.length) {
          let timeRange = this.stripQuotes(parts[++i] || '');
          while (i + 1 < parts.length && !parts[i + 1].startsWith('-')) {
            timeRange += ' ' + this.stripQuotes(parts[++i]);
          }
          args.time = timeRange;
        }
        i++;
        continue;
      }

      if (part === '--tag' || part === '--tags') {
        if (i + 1 < parts.length) args.tags = this.stripQuotes(parts[++i] || '').split(',').filter(Boolean);
        i++;
        continue;
      }

      if (part === '--confidence' || part === '--conf') {
        if (i + 1 < parts.length) args.confidence = this.stripQuotes(parts[++i] || '');
        i++;
        continue;
      }

      if (part === '--category' || part === '--cat') {
        if (i + 1 < parts.length) args.category = this.stripQuotes(parts[++i] || '');
        i++;
        continue;
      }

      if (part === '--domain') {
        if (i + 1 < parts.length) args.domain = this.stripQuotes(parts[++i] || '');
        i++;
        continue;
      }

      if (part === '--related') {
        if (i + 1 < parts.length) args.relatedTo = this.stripQuotes(parts[++i] || '');
        i++;
        continue;
      }

      if (part === '--recent') {
        if (i + 1 < parts.length) args.recent = parseInt(parts[++i] || '10');
        i++;
        continue;
      }

      if (part === '--limit') {
        if (i + 1 < parts.length) args.limit = parseInt(parts[++i] || '10');
        i++;
        continue;
      }

      if (part === '--offset') {
        if (i + 1 < parts.length) args.offset = parseInt(parts[++i] || '0');
        i++;
        continue;
      }

      if (part === '--sort') {
        if (i + 1 < parts.length) args.sort = this.stripQuotes(parts[++i] || '');
        i++;
        continue;
      }

      i++;
    }

    return args;
  }

  /**
   * Join quoted arguments
   */
  private static joinQuotedArgs(parts: string[], startIndex: number): string {
    const collected: string[] = [];

    for (let i = startIndex; i < parts.length; i++) {
      if (parts[i].startsWith('-')) break;
      collected.push(this.stripQuotes(parts[i]));
    }

    return collected.join(' ');
  }

  /**
   * Handle search command
   */
  private static async handleSearch(args: Record<string, any>): Promise<string> {
    const storage = getStorageManager();

    const searchOptions: any = {
      keyword: args.keyword,
      semantic: args.semantic,
      tags: args.tags,
      domain: args.domain,
      relatedTo: args.relatedTo,
      limit: args.limit || 10,
      offset: args.offset || 0,
      sort: args.sort || 'relevant',
    };

    // Handle time range
    if (args.time) {
      const { TemporalSearchEngine } = require('../search/temporal');
      const parsed = TemporalSearchEngine.parseTimeRange(args.time);
      if (parsed) {
        searchOptions.timeRange = parsed;
      }
    }

    // Handle recent
    if (args.recent) {
      const thoughts = await storage.getAllThoughts(args.recent, 0);
      return this.formatResults(thoughts, thoughts.length, 0);
    }

    // Handle confidence range — check >= / <= before > / <
    if (args.confidence) {
      const confStr = args.confidence;
      const match = confStr.match(/^(>=|<=|>|<)?(.+)/);
      if (match) {
        const op = match[1] || '';
        const val = parseFloat(match[2]);

        if (!isNaN(val)) {
          if (op === '>=' || op === '>') {
            searchOptions.minConfidence = val;
          } else if (op === '<=' || op === '<') {
            searchOptions.maxConfidence = val;
          } else {
            searchOptions.minConfidence = val;
          }
        }
      }
    }

    // Handle category filter
    if (args.category) {
      searchOptions.category = args.category;
    }

    const results = await SearchAPI.search(searchOptions);

    return this.formatResults(
      results.thoughts,
      results.count,
      args.offset || 0,
      results
    );
  }

  /**
   * Handle capture command
   */
  private static async handleCapture(args: Record<string, any>): Promise<string> {
    const thought = await ThoughtCapturer.captureWithAutoMetadata(args.capture);

    return `
✨ Thought captured!
━━━━━━━━━━━━━━━━━━━━━
ID:         ${thought.id}
Timestamp:  ${thought.timestamp}
Category:   ${thought.metadata.category}
Confidence: ${(thought.metadata.confidence * 100).toFixed(0)}%
${thought.metadata.topic ? `Topic:      ${thought.metadata.topic}` : ''}
${thought.metadata.tags.length > 0 ? `Tags:       ${thought.metadata.tags.join(', ')}` : ''}
    `.trim();
  }

  /**
   * Handle config command
   */
  private static handleConfig(args: Record<string, any>): string {
    const configMgr = getConfigManager();
    const config = configMgr.getConfig();

    const configStr: string = args.config;
    if (!configStr) {
      return JSON.stringify(config, null, 2);
    }

    const eqIndex = configStr.indexOf('=');
    if (eqIndex === -1) {
      const cleanPath = configStr.trim();
      try {
        return `Config: ${cleanPath}\n${JSON.stringify(this.getNestedValue(config, cleanPath), null, 2)}`;
      } catch (err) {
        return `❌ Error: ${err instanceof Error ? err.message : 'Invalid config path'}`;
      }
    }

    const cleanPath = configStr.substring(0, eqIndex).trim();
    const cleanValue = configStr.substring(eqIndex + 1).trim();

    if (!this.isAllowedConfigPath(cleanPath)) {
      return `❌ Config path not allowed: ${cleanPath}`;
    }

    let parsedValue: any = cleanValue;
    if (cleanValue === 'true') parsedValue = true;
    else if (cleanValue === 'false') parsedValue = false;
    else if (cleanValue !== '' && !isNaN(Number(cleanValue))) parsedValue = Number(cleanValue);

    configMgr.updateNested(cleanPath, parsedValue);

    return `✓ Configuration updated: ${cleanPath} = ${parsedValue}`;
  }

  /**
   * Whitelist of allowed config paths
   */
  private static readonly ALLOWED_CONFIG_PATHS = [
    'autoCapture',
    'autoRetrieval.enabled',
    'autoRetrieval.threshold',
    'autoRetrieval.maxResults',
    'autoRetrieval.displayMode',
    'storage.compression',
    'storage.batchInterval',
    'search.enableVectorSearch',
    'search.semanticSensitivity',
  ];

  /**
   * Validate that a config path is allowed
   */
  private static isAllowedConfigPath(dotPath: string): boolean {
    const normalized = dotPath.trim().toLowerCase();
    return this.ALLOWED_CONFIG_PATHS.some(allowed =>
      allowed.toLowerCase() === normalized
    );
  }

  private static getNestedValue(obj: any, dotPath: string): any {
    if (!this.isAllowedConfigPath(dotPath)) {
      throw new Error(`Config path not allowed: ${dotPath}`);
    }
    return dotPath.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Handle stats command
   */
  private static async handleStats(args: Record<string, any>): Promise<string> {
    const stats = await SearchAPI.getStatistics();
    const storage = getStorageManager();
    const total = await storage.count();

    let output = `
📊 Mind Palace Statistics
━━━━━━━━━━━━━━━━━━━━━━━━━━
Total Thoughts:        ${total}
Average Confidence:    ${(stats.averageConfidence * 100).toFixed(1)}%

By Category:
${Object.entries(stats.categoryCounts)
      .map(([cat, count]) => `  ${cat}: ${count}`)
      .join('\n')}

By Tone:
${Object.entries(stats.toneCounts)
      .map(([tone, count]) => `  ${tone}: ${count}`)
      .join('\n') || '  None recorded'}

Top Tags:
${Object.entries(stats.tagCounts)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, 5)
      .map(([tag, count]) => `  ${tag}: ${count}`)
      .join('\n') || '  None'}

Top Domains:
${Object.entries(stats.topDomains)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, 5)
      .map(([domain, count]) => `  ${domain}: ${count}`)
      .join('\n') || '  None'}`;

    if (args.compression) {
      try {
        const compressionStats = await CompressionManager.estimateStorageUsage();
        output += `

💾 Storage & Compression
━━━━━━━━━━━━━━━━━━━━━━━━━━
Estimated Size:        ${CompressionManager.formatBytes(compressionStats.estimatedSize)}
With Compression:      ${CompressionManager.formatBytes(compressionStats.estimatedCompressed)}
Potential Savings:     ${CompressionManager.formatBytes(compressionStats.savings)}`;
      } catch {
        // Compression stats not available
      }
    }

    return output.trim();
  }

  /**
   * Export all thoughts to a JSON file.
   * Decrypted content is written in cleartext — write to a secure path.
   */
  private static async handleExport(args: Record<string, any>): Promise<string> {
    const storage = getStorageManager();
    const configMgr = getConfigManager();
    const defaultPath = path.join(
      configMgr.getStorageDir(),
      `mind-palace-export-${Date.now()}.json`
    );
    const targetPath = (args.export || defaultPath).trim() || defaultPath;

    try {
      const thoughts = await storage.getAllThoughts(1000000, 0);
      const payload = JSON.stringify(
        { version: 1, exportedAt: new Date().toISOString(), thoughts },
        null,
        2
      );
      fs.writeFileSync(targetPath, payload, { mode: 0o600 });
      return `✅ Exported ${thoughts.length} thought${thoughts.length === 1 ? '' : 's'} to ${targetPath}`;
    } catch (error) {
      return `❌ Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  /**
   * Import thoughts from a JSON file produced by --export.
   * Skips thoughts whose IDs already exist.
   */
  private static async handleImport(args: Record<string, any>): Promise<string> {
    const sourcePath = (args.import || '').trim();
    if (!sourcePath) {
      return '❌ Import requires a file path: !mindpalace --import <path>';
    }

    if (!fs.existsSync(sourcePath)) {
      return `❌ Import file not found: ${sourcePath}`;
    }

    try {
      const raw = fs.readFileSync(sourcePath, 'utf-8');
      const parsed = JSON.parse(raw);
      const thoughts = Array.isArray(parsed) ? parsed : parsed.thoughts;

      if (!Array.isArray(thoughts)) {
        return '❌ Import file must contain an array or { thoughts: [...] }';
      }

      const storage = getStorageManager();
      let imported = 0;
      let skipped = 0;

      for (const t of thoughts) {
        const existing = await storage.getThought(t.id);
        if (existing) {
          skipped++;
          continue;
        }

        await ThoughtCapturer.capture(t.content, {
          topic: t.metadata?.topic,
          confidence: t.metadata?.confidence,
          tags: t.metadata?.tags,
          category: t.metadata?.category,
          emotionalTone: t.metadata?.emotionalTone,
          domain: t.source?.domain,
          userQuery: t.source?.userQuery,
          conversationId: t.source?.conversation,
          modelVersion: t.metadata?.modelVersion,
        });
        imported++;
      }

      return `✅ Imported ${imported} thoughts (skipped ${skipped} duplicates)`;
    } catch (error) {
      return `❌ Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  /**
   * Compact the JSONL log (remove superseded versions).
   */
  private static async handleCompact(): Promise<string> {
    try {
      const { removedLines, beforeBytes, afterBytes } = await OperationsManager.compactJSONL();
      return `✅ Compacted JSONL: removed ${removedLines} lines, ${CompressionManager.formatBytes(beforeBytes)} → ${CompressionManager.formatBytes(afterBytes)}`;
    } catch (error) {
      return `❌ Compaction failed: ${error instanceof Error ? error.message : 'Unknown'}`;
    }
  }

  /**
   * Write a SHA-256 manifest of storage files.
   */
  private static async handleManifest(): Promise<string> {
    try {
      const { path: mPath, files } = await OperationsManager.writeBackupManifest();
      const entries = Object.entries(files)
        .map(([name, hash]) => `  ${name}: ${hash.substring(0, 16)}...`)
        .join('\n');
      return `✅ Manifest written to ${mPath}\n${entries}`;
    } catch (error) {
      return `❌ Manifest write failed: ${error instanceof Error ? error.message : 'Unknown'}`;
    }
  }

  /**
   * Verify storage files against a manifest.
   */
  private static async handleVerify(): Promise<string> {
    try {
      const mismatches = await OperationsManager.verifyBackupManifest();
      if (mismatches.length === 0) {
        return '✅ All storage files verified against manifest';
      }
      const lines = mismatches
        .map((m) => `  ${m.file}: ${m.actual ? 'CORRUPTED' : 'MISSING'}`)
        .join('\n');
      return `❌ ${mismatches.length} mismatch(es):\n${lines}`;
    } catch (error) {
      return `❌ Verification failed: ${error instanceof Error ? error.message : 'Unknown'}`;
    }
  }

  /**
   * Show operational metrics snapshot.
   */
  private static async handleMetrics(): Promise<string> {
    try {
      const m = await OperationsManager.collectMetrics();
      return `
📈 Mind Palace Metrics
━━━━━━━━━━━━━━━━━━━━━━
Thoughts:        ${m.thoughts.total} total (${m.thoughts.compressed} compressed, ${m.thoughts.encrypted} encrypted)
Storage:         JSONL ${CompressionManager.formatBytes(m.storage.jsonlBytes)} | DB ${CompressionManager.formatBytes(m.storage.dbBytes)}
Capture latency: ${m.performance.captureLatencyMs.toFixed(2)}ms
Search latency:  ${m.performance.searchLatencyMs.toFixed(2)}ms
      `.trim();
    } catch (error) {
      return `❌ Metrics collection failed: ${error instanceof Error ? error.message : 'Unknown'}`;
    }
  }

  /**
   * Rebuild SQLite index from JSONL source of truth.
   */
  private static async handleRebuild(): Promise<string> {
    try {
      const storage = getStorageManager();
      const count = await storage.rebuildIndex();
      return `✅ Rebuilt index from JSONL: ${count} thought${count === 1 ? '' : 's'} reindexed`;
    } catch (error) {
      return `❌ Rebuild failed: ${error instanceof Error ? error.message : 'Unknown'}`;
    }
  }

  /**
   * Backfill embeddings for thoughts missing them.
   */
  private static async handleBackfill(): Promise<string> {
    try {
      const storage = getStorageManager();
      const count = await storage.backfillEmbeddings();
      return `✅ Generated ${count} embedding${count === 1 ? '' : 's'}`;
    } catch (error) {
      return `❌ Backfill failed: ${error instanceof Error ? error.message : 'Unknown'}`;
    }
  }

  private static async handleClear(): Promise<string> {
    const storage = getStorageManager();
    const config = getConfigManager();
    const storageDir = config.getStorageDir();

    try {
      // Close the database before deleting
      storage.close();

      // Delete all thoughts from database (cascade delete via foreign keys)
      const db = storage['getDb']?.() || null;
      if (db) {
        await new Promise<void>((resolve, reject) => {
          db.run('DELETE FROM thoughts', (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }

      // Clear JSONL file
      if (fs.existsSync(path.join(storageDir, 'thoughts.jsonl'))) {
        fs.writeFileSync(path.join(storageDir, 'thoughts.jsonl'), '', { mode: 0o600 });
      }

      // Reinitialize storage for future use
      await storage.initialize();

      return '✅ Mind Palace cleared. All thoughts have been deleted.';
    } catch (error) {
      return `❌ Failed to clear Mind Palace: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  /**
   * Format search results
   */
  private static formatResults(
    thoughts: any[],
    count: number,
    offset: number,
    fullResult?: SearchResult
  ): string {
    if (thoughts.length === 0) {
      return '✨ No thoughts found.';
    }

    let output = `\n📚 Found ${count} thought${count !== 1 ? 's' : ''}\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

    thoughts.forEach((thought, index) => {
      const score = fullResult?.scores?.[thought.id];
      const scoreStr = score !== undefined ? ` (${(score * 100).toFixed(0)}%)` : '';

      output += `
[${offset + index + 1}] ${thought.metadata.topic || 'Untitled'}${scoreStr}
    ID: ${thought.id}
    Date: ${new Date(thought.timestamp).toLocaleString()}
    Category: ${thought.metadata.category} | Confidence: ${(thought.metadata.confidence * 100).toFixed(0)}%
    ${thought.metadata.tags.length > 0 ? `Tags: ${thought.metadata.tags.join(', ')}` : ''}
    Preview: ${thought.content.substring(0, 100)}${thought.content.length > 100 ? '...' : ''}
      `;
    });

    return output.trim();
  }

  private static getHelpMessage(): string {
    return `
🧠 Mind Palace - Command Reference
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CAPTURE:
  !mindpalace --capture "Your thought here"
  !mindpalace -c "Quick note"

SEARCH:
  !mindpalace -k "keyword search"               # Keyword search
  !mindpalace -s "semantic query"               # Semantic search
  !mindpalace -t "2026-04-01 to 2026-04-11"    # Time range
  !mindpalace -t "last 7 days"                  # Relative time
  !mindpalace --recent 10                       # Recent thoughts

FILTERS:
  !mindpalace --tag "important,urgent"          # By tags
  !mindpalace --category response               # By category
  !mindpalace --confidence ">0.8"                # By confidence
  !mindpalace --domain backend                  # By domain

OPTIONS:
  --limit 20                                    # Limit results
  --offset 10                                   # Skip results
  --sort recent|relevant|confidence             # Sort order

CONFIG:
  !mindpalace --config                          # Show all config
  !mindpalace --config autoCapture=false        # Set value

STATS & STORAGE:
  !mindpalace --stats                           # Show statistics
  !mindpalace --stats --compression             # Include compression stats
  !mindpalace --metrics                         # Operational metrics + latency
  !mindpalace --compact                         # Compact JSONL (remove old versions)
  !mindpalace --manifest                        # Write SHA-256 integrity manifest
  !mindpalace --verify                          # Verify against manifest
  !mindpalace --rebuild                         # Rebuild DB from JSONL (recovery)
  !mindpalace --backfill                        # Generate missing embeddings
  !mindpalace --clear                           # Delete all thoughts
  !mindpalace --export [path]                   # Export to JSON
  !mindpalace --import <path>                   # Import from JSON
  !mindpalace --help                            # Show this help

AUTO-RETRIEVAL:
  Related thoughts are automatically found when auto-retrieval is enabled.
  Toggle: clawbot config mind-palace.autoRetrieval.enabled true|false

COMPRESSION:
  Older thoughts are automatically compressed based on age.
  Compression setting: clawbot config mind-palace.storage.compression lz4|gzip|none
    `.trim();
  }
}

export default CLICommandHandler;
