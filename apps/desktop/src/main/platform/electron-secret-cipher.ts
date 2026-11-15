import { safeStorage } from 'electron';
import type { SecretCipher } from './secret-cipher';

const INSECURE_LINUX_BACKENDS = new Set(['basic_text', 'unknown']);

export class ElectronSecretCipher implements SecretCipher {
  constructor(private readonly platform: NodeJS.Platform) {}

  async isAvailable(): Promise<boolean> {
    if (!(await safeStorage.isAsyncEncryptionAvailable())) {
      return false;
    }
    if (this.platform !== 'linux') {
      return true;
    }
    return !INSECURE_LINUX_BACKENDS.has(safeStorage.getSelectedStorageBackend());
  }

  encrypt(plainText: string): Promise<Uint8Array> {
    return safeStorage.encryptStringAsync(plainText);
  }

  async decrypt(cipherText: Uint8Array): Promise<string> {
    const result = await safeStorage.decryptStringAsync(Buffer.from(cipherText));
    return result.result;
  }
}
