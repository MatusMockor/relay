import { randomUUID } from 'node:crypto';
import { api } from '@relay/shared/api';
import type { Automation } from '@relay/shared/domain';
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

    const preset = required((await app.api.ok(api.automations.list, {}, session.accessToken))[0]);
    expect(preset).toMatchObject({ name: 'Jira tasky', preset: 'jiraTasks', enabled: true });
    const saved = await app.api.ok(
      api.automations.replace,
      {
        body: {
          automations: [
            { ...preset, enabled: false },
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
    );
    expect(saved.map((item) => [item.name, item.enabled, item.userId])).toEqual([
      ['Jira tasky', false, session.user.id],
      ['eFabrica spomenutia', true, session.user.id],
    ]);
    expect(await app.api.ok(api.automations.list, {}, session.accessToken)).toEqual(saved);
    expect(await app.api.ok(api.automations.list, {}, other.accessToken)).toHaveLength(1);
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
    const removedPreset = await app.api.fail(
      api.automations.replace,
      { body: { automations: [] } },
      session.accessToken,
    );
    expect(removedPreset).toMatchObject({ status: 400, error: { code: 'validation_failed' } });
    socket.close();
  });

  it('applies a rule to existing mail and refuses moves for all accounts', async () => {
    const session = await registerUser(app.api, email());
    const preset = required((await app.api.ok(api.automations.list, {}, session.accessToken))[0]);
    const rule = {
      accountId: null,
      name: 'Faktúry',
      enabled: true,
      order: 1,
      conditions: [{ type: 'fromDomain' as const, domain: 'faktury.test' }],
      ai: { runner: 'claude' as const, model: null, effort: null, instructions: null },
      actions: [{ type: 'markRead' as const }],
    };
    const saved = await app.api.ok(
      api.automations.replace,
      { body: { automations: [preset, rule] } },
      session.accessToken,
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
});
