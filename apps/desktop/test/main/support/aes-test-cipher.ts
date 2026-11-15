import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { SecretCipher } from '../../../src/main/platform/secret-cipher';

export class AesTestCipher implements SecretCipher {
  private readonly key = randomBytes(32);

  constructor(private available = true) {}

  setAvailable(available: boolean): void {
    this.available = available;
  }

  isAvailable(): Promise<boolean> {
    return Promise.resolve(this.available);
  }

  encrypt(plainText: string): Promise<Uint8Array> {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const body = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    return Promise.resolve(Buffer.concat([iv, cipher.getAuthTag(), body]));
  }

  decrypt(cipherText: Uint8Array): Promise<string> {
    const buffer = Buffer.from(cipherText);
    const decipher = createDecipheriv('aes-256-gcm', this.key, buffer.subarray(0, 12));
    decipher.setAuthTag(buffer.subarray(12, 28));
    const body = Buffer.concat([decipher.update(buffer.subarray(28)), decipher.final()]);
    return Promise.resolve(body.toString('utf8'));
  }
}
