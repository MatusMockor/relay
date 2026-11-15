import { randomBytes } from 'node:crypto';
import { NotFoundError } from '@relay/engine';
import type { AccountCredentials, AccountId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { AesGcmCipher } from '../../src/persistence/credentials/aes-gcm-cipher';
import { AesGcmCredentialVault } from '../../src/persistence/credentials/aes-gcm-credential-vault';
import { CredentialDecryptionError } from '../../src/persistence/credentials/credential-decryption-error';
import { parseCredentialsKey } from '../../src/persistence/credentials/credentials-key';
import { PgAccountCredentialStore } from '../../src/persistence/credentials/pg-account-credential-store';
import { at, seedAccount } from './support/fixtures';
import { usePgTestContext } from './support/pg-test-context';

const password: AccountCredentials = { kind: 'password', password: 'tajné heslo ľščťž' };
const oauth: AccountCredentials = {
  kind: 'oauth',
  provider: 'gmail',
  accessToken: 'ya29.access',
  refreshToken: '1//refresh',
  expiresAt: at(60),
  scope: 'https://mail.google.com/',
};

const newKey = (): Buffer => randomBytes(32);

const flipCharAt = (value: string, index: number): string => {
  const char = value[index] === 'A' ? 'B' : 'A';
  return `${value.slice(0, index)}${char}${value.slice(index + 1)}`;
};

describe('AesGcmCredentialVault', () => {
  const context = usePgTestContext();

  const vaultWith = (key: Buffer) =>
    new AesGcmCredentialVault(new PgAccountCredentialStore(context.db), new AesGcmCipher(key));

  it('round-trips password and oauth credentials and stores no plaintext', async () => {
    const vault = vaultWith(newKey());
    const first = await seedAccount(context.repositories);
    const second = await seedAccount(context.repositories);
    await vault.set(first.account.id, password);
    await vault.set(second.account.id, oauth);

    await expect(vault.get(first.account.id)).resolves.toEqual(password);
    await expect(vault.get(second.account.id)).resolves.toEqual(oauth);
    const envelope = await new PgAccountCredentialStore(context.db).find(first.account.id);
    expect(envelope).toMatch(/^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(envelope).not.toContain('heslo');
  });

  it('overwrites, deletes and returns null for missing credentials', async () => {
    const vault = vaultWith(newKey());
    const seeded = await seedAccount(context.repositories);
    await vault.set(seeded.account.id, password);
    await vault.set(seeded.account.id, oauth);
    await expect(vault.get(seeded.account.id)).resolves.toEqual(oauth);
    await vault.delete(seeded.account.id);
    await expect(vault.get(seeded.account.id)).resolves.toBeNull();
    await expect(vault.set('account_unknown' as AccountId, password)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('detects a tampered ciphertext, tag or iv', async () => {
    const key = newKey();
    const vault = vaultWith(key);
    const store = new PgAccountCredentialStore(context.db);
    const seeded = await seedAccount(context.repositories);
    await vault.set(seeded.account.id, password);
    const envelope = (await store.find(seeded.account.id)) ?? '';
    const [version, iv, tag, ciphertext] = envelope.split('.');

    for (const tampered of [
      [version, iv, tag, flipCharAt(ciphertext ?? '', 0)],
      [version, iv, flipCharAt(tag ?? '', 0), ciphertext],
      [version, flipCharAt(iv ?? '', 0), tag, ciphertext],
      ['v2', iv, tag, ciphertext],
      [version, iv, tag],
    ]) {
      await store.save(seeded.account.id, tampered.join('.'));
      await expect(vault.get(seeded.account.id)).rejects.toBeInstanceOf(CredentialDecryptionError);
    }
  });

  it('refuses to decrypt with a wrong key or under another account', async () => {
    const vault = vaultWith(newKey());
    const store = new PgAccountCredentialStore(context.db);
    const victim = await seedAccount(context.repositories);
    const attacker = await seedAccount(context.repositories);
    await vault.set(victim.account.id, password);

    await expect(vaultWith(newKey()).get(victim.account.id)).rejects.toBeInstanceOf(
      CredentialDecryptionError,
    );
    await store.save(attacker.account.id, (await store.find(victim.account.id)) ?? '');
    await expect(vault.get(attacker.account.id)).rejects.toBeInstanceOf(CredentialDecryptionError);
  });
});

describe('credentials key', () => {
  it('accepts exactly 32 base64 bytes', () => {
    const key = randomBytes(32);
    expect(parseCredentialsKey(key.toString('base64'))).toEqual(key);
    expect(() => parseCredentialsKey(randomBytes(16).toString('base64'))).toThrow(/32 bytes/);
    expect(() => new AesGcmCipher(randomBytes(31))).toThrow(/32 bytes/);
  });

  it('produces a fresh iv for every encryption', () => {
    const cipher = new AesGcmCipher(newKey());
    expect(cipher.encrypt('same', 'aad')).not.toBe(cipher.encrypt('same', 'aad'));
    expect(cipher.decrypt(cipher.encrypt('same', 'aad'), 'aad')).toBe('same');
  });
});
