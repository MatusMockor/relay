import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { CredentialDecryptionError } from './credential-decryption-error';
import { formatEnvelope, parseEnvelope } from './credential-envelope';
import { CREDENTIALS_KEY_BYTES } from './credentials-key';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

export class AesGcmCipher {
  constructor(private readonly key: Buffer) {
    if (key.length !== CREDENTIALS_KEY_BYTES) {
      throw new Error(`AES-256-GCM key must be ${String(CREDENTIALS_KEY_BYTES)} bytes`);
    }
  }

  encrypt(plaintext: string, associatedData: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv, { authTagLength: TAG_BYTES });
    cipher.setAAD(Buffer.from(associatedData, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return formatEnvelope({ iv, tag: cipher.getAuthTag(), ciphertext });
  }

  decrypt(raw: string, associatedData: string): string {
    const envelope = parseEnvelope(raw);
    if (envelope.iv.length !== IV_BYTES || envelope.tag.length !== TAG_BYTES) {
      throw new CredentialDecryptionError('Malformed credential envelope');
    }
    try {
      const decipher = createDecipheriv(ALGORITHM, this.key, envelope.iv, {
        authTagLength: TAG_BYTES,
      });
      decipher.setAAD(Buffer.from(associatedData, 'utf8'));
      decipher.setAuthTag(envelope.tag);
      return Buffer.concat([decipher.update(envelope.ciphertext), decipher.final()]).toString(
        'utf8',
      );
    } catch (error) {
      throw new CredentialDecryptionError('Credentials could not be decrypted', { cause: error });
    }
  }
}
