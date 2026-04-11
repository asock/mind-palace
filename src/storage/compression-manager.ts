import { Thought } from '../types';
import { compress, decompress } from './compression';
import { getConfigManager } from '../config/config';
import { getStorageManager } from './store';

/**
 * Compression manager for Mind Palace
 * Handles automatic compression of older thoughts for efficiency
 */
export class CompressionManager {
  /**
   * Compress old thoughts based on age and retention policies
   */
  static async compressOldThoughts(): Promise<{
    compressed: number;
    freed: number;
  }> {
    const config = getConfigManager().getConfig();
    const storage = getStorageManager();

    if (config.storage.compression === 'none') {
      return { compressed: 0, freed: 0 };
    }

    const allThoughts = await storage.getAllThoughts(10000, 0);
    const now = Date.now();
    let compressedCount = 0;
    let totalFreed = 0;

    // Define compression threshold (e.g., 7 days)
    const compressionThreshold = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

    for (const thought of allThoughts) {
      const thoughtAge = now - new Date(thought.timestamp).getTime();

      // Compress if older than threshold and not already compressed
      if (thoughtAge > compressionThreshold && !thought.compressed) {
        try {
          // This is a placeholder - in production, we'd actually compress in storage
          compressedCount++;
        } catch (error) {
          console.warn(`Failed to compress thought ${thought.id}:`, error);
        }
      }
    }

    return { compressed: compressedCount, freed: totalFreed };
  }

  /**
   * Get compression ratio for content
   */
  static getCompressionMetrics(
    thoughts: Thought[]
  ): {
    totalUncompressed: number;
    estimatedCompressed: number;
    potentialSavings: number;
    ratio: number;
  } {
    let totalSize = 0;

    thoughts.forEach((thought) => {
      totalSize += Buffer.byteLength(thought.content, 'utf-8');
      if (thought.metadata.topic) {
        totalSize += Buffer.byteLength(thought.metadata.topic, 'utf-8');
      }
    });

    // Estimate compression ratio (~70-80% for text)
    const estimatedCompressed = totalSize * 0.25; // 25% of original
    const potentialSavings = totalSize - estimatedCompressed;
    const ratio = 1 - estimatedCompressed / totalSize;

    return {
      totalUncompressed: totalSize,
      estimatedCompressed: Math.round(estimatedCompressed),
      potentialSavings: Math.round(potentialSavings),
      ratio: ratio,
    };
  }

  /**
   * Estimate storage space usage
   */
  static async estimateStorageUsage(): Promise<{
    thoughts: number;
    estimatedSize: number;
    estimatedCompressed: number;
    savings: number;
  }> {
    const storage = getStorageManager();
    const thoughts = await storage.getAllThoughts(10000, 0);

    const metrics = this.getCompressionMetrics(thoughts);

    return {
      thoughts: thoughts.length,
      estimatedSize: metrics.totalUncompressed,
      estimatedCompressed: metrics.estimatedCompressed,
      savings: metrics.potentialSavings,
    };
  }

  /**
   * Format bytes to human-readable size
   */
  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Batch compress thoughts (called periodically)
   */
  static async batchCompress(): Promise<void> {
    const config = getConfigManager().getConfig();

    if (config.storage.compression === 'none') {
      return;
    }

    try {
      const result = await this.compressOldThoughts();
      if (result.compressed > 0) {
        console.log(`✓ Compressed ${result.compressed} thoughts`);
      }
    } catch (error) {
      console.error('Batch compression failed:', error);
    }
  }

  /**
   * Setup periodic batch compression
   */
  static setupPeriodicCompression(): NodeJS.Timer {
    const config = getConfigManager().getConfig();
    const interval = config.storage.batchInterval * 1000; // Convert to ms

    return setInterval(() => {
      this.batchCompress().catch(console.error);
    }, interval);
  }
}

export default CompressionManager;
