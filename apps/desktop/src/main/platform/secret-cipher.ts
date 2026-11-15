export interface SecretCipher {
  isAvailable(): Promise<boolean>;
  encrypt(plainText: string): Promise<Uint8Array>;
  decrypt(cipherText: Uint8Array): Promise<string>;
}
