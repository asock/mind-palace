/**
 * Real TF-IDF vector embeddings for Mind Palace semantic search.
 *
 * Produces fixed-dimension vectors via feature hashing so the dimension
 * stays constant as the vocabulary grows. Vectors are persisted as Float32
 * BLOBs in the thought_embeddings SQLite table.
 *
 * This is pluggable — a future version can swap in a real transformer model
 * (e.g. @xenova/transformers MiniLM) by implementing the Embedder interface.
 */

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from',
  'if', 'in', 'into', 'is', 'it', 'its', 'no', 'not', 'of', 'on', 'or',
  'such', 'that', 'the', 'their', 'then', 'there', 'these', 'they', 'this',
  'to', 'was', 'will', 'with', 'has', 'have', 'had', 'do', 'does', 'did',
  'can', 'could', 'would', 'should', 'may', 'might', 'must', 'i', 'you',
  'he', 'she', 'we', 'them', 'us', 'me', 'my', 'your', 'our',
]);

export const DEFAULT_DIMENSION = 384;

/**
 * Tokenize text: lowercase, strip punctuation, filter stopwords and short tokens.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

/**
 * Deterministic 32-bit hash for a string (FNV-1a variant).
 * Used for feature hashing tokens to fixed vector dimensions.
 */
export function hashToken(token: string, seed: number = 0): number {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Build a sparse TF (term frequency) map from tokens.
 */
export function termFrequencies(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }
  return tf;
}

/**
 * Convert tokens into a dense vector using feature hashing + TF weighting.
 * A second hash determines the sign so collisions can cancel rather than compound.
 */
export function embed(text: string, dimension: number = DEFAULT_DIMENSION): Float32Array {
  const vec = new Float32Array(dimension);
  const tokens = tokenize(text);
  if (tokens.length === 0) return vec;

  const tf = termFrequencies(tokens);
  const total = tokens.length;

  for (const [token, count] of tf) {
    const idx = hashToken(token) % dimension;
    const sign = hashToken(token, 1) % 2 === 0 ? 1 : -1;
    // Log-scaled TF normalized by total tokens
    vec[idx] += sign * (1 + Math.log(count)) * (count / total);
  }

  // L2-normalize so cosine similarity simplifies to dot product
  let norm = 0;
  for (let i = 0; i < dimension; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < dimension; i++) vec[i] /= norm;
  }

  return vec;
}

/**
 * Cosine similarity between two L2-normalized vectors (dot product).
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

/**
 * Serialize a Float32Array to a Buffer for SQLite BLOB storage.
 */
export function vectorToBuffer(vec: Float32Array): Buffer {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
}

/**
 * Deserialize a Buffer back into a Float32Array.
 */
export function bufferToVector(buf: Buffer): Float32Array {
  const copy = Buffer.from(buf);
  return new Float32Array(copy.buffer, copy.byteOffset, copy.byteLength / 4);
}
