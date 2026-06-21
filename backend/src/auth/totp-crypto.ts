import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/**
 * Chiffrement AES-256-GCM des secrets TOTP au repos (S-04).
 * La clé est dérivée de TOTP_ENCRYPTION_KEY (passphrase ou hex).
 * Format stocké : "v1:<iv_hex>:<tag_hex>:<ciphertext_hex>"
 * Les secrets hérités (stockés en clair, sans préfixe "v1:") restent lisibles.
 */

const PREFIX = 'v1:';

function deriveKey(passphrase: string): Buffer {
  return createHash('sha256').update(passphrase).digest();
}

export function encryptTotpSecret(plain: string, passphrase: string): string {
  const key = deriveKey(passphrase);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decryptTotpSecret(stored: string, passphrase: string): string {
  if (!stored.startsWith(PREFIX)) return stored; // secret hérité non chiffré
  const [ivHex, tagHex, dataHex] = stored.slice(PREFIX.length).split(':');
  const key = deriveKey(passphrase);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
}

export function isEncrypted(stored: string): boolean {
  return stored.startsWith(PREFIX);
}
