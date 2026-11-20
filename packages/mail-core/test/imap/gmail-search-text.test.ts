import type { MailProvider, RemoteTextSearch } from '@relay/engine';
import type { MailAccount } from '@relay/shared/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { buildAccount } from '../support/accounts';
import {
  type GmailImapStub,
  type GmailImapStubOptions,
  startGmailImapStub,
} from '../support/gmail/gmail-imap-stub';
import { createProvider } from '../support/provider-harness';

const ALL_MAIL = '[Gmail]/All Mail';

const gmailAccount = (port: number): MailAccount => {
  const user = { email: 'me@gmail.test', login: 'me@gmail.test', password: 'secret' };
  const endpoint = { host: '127.0.0.1', port, secure: false };
  return buildAccount(user, {
    settings: { imap: endpoint, smtp: endpoint, username: user.login },
  });
};

const query = (overrides: Partial<RemoteTextSearch>): RemoteTextSearch => ({
  terms: ['faktúra'],
  field: 'all',
  limit: 50,
  ...overrides,
});

describe('Gmail text search over X-GM-RAW against a scripted Gmail server', () => {
  let stub: GmailImapStub;
  let provider: MailProvider;

  const start = async (options: GmailImapStubOptions = {}) => {
    stub = await startGmailImapStub(options);
    provider = createProvider(gmailAccount(stub.port), { kind: 'password', password: 'secret' });
  };

  const searches = () => stub.commands.filter((line) => line.includes('UID SEARCH'));

  afterEach(async () => {
    await provider.close();
    await stub.close();
  });

  it('sends quoted terms with the field prefix and the before date as one X-GM-RAW query', async () => {
    await start();

    const found = await provider.searchText(
      ALL_MAIL,
      11,
      query({
        terms: ['faktúra', 'say "hi"\\'],
        field: 'subject',
        before: new Date('2024-03-05T00:00:00.000Z'),
      }),
    );

    expect(found).toEqual({ uids: [7, 6, 5], complete: true });
    expect(searches()).toHaveLength(1);
    expect(searches()[0]).toMatch(
      /UID SEARCH CHARSET UTF-8 X-GM-RAW "subject:\\"faktúra\\" subject:\\"say \\\\\\"hi\\\\\\"\\\\\\\\\\" before:2024\/03\/05"$/,
    );
  });

  it('retries with ASCII-folded terms after BADCHARSET', async () => {
    await start({ rejectCharsetSearch: true });

    const folded = await provider.searchText(ALL_MAIL, 11, query({ field: 'from', limit: 2 }));
    const ascii = await provider.searchText(ALL_MAIL, 11, query({ terms: ['ok'] }));

    expect(folded).toEqual({ uids: [7, 6], complete: true });
    expect(searches().map((line) => line.replace(/^\S+ /, ''))).toEqual([
      'UID SEARCH CHARSET UTF-8 X-GM-RAW "from:\\"faktúra\\""',
      'UID SEARCH X-GM-RAW "from:\\"faktura\\""',
      'UID SEARCH X-GM-RAW "\\"ok\\""',
    ]);
    expect(ascii.complete).toBe(true);
  });

  it('reports a partial result when even the folded search is rejected', async () => {
    await start({ rejectCharsetSearch: true });

    const found = await provider.searchText(ALL_MAIL, 11, query({ terms: ['ďakujem', 'ß'] }));

    expect(found).toEqual({ uids: [], complete: false });
    expect(searches()).toHaveLength(2);
    expect(searches()[1]).toMatch(/X-GM-RAW "\\"dakujem\\" \\"ß\\""$/);
  });
});
