import zlib from 'zlib';
import { CompressionType } from '../types';

/**
 * Compress data using specified algorithm
 * Note: LZ4 is treated as deflate for simplicity with Node's zlib
 */
export function compress(data: string, algorithm: CompressionType = 'lz4'): Buffer {
  if (algorithm === 'none') {
    return Buffer.from(data, 'utf-8');
  }

  const buffer = Buffer.from(data, 'utf-8');

  // Use deflate for 'lz4' (similar compression ratio, same algorithm family)
  if (algorithm === 'lz4') {
    return zlib.deflateSync(buffer);
  }

  if (algorithm === 'gzip') {
    return zlib.gzipSync(buffer);
  }

  return buffer;
}

/**
 * Decompress data using specified algorithm
 */
export function decompress(buffer: Buffer, algorithm: CompressionType = 'lz4'): string {
  if (algorithm === 'none') {
    return buffer.toString('utf-8');
  }

  try {
    if (algorithm === 'lz4') {
      const decompressed = zlib.inflateSync(buffer);
      return decompressed.toString('utf-8');
    }

    if (algorithm === 'gzip') {
      return zlib.gunzipSync(buffer).toString('utf-8');
    }
  } catch (error) {
    // If decompression fails, assume it's uncompressed
    console.warn('Decompression failed, treating as uncompressed:', error);
  }

  return buffer.toString('utf-8');
}

/**
 * Calculate compression ratio
 */
export function getCompressionRatio(original: Buffer, compressed: Buffer): number {
  if (original.length === 0) return 0;
  return 1 - compressed.length / original.length;
}

/**
 * Determine if content should be compressed based on size
 */
export function shouldCompress(data: string, minSizeBytes: number = 1024): boolean {
  return Buffer.byteLength(data, 'utf-8') > minSizeBytes;
}
