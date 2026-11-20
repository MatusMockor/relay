import { randomUUID } from 'node:crypto';
import { api, type SplitInput } from '@relay/shared/api';
import { type Split, supportedSplits } from '@relay/shared/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerUser } from '../support/auth-flow';
import { startTestApp, type TestApp } from '../support/test-app';

const email = () => `split-rules-${randomUUID().slice(0, 8)}@relay.test`;

const required = (split: Split | undefined): Split => {
  expect(split).toBeDefined();
  return split as Split;
};

const legacyClients = {
  accountId: null,
  name: 'Klienti',
  order: 0,
  exclusive: true,
  hideTasks: false,
  rules: [
    { type: 'fromDomain' as const, domain: 'klient.test' },
    {
      type: 'recipient' as const,
      field: 'cc' as const,
      match: 'domain' as const,
      value: 'firma.test',
    },
  ],
};

const strictClients: SplitInput = {
  ...legacyClients,
  match: 'all',
  exceptions: [{ type: 'subjectContains', value: 'newsletter' }, { type: 'hasAttachment' }],
};

describe('split conditions', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('round-trips the match mode, exceptions and new condition types', async () => {
    const session = await registerUser(app.api, email());

    const saved = supportedSplits(
      await app.api.ok(
        api.splits.replace,
        { body: { splits: [strictClients] } },
        session.accessToken,
      ),
    );

    expect(saved).toMatchObject([
      {
        name: 'Klienti',
        match: 'all',
        rules: legacyClients.rules,
        exceptions: [{ type: 'subjectContains', value: 'newsletter' }, { type: 'hasAttachment' }],
      },
    ]);
    expect(await app.api.ok(api.splits.list, {}, session.accessToken)).toEqual(saved);
  });

  it('keeps stored values for an older client and keeps a kept split', async () => {
    const session = await registerUser(app.api, email());
    const [clients, jira] = supportedSplits(
      await app.api.ok(
        api.splits.replace,
        {
          body: {
            splits: [
              strictClients,
              {
                ...legacyClients,
                name: 'Jira',
                order: 1,
                rules: [{ type: 'jira', projectKeys: [] }],
              },
            ],
          },
        },
        session.accessToken,
      ),
    );
    const stored = required(clients);

    const replaced = supportedSplits(
      await app.api.ok(
        api.splits.replace,
        {
          body: {
            splits: [
              { id: required(jira).id, keep: true },
              { ...legacyClients, id: stored.id, name: 'Partneri', order: 1 },
              { ...legacyClients, name: 'Nové', order: 2 },
            ],
          },
        },
        session.accessToken,
      ),
    );

    expect(
      replaced.map((split) => [split.name, split.order, split.match, split.exceptions.length]),
    ).toEqual([
      ['Jira', 0, 'any', 0],
      ['Partneri', 1, 'all', 2],
      ['Nové', 2, 'any', 0],
    ]);
    expect(replaced[1]?.id).toBe(stored.id);
    expect(
      await app.api.fail(
        api.splits.replace,
        { body: { splits: [{ id: 'split_unknown', keep: true }] } },
        session.accessToken,
      ),
    ).toMatchObject({ status: 400, error: { code: 'validation_failed' } });
  });
});
