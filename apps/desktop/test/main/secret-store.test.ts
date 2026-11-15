import { readFile } from 'node:fs/promises';
import { AccountIdSchema } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EncryptedFileSecretStore } from '../../src/main/secure/encrypted-file-secret-store';
import { NamespacedSecretStore } from '../../src/main/secure/namespaced-secret-store';
import { SecretStoreCredentialVault } from '../../src/main/secure/secret-store-credential-vault';
import { AesTestCipher } from './support/aes-test-cipher';
import { createTempDir, type TempDir } from './support/temp-dir';

describe('encrypted secret storage', () => {
  let dir: TempDir;

  beforeEach(async () => {
    dir = await createTempDir();
  });

  afterEach(async () => {
    await dir.remove();
  });

  it('stores values encrypted on disk and reads them back after a restart', async () => {
    const cipher = new AesTestCipher();
    const path = dir.file('secrets.bin');
    const store = new EncryptedFileSecretStore(path, cipher);
    await store.set('server.token', 'super-secret-refresh-token');
    expect((await readFile(path)).toString('utf8')).not.toContain('super-secret');
    const restarted = new EncryptedFileSecretStore(path, cipher);
    expect(await restarted.get('server.token')).toBe('super-secret-refresh-token');
    await restarted.delete('server.token');
    expect(await new EncryptedFileSecretStore(path, cipher).get('server.token')).toBeNull();
  });

  it('keeps renderer keys and account credentials in separate namespaces', async () => {
    const store = new EncryptedFileSecretStore(dir.file('secrets.bin'), new AesTestCipher());
    const renderer = new NamespacedSecretStore(store, 'renderer');
    const vault = new SecretStoreCredentialVault(new NamespacedSecretStore(store, 'credentials'));
    const accountId = AccountIdSchema.parse('acc_1');
    await vault.set(accountId, { kind: 'password', password: 'imap-pass' });
    expect(await renderer.get('acc_1')).toBeNull();
    expect(await renderer.get('credentials/acc_1')).toBeNull();
    expect(await vault.get(accountId)).toEqual({ kind: 'password', password: 'imap-pass' });
    await vault.delete(accountId);
    expect(await vault.get(accountId)).toBeNull();
  });

  it('fails with a clear message when the OS keyring never answers', async () => {
    const hangingCipher = Object.assign(new AesTestCipher(), {
      isAvailable: () => new Promise<boolean>(() => undefined),
    });
    const store = new EncryptedFileSecretStore(dir.file('secrets.bin'), hangingCipher, 20);
    await expect(store.set('server.token', 'x')).rejects.toMatchObject({
      code: 'internal',
      message: expect.stringContaining('kľúčenku') as unknown,
    });
  });

  it('fails with a clear message when the OS keyring is not available', async () => {
    const store = new EncryptedFileSecretStore(dir.file('secrets.bin'), new AesTestCipher(false));
    await expect(store.set('server.token', 'x')).rejects.toMatchObject({
      code: 'internal',
      message: expect.stringContaining('kľúčenku') as unknown,
    });
    await expect(store.get('server.token')).rejects.toMatchObject({ code: 'internal' });
  });
});
