import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * Encryption module for Mind Palace.
 * Uses AES-256-GCM with a persistent key stored in the config directory.
 * Each record gets a fresh 96-bit IV; authentication tag is included in payload.
 *
 * Payload format (base64-encoded):
 *   [12-byte IV][16-byte auth tag][ciphertext]
 */

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_FILE = 'encryption.key';

let cachedKey: Buffer | null = null;

/**
 * Load or generate the encryption key.
 * Priority:
 *   1. MIND_PALACE_KEY env var (hex-encoded 256-bit key)
 *   2. Persistent key file at <storageDir>/encryption.key
 *   3. Generate new key and persist with 0o600 permissions
 */
export function getEncryptionKey(storageDir: string): Buffer {
  if (cachedKey) return cachedKey;

  const envKey = process.env.MIND_PALACE_KEY;
  if (envKey) {
    const buf = Buffer.from(envKey, 'hex');
    if (buf.length !== KEY_LENGTH) {
      throw new Error(`MIND_PALACE_KEY must be ${KEY_LENGTH * 2} hex chars (${KEY_LENGTH} bytes)`);
    }
    cachedKey = buf;
    return buf;
  }

  const keyPath = path.join(storageDir, KEY_FILE);

  if (fs.existsSync(keyPath)) {
    const buf = fs.readFileSync(keyPath);
    if (buf.length !== KEY_LENGTH) {
      throw new Error(`Encryption key at ${keyPath} is corrupted (expected ${KEY_LENGTH} bytes)`);
    }
    cachedKey = buf;
    return buf;
  }

  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true, mode: 0o700 });
  }

  const key = crypto.randomBytes(KEY_LENGTH);
  fs.writeFileSync(keyPath, key, { mode: 0o600 });
  cachedKey = key;
  return key;
}

/**
 * Encrypt a plaintext string. Returns base64-encoded [IV|tag|ciphertext].
 */
export function encrypt(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

/**
 * Decrypt a base64-encoded payload produced by encrypt().
 * Throws on authentication failure (tampered data).
 */
export function decrypt(payload: string, key: Buffer): string {
  const data = Buffer.from(payload, 'base64');

  if (data.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error('Encrypted payload too short');
  }

  const iv = data.subarray(0, IV_LENGTH);
  const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = data.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf-8');
}

/**
 * Reset cached key (for testing)
 */
export function resetEncryptionCache(): void {
  cachedKey = null;
}
