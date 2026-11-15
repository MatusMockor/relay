import type { GreenMailUser } from '@relay/config/test-infra';
import { ProviderError } from '@relay/engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DefaultMailProviderFactory, SmtpMailSender } from '../../src';
import { buildAccount, passwordCredentials } from '../support/accounts';
import { createGreenMailUser, deleteGreenMailUser } from '../support/greenmail';
import { createTokenProvider } from '../support/provider-harness';

describe('plaintext authentication is refused unless explicitly allowed', () => {
  let user: GreenMailUser;

  beforeEach(async () => {
    user = await createGreenMailUser();
  });

  afterEach(async () => {
    await deleteGreenMailUser(user);
  });

  it('requires STARTTLS for a non-TLS IMAP endpoint', async () => {
    const provider = new DefaultMailProviderFactory({ tokens: createTokenProvider() }).create(
      buildAccount(user),
      passwordCredentials(user),
    );

    await expect(provider.connect()).rejects.toBeInstanceOf(ProviderError);
    await provider.close();
  });

  it('requires STARTTLS for a non-TLS SMTP endpoint', async () => {
    const sender = new SmtpMailSender({ tokens: createTokenProvider() });

    await expect(
      sender.verify(buildAccount(user), passwordCredentials(user)),
    ).rejects.toBeInstanceOf(ProviderError);
  });
});
