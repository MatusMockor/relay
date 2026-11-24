import { TaskSystemConnectionIdSchema, type TaskSystemCredentials } from '@relay/shared/domain';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EncryptedFileSecretStore } from '../../src/main/secure/encrypted-file-secret-store';
import { NamespacedSecretStore } from '../../src/main/secure/namespaced-secret-store';
import { SecretStoreTaskSystemSecrets } from '../../src/main/secure/secret-store-task-system-secrets';
import { AesTestCipher } from './support/aes-test-cipher';
import { createTempDir, type TempDir } from './support/temp-dir';

const credentials: TaskSystemCredentials = {
  provider: 'jira',
  email: 'alice@acme.test',
  apiToken: 'jira-api-secret',
};

const connectionId = TaskSystemConnectionIdSchema.parse('tsc_1');

describe('SecretStoreTaskSystemSecrets', () => {
  let dir: TempDir;
  const cipher = new AesTestCipher();

  const secretsAt = (path: string) => {
    const store = new EncryptedFileSecretStore(path, cipher);
    return {
      secrets: new SecretStoreTaskSystemSecrets(new NamespacedSecretStore(store, 'task-systems')),
      other: new NamespacedSecretStore(store, 'credentials'),
    };
  };

  beforeEach(async () => {
    dir = await createTempDir();
  });

  afterEach(async () => {
    await dir.remove();
  });

  it('stores the credentials encrypted and reads them back after a restart', async () => {
    const path = dir.file('secrets.bin');
    await secretsAt(path).secrets.set(connectionId, credentials);

    expect(await readFile(path, 'utf8')).not.toContain('jira-api-secret');
    await expect(secretsAt(path).secrets.get(connectionId)).resolves.toEqual(credentials);
    await expect(secretsAt(path).other.get(connectionId)).resolves.toBeNull();
  });

  it('deletes the credentials and ignores entries that are not valid credentials', async () => {
    const path = dir.file('secrets.bin');
    const { secrets } = secretsAt(path);
    await secrets.set(connectionId, credentials);
    await secrets.delete(connectionId);
    await expect(secrets.get(connectionId)).resolves.toBeNull();

    const raw = new NamespacedSecretStore(
      new EncryptedFileSecretStore(path, cipher),
      'task-systems',
    );
    await raw.set(connectionId, '{"provider":"jira"}');
    await expect(secrets.get(connectionId)).resolves.toBeNull();
  });
});
