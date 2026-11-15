import { AccountIdSchema, type AccountCredentials } from '@relay/shared/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EncryptedFileSecretStore } from '../../src/main/secure/encrypted-file-secret-store';
import { NamespacedSecretStore } from '../../src/main/secure/namespaced-secret-store';
import { SecretStoreCredentialVault } from '../../src/main/secure/secret-store-credential-vault';
import { AesTestCipher } from './support/aes-test-cipher';
import { createTempDir, type TempDir } from './support/temp-dir';

const grant = (refreshToken: string, accessToken: string): AccountCredentials => ({
  kind: 'oauth',
  provider: 'gmail',
  accessToken,
  refreshToken,
  expiresAt: '2026-11-15T11:00:00.000Z',
  scope: null,
});

const accountId = AccountIdSchema.parse('acc_1');

describe('SecretStoreCredentialVault.setIfUnchanged', () => {
  let dir: TempDir;
  const cipher = new AesTestCipher();

  const vaultAt = (path: string) =>
    new SecretStoreCredentialVault(
      new NamespacedSecretStore(new EncryptedFileSecretStore(path, cipher), 'credentials'),
    );

  beforeEach(async () => {
    dir = await createTempDir();
  });

  afterEach(async () => {
    await dir.remove();
  });

  it('replaces unchanged credentials and persists them across a restart', async () => {
    const path = dir.file('secrets.bin');
    const vault = vaultAt(path);
    await vault.set(accountId, grant('refresh-1', 'old'));

    await expect(
      vault.setIfUnchanged(accountId, grant('refresh-1', 'old'), grant('refresh-1', 'fresh')),
    ).resolves.toBe(true);
    await expect(vaultAt(path).get(accountId)).resolves.toEqual(grant('refresh-1', 'fresh'));
  });

  it('keeps a newer grant and does not resurrect deleted credentials', async () => {
    const vault = vaultAt(dir.file('secrets.bin'));
    await vault.set(accountId, grant('refresh-2', 'reauthorized'));

    await expect(
      vault.setIfUnchanged(accountId, grant('refresh-1', 'old'), grant('refresh-1', 'fresh')),
    ).resolves.toBe(false);
    await expect(vault.get(accountId)).resolves.toEqual(grant('refresh-2', 'reauthorized'));

    await vault.delete(accountId);
    await expect(
      vault.setIfUnchanged(
        accountId,
        grant('refresh-2', 'reauthorized'),
        grant('refresh-2', 'fresh'),
      ),
    ).resolves.toBe(false);
    await expect(vault.get(accountId)).resolves.toBeNull();
  });

  it('serializes concurrent writes so a delete during the swap wins', async () => {
    const vault = vaultAt(dir.file('secrets.bin'));
    await vault.set(accountId, grant('refresh-1', 'old'));

    const [, swapped] = await Promise.all([
      vault.delete(accountId),
      vault.setIfUnchanged(accountId, grant('refresh-1', 'old'), grant('refresh-1', 'fresh')),
    ]);

    expect(swapped).toBe(false);
    await expect(vault.get(accountId)).resolves.toBeNull();
  });
});
