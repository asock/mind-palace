import { Thought } from '../types';

/**
 * Schema validation for Mind Palace data.
 * Prevents prototype pollution, deeply nested DoS, and malformed records.
 * Zero-dependency — uses manual checks rather than pulling in zod/joi.
 */

const MAX_CONTENT_LENGTH = 10 * 1024 * 1024; // 10MB
const MAX_TAG_COUNT = 100;
const MAX_TAG_LENGTH = 200;
const MAX_DEPTH = 8;
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Recursively check for dangerous keys and excessive depth.
 * Returns true if the object is safe to use.
 */
export function isSafeObject(obj: unknown, depth: number = 0): boolean {
  if (depth > MAX_DEPTH) return false;
  if (obj === null || typeof obj !== 'object') return true;

  for (const key of Object.keys(obj as object)) {
    if (DANGEROUS_KEYS.has(key)) return false;
    if (!isSafeObject((obj as Record<string, unknown>)[key], depth + 1)) return false;
  }

  return true;
}

/**
 * Validate a parsed thought matches the expected schema.
 * Throws descriptive error on failure.
 */
export function validateThought(raw: unknown): Thought {
  if (!isSafeObject(raw)) {
    throw new Error('Thought failed safety validation (prototype pollution or excessive depth)');
  }

  if (raw === null || typeof raw !== 'object') {
    throw new Error('Thought must be an object');
  }

  const t = raw as Record<string, unknown>;

  if (typeof t.id !== 'string' || t.id.length === 0) {
    throw new Error('Thought.id must be a non-empty string');
  }

  if (typeof t.timestamp !== 'string' || isNaN(Date.parse(t.timestamp))) {
    throw new Error('Thought.timestamp must be a valid ISO-8601 string');
  }

  if (typeof t.content !== 'string') {
    throw new Error('Thought.content must be a string');
  }

  if (t.content.length > MAX_CONTENT_LENGTH) {
    throw new Error(`Thought.content exceeds ${MAX_CONTENT_LENGTH} byte limit`);
  }

  if (!t.metadata || typeof t.metadata !== 'object') {
    throw new Error('Thought.metadata must be an object');
  }

  const meta = t.metadata as Record<string, unknown>;

  if (typeof meta.confidence !== 'number' || meta.confidence < 0 || meta.confidence > 1) {
    throw new Error('metadata.confidence must be a number in [0, 1]');
  }

  if (typeof meta.category !== 'string') {
    throw new Error('metadata.category must be a string');
  }

  if (!Array.isArray(meta.tags)) {
    throw new Error('metadata.tags must be an array');
  }

  if (meta.tags.length > MAX_TAG_COUNT) {
    throw new Error(`metadata.tags exceeds ${MAX_TAG_COUNT} limit`);
  }

  for (const tag of meta.tags) {
    if (typeof tag !== 'string' || tag.length > MAX_TAG_LENGTH) {
      throw new Error('metadata.tags entries must be strings within length limit');
    }
  }

  return raw as Thought;
}

/**
 * Safely parse JSON with protection against prototype pollution.
 * Returns null on any parse or validation error.
 */
export function safeParseThought(line: string): Thought | null {
  try {
    const parsed = JSON.parse(line);
    return validateThought(parsed);
  } catch {
    return null;
  }
}
