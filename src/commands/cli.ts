import fs from 'fs';
import path from 'path';
import { SearchAPI } from '../search/search';
import { ThoughtCapturer } from '../capture/capturer';
import { getConfigManager } from '../config/config';
import { getStorageManager } from '../storage/store';
import { CompressionManager } from '../storage/compression-manager';
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
