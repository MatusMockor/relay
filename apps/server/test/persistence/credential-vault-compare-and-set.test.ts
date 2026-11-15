import { randomBytes } from 'node:crypto';
import type { AccountCredentials, AccountId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { AesGcmCipher } from '../../src/persistence/credentials/aes-gcm-cipher';
import { AesGcmCredentialVault } from '../../src/persistence/credentials/aes-gcm-credential-vault';
import { PgAccountCredentialStore } from '../../src/persistence/credentials/pg-account-credential-store';
import type { DbExecutor } from '../../src/persistence/database/database';
import { at, seedAccount } from './support/fixtures';
import { usePgTestContext } from './support/pg-test-context';

const grant = (refreshToken: string, accessToken: string): AccountCredentials => ({
  kind: 'oauth',
  provider: 'gmail',
  accessToken,
  refreshToken,
  expiresAt: at(60),
  scope: 'https://mail.google.com/',
});

class ReadBarrierStore extends PgAccountCredentialStore {
  private readonly arrivals: (() => void)[] = [];

  constructor(
    db: DbExecutor,
    private readonly readers: number,
  ) {
    super(db);
  }

  override async find(accountId: AccountId): Promise<string | null> {
    const envelope = await super.find(accountId);
    await new Promise<void>((arrive) => {
      this.arrivals.push(arrive);
      if (this.arrivals.length === this.readers) {
        this.arrivals.forEach((release) => {
          release();
        });
      }
    });
    return envelope;
  }
}

describe('AesGcmCredentialVault.setIfUnchanged', () => {
  const context = usePgTestContext();
  const key = randomBytes(32);
  const vault = () =>
    new AesGcmCredentialVault(new PgAccountCredentialStore(context.db), new AesGcmCipher(key));

  it('replaces credentials that are still the expected ones', async () => {
    const seeded = await seedAccount(context.repositories);
    await vault().set(seeded.account.id, grant('refresh-1', 'old'));

    await expect(
      vault().setIfUnchanged(
        seeded.account.id,
        grant('refresh-1', 'old'),
        grant('refresh-1', 'fresh'),
      ),
    ).resolves.toBe(true);
    await expect(vault().get(seeded.account.id)).resolves.toEqual(grant('refresh-1', 'fresh'));
  });

  it('keeps a newer grant that was stored in the meantime', async () => {
    const seeded = await seedAccount(context.repositories);
    await vault().set(seeded.account.id, grant('refresh-2', 'reauthorized'));

    await expect(
      vault().setIfUnchanged(
        seeded.account.id,
        grant('refresh-1', 'old'),
        grant('refresh-1', 'fresh'),
      ),
    ).resolves.toBe(false);
    await expect(vault().get(seeded.account.id)).resolves.toEqual(
      grant('refresh-2', 'reauthorized'),
    );
  });

  it('does not resurrect credentials of a deleted account', async () => {
    const seeded = await seedAccount(context.repositories);
    await vault().set(seeded.account.id, grant('refresh-1', 'old'));
    await context.repositories.accounts.delete(seeded.user.id, seeded.account.id);

    await expect(
      vault().setIfUnchanged(
        seeded.account.id,
        grant('refresh-1', 'old'),
        grant('refresh-1', 'fresh'),
      ),
    ).resolves.toBe(false);
    await expect(vault().get(seeded.account.id)).resolves.toBeNull();
  });

  it('lets only one of two concurrent refreshes of the same grant win', async () => {
    const seeded = await seedAccount(context.repositories);
    await vault().set(seeded.account.id, grant('refresh-1', 'old'));

    const racing = new AesGcmCredentialVault(
      new ReadBarrierStore(context.db, 2),
      new AesGcmCipher(key),
    );
    const results = await Promise.all(
      ['first', 'second'].map((token) =>
        racing.setIfUnchanged(
          seeded.account.id,
          grant('refresh-1', 'old'),
          grant('refresh-1', token),
        ),
      ),
    );

    expect(results.filter(Boolean)).toHaveLength(1);
    const stored = await vault().get(seeded.account.id);
    expect(stored?.kind === 'oauth' ? stored.accessToken : null).toBe(
      results[0] === true ? 'first' : 'second',
    );
  });
});
