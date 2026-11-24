import { randomUUID } from 'node:crypto';
import { api } from '@relay/shared/api';
import { type Automation, supportedAutomations } from '@relay/shared/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerUser } from '../support/auth-flow';
import { authenticateRealtime } from '../support/realtime-client';
import { startTestApp, type TestApp } from '../support/test-app';

const required = (automation: Automation | undefined): Automation => {
  expect(automation).toBeDefined();
  return automation as Automation;
};

const email = () => `automations-${randomUUID().slice(0, 8)}@relay.test`;

describe('automations', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('seeds the Jira rule, replaces the rules per user and validates them', async () => {
    const session = await registerUser(app.api, email());
    const other = await registerUser(app.api, email());
    const socket = await authenticateRealtime(app.baseUrl, session.accessToken);

    const preset = required(
      supportedAutomations(await app.api.ok(api.automations.list, {}, session.accessToken))[0],
    );
    expect(preset).toMatchObject({ name: 'Jira tasky', preset: 'jiraTasks', enabled: false });
    const saved = supportedAutomations(
      await app.api.ok(
        api.automations.replace,
        {
          body: {
            automations: [
              { ...preset, enabled: true },
              {
                accountId: null,
                name: 'eFabrica spomenutia',
                enabled: true,
                order: 1,
                conditions: [
                  { type: 'jira', projectKeys: ['EF'] },
                  { type: 'jiraEvent', kind: 'mention' },
                ],
                ai: {
                  runner: 'claude',
                  model: 'claude-opus-5-5',
                  effort: 'high',
                  instructions: 'Task vytvor iba ak odo mňa niekto niečo chce.',
                },
                actions: [{ type: 'summary' }, { type: 'task' }],
              },
            ],
          },
        },
        session.accessToken,
      ),
    );
    expect(saved.map((item) => [item.name, item.enabled, item.userId])).toEqual([
      ['Jira tasky', true, session.user.id],
      ['eFabrica spomenutia', true, session.user.id],
    ]);
    expect(
      supportedAutomations(await app.api.ok(api.automations.list, {}, session.accessToken)),
    ).toEqual(saved);
    expect(
      supportedAutomations(await app.api.ok(api.automations.list, {}, other.accessToken)),
    ).toHaveLength(1);
    await socket.waitFor(
      (message) => message.type === 'event' && message.event.type === 'automations.updated',
    );

    const unknownModel = await app.api.fail(
      api.automations.replace,
      {
        body: {
          automations: [
            {
              ...required(saved[1]),
              ai: { runner: 'codex', model: 'claude-opus-5-5', effort: null, instructions: null },
            },
          ],
        },
      },
      session.accessToken,
    );
    expect(unknownModel).toMatchObject({ status: 400, error: { code: 'validation_failed' } });
    socket.close();
  });

  it('removes the default Jira rule for good and restores it on request', async () => {
    const session = await registerUser(app.api, email());
    const [preset, ...rest] = supportedAutomations(
      await app.api.ok(api.automations.list, {}, session.accessToken),
    );
    expect(preset?.preset).toBe('jiraTasks');

    const removed = supportedAutomations(
      await app.api.ok(
        api.automations.replace,
        { body: { automations: rest } },
        session.accessToken,
      ),
    );

    expect(removed).toEqual([]);
    expect(
      supportedAutomations(await app.api.ok(api.automations.list, {}, session.accessToken)),
    ).toEqual([]);
    const restored = supportedAutomations(
      await app.api.ok(api.automations.restoreDefault, {}, session.accessToken),
    );
    expect(restored).toEqual([
      expect.objectContaining({ name: 'Jira tasky', preset: 'jiraTasks', enabled: false }),
    ]);
    expect(
      supportedAutomations(await app.api.ok(api.automations.list, {}, session.accessToken)),
    ).toEqual(restored);
  });

  it('applies a rule to existing mail and refuses moves for all accounts', async () => {
    const session = await registerUser(app.api, email());
    const preset = required(
      supportedAutomations(await app.api.ok(api.automations.list, {}, session.accessToken))[0],
    );
    const rule = {
      accountId: null,
      name: 'Faktúry',
      enabled: true,
      order: 1,
      conditions: [{ type: 'fromDomain' as const, domain: 'faktury.test' }],
      ai: { runner: 'claude' as const, model: null, effort: null, instructions: null },
      actions: [{ type: 'markRead' as const }],
    };
    const saved = supportedAutomations(
      await app.api.ok(
        api.automations.replace,
        { body: { automations: [preset, rule] } },
        session.accessToken,
      ),
    );

    const applied = await app.api.ok(
      api.automations.apply,
      { params: { id: required(saved[1]).id } },
      session.accessToken,
    );
    expect(applied).toEqual({ matched: 0, applied: 0, failed: 0 });
    const allAccounts = await app.api.fail(
      api.automations.replace,
      {
        body: {
          automations: [
            preset,
            { ...rule, actions: [{ type: 'moveTo', mailboxId: 'mbx_unknown' }] },
          ],
        },
      },
      session.accessToken,
    );
    expect(allAccounts).toMatchObject({ status: 400, error: { code: 'validation_failed' } });
  });

  it('previews a draft rule without saving it and validates the draft', async () => {
    const session = await registerUser(app.api, email());
    const before = supportedAutomations(
      await app.api.ok(api.automations.list, {}, session.accessToken),
    );
    const draft = {
      accountId: null,
      match: 'any' as const,
      conditions: [{ type: 'subjectContains' as const, value: 'faktúra' }],
      exceptions: [{ type: 'fromAddress' as const, address: 'noreply@firma.test' }],
    };

    expect(await app.api.ok(api.automations.preview, { body: draft }, session.accessToken)).toEqual(
      { days: 30, count: 0, truncated: false, samples: [] },
    );
    expect(
      supportedAutomations(await app.api.ok(api.automations.list, {}, session.accessToken)),
    ).toEqual(before);
    expect(
      await app.api.fail(
        api.automations.preview,
        {
          body: {
            ...draft,
            exceptions: [{ type: 'subjectRegex', pattern: '(', caseSensitive: false }],
          },
        },
        session.accessToken,
      ),
    ).toMatchObject({ status: 400, error: { code: 'validation_failed' } });
    expect(
      await app.api.fail(
        api.automations.preview,
        { body: { ...draft, accountId: 'acc_unknown' } },
        session.accessToken,
      ),
    ).toMatchObject({ status: 404, error: { code: 'not_found' } });
  });

  it('keeps the match mode and exceptions of a rule replaced by an older client', async () => {
    const session = await registerUser(app.api, email());
    const preset = required(
      supportedAutomations(await app.api.ok(api.automations.list, {}, session.accessToken))[0],
    );
    const legacyRule = {
      accountId: null,
      name: 'Dodávatelia',
      enabled: true,
      order: 1,
      conditions: [{ type: 'fromDomain' as const, domain: 'dodavatel.test' }],
      ai: { runner: 'claude' as const, model: null, effort: null, instructions: null },
      actions: [{ type: 'markRead' as const }],
    };
    const saved = supportedAutomations(
      await app.api.ok(
        api.automations.replace,
        {
          body: {
            automations: [
              preset,
              {
                ...legacyRule,
                match: 'any',
                exceptions: [{ type: 'fromAddress', address: 'noreply@firma.test' }],
              },
            ],
          },
        },
        session.accessToken,
      ),
    );
    const stored = required(saved[1]);

    const replaced = supportedAutomations(
      await app.api.ok(
        api.automations.replace,
        {
          body: {
            automations: [
              preset,
              { ...legacyRule, id: stored.id, enabled: false },
              { ...legacyRule, name: 'Nové' },
            ],
          },
        },
        session.accessToken,
      ),
    );

    expect(replaced[1]).toMatchObject({
      id: stored.id,
      enabled: false,
      match: 'any',
      exceptions: [{ type: 'fromAddress', address: 'noreply@firma.test' }],
    });
    expect(replaced[2]).toMatchObject({ name: 'Nové', match: 'all', exceptions: [] });
  });
});
