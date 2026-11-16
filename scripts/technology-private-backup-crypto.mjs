/**
 * AES-256-GCM authenticated format for privately stored Haber D1 backups.
 *
 * Raw SQL and encryption keys never appear in process output or artifacts
 * other than an ephemeral mode-0600 SQL file. Bytes, not passwords, are the
 * encryption inputs. Key escrow belongs in macOS Keychain, outside this repo.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const HEADER = Buffer.from('HAB1');
const ASSOCIATED_DATA = Buffer.from('equinox-haber:production-d1:sql-backup:v1');
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
export const MAX_BACKUP_BYTES = 128 * 1024 * 1024;
export const MAX_CIPHERTEXT_BYTES = MAX_BACKUP_BYTES + HEADER.length + NONCE_BYTES + TAG_BYTES;

export function encryptPrivateSqlBackup(plaintext, key, nonce = randomBytes(NONCE_BYTES)) {
  if (!Buffer.isBuffer(plaintext) || plaintext.length < 100_000
    || plaintext.length > MAX_BACKUP_BYTES
    || !Buffer.isBuffer(key) || key.length !== 32
    || !Buffer.isBuffer(nonce) || nonce.length !== NONCE_BYTES) {
    throw new Error('invalid_sql_backup_encryption_inputs');
  }
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(ASSOCIATED_DATA);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([HEADER, nonce, encrypted, cipher.getAuthTag()]);
}

export function decryptPrivateSqlBackup(payload, key) {
  if (!Buffer.isBuffer(payload) || payload.length < HEADER.length + NONCE_BYTES + TAG_BYTES + 100_000
    || payload.length > MAX_CIPHERTEXT_BYTES
    || !payload.subarray(0, HEADER.length).equals(HEADER)
    || !Buffer.isBuffer(key) || key.length !== 32) {
    throw new Error('invalid_encrypted_sql_backup_envelope');
  }
  const nonce = payload.subarray(HEADER.length, HEADER.length + NONCE_BYTES);
  const tag = payload.subarray(payload.length - TAG_BYTES);
  const ciphertext = payload.subarray(HEADER.length + NONCE_BYTES, payload.length - TAG_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAAD(ASSOCIATED_DATA);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new Error('sql_backup_authentication_failed');
  }
}
