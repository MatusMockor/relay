import type { ThreadId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { parseListUnsubscribe } from '../../src';
import { deliverMail, present, seedAccount } from '../support/fixtures';
import { createTestEngine, USER_ID } from '../support/test-engine';

const NEWS = { name: 'Newsletter', email: 'news@letter.test' };

const headersOf = (entries: Record<string, string>) =>
  new Map(Object.entries(entries).map(([name, value]) => [name, [value]]));

const engineWithMail = async (headers: Record<string, string>) => {
  const engine = createTestEngine();
  const { account, server } = await seedAccount(engine);
  deliverMail(server, 'INBOX', { id: 'n1', from: NEWS, headers });
  await engine.services.sync.syncAccount(USER_ID, account.id);
  const thread = present(
    (await engine.services.inbox.list(USER_ID, { view: 'inbox', limit: 5 })).items[0],
  );
  return { engine, thread };
};

describe('parseListUnsubscribe', () => {
  it('reads https, one-click and mailto targets', () => {
    expect(
      parseListUnsubscribe(
        headersOf({
          'list-unsubscribe':
            '<mailto:leave@letter.test?subject=Odhl%C3%A1si%C5%A5&body=pros%C3%ADm>, <https://letter.test/u?id=7>',
          'list-unsubscribe-post': 'List-Unsubscribe=One-Click',
        }),
      ),
    ).toEqual({
      oneClick: true,
      url: 'https://letter.test/u?id=7',
      mailto: { to: 'leave@letter.test', subject: 'Odhlásiť', body: 'prosím' },
    });
  });

  it('percent-decodes mailto values without turning a literal plus into a space', () => {
    expect(
      parseListUnsubscribe(
        headersOf({
          'list-unsubscribe': '<mailto:leave+news@letter.test?Subject=a+b%2Bc%20d&body=x%26y=z+1>',
        }),
      ).mailto,
    ).toEqual({ to: 'leave+news@letter.test', subject: 'a+b+c d', body: 'x&y=z+1' });
  });

  it('rejects anything that is not https or mailto', () => {
    expect(
      parseListUnsubscribe(
        headersOf({
          'list-unsubscribe':
            '<https://>, <https://letter.test:8443/u>, <http://letter.test/u>, <javascript:alert(1)>, <https://127.0.0.1/u>, <https://localhost/u>, <https://user:pw@letter.test/u>, <ftp://letter.test>',
          'list-unsubscribe-post': 'List-Unsubscribe=One-Click',
        }),
      ),
    ).toEqual({ oneClick: false, url: null, mailto: null });
  });

  it('needs the post header for one-click and ignores malformed mailto targets', () => {
    expect(
      parseListUnsubscribe(
        headersOf({ 'list-unsubscribe': '<mailto:not-an-address>, <https://letter.test/u>' }),
      ),
    ).toEqual({ oneClick: false, url: 'https://letter.test/u', mailto: null });
    expect(parseListUnsubscribe(new Map())).toEqual({ oneClick: false, url: null, mailto: null });
  });
});

describe('UnsubscribeService', () => {
  it('returns the options of the newest message and sends one-click from the main side', async () => {
    const { engine, thread } = await engineWithMail({
      'List-Unsubscribe': '<https://letter.test/u/1>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });

    await expect(engine.services.unsubscribe.options(USER_ID, thread.id)).resolves.toEqual({
      oneClick: true,
      url: 'https://letter.test/u/1',
      mailto: null,
    });
    await engine.services.unsubscribe.unsubscribe(USER_ID, thread.id, 'https://letter.test/u/1');

    expect(engine.unsubscribes.sent).toEqual(['https://letter.test/u/1']);
  });

  it('rejects a one-click target that differs from the one the user confirmed', async () => {
    const { engine, thread } = await engineWithMail({
      'List-Unsubscribe': '<https://letter.test/u/new>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });

    await expect(
      engine.services.unsubscribe.unsubscribe(USER_ID, thread.id, 'https://letter.test/u/old'),
    ).rejects.toMatchObject({ code: 'conflict' });
    expect(engine.unsubscribes.sent).toEqual([]);
  });

  it('refuses one-click when the sender only offers a link or a mailto', async () => {
    const { engine, thread } = await engineWithMail({
      'List-Unsubscribe': '<mailto:leave@letter.test>, <https://letter.test/u/2>',
    });

    await expect(engine.services.unsubscribe.options(USER_ID, thread.id)).resolves.toEqual({
      oneClick: false,
      url: 'https://letter.test/u/2',
      mailto: { to: 'leave@letter.test', subject: null, body: null },
    });
    await expect(
      engine.services.unsubscribe.unsubscribe(USER_ID, thread.id, 'https://letter.test/u/2'),
    ).rejects.toMatchObject({ code: 'validation_failed' });
    expect(engine.unsubscribes.sent).toEqual([]);
  });

  it('reports no options for plain mail and not found for unknown threads', async () => {
    const { engine, thread } = await engineWithMail({});

    await expect(engine.services.unsubscribe.options(USER_ID, thread.id)).resolves.toEqual({
      oneClick: false,
      url: null,
      mailto: null,
    });
    await expect(
      engine.services.unsubscribe.options(USER_ID, 'thread_missing' as ThreadId),
    ).rejects.toMatchObject({ code: 'not_found' });
  });
});
