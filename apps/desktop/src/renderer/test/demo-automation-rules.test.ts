import {
  type AutomationCondition,
  type AutomationInput,
  type AutomationPreviewBody,
  MessageIdSchema,
} from '@relay/shared';
import { describe, expect, it } from 'vitest';
import { toAutomationInput } from '../src/data/hooks/use-replace-automations';
import { createDemoMailClient } from '../src/data/demo/DemoMailClient';
import { buildDemoState } from '../src/data/demo/seed/build-state';

const NOW = new Date(2026, 10, 19, 9, 41);

const body = (overrides: Partial<AutomationPreviewBody>): AutomationPreviewBody => ({
  accountId: null,
  match: 'all',
  conditions: [],
  exceptions: [],
  ...overrides,
});

describe('demo automation rules', () => {
  it('evaluates Jira project conditions and exceptions from the thread key', async () => {
    const client = createDemoMailClient({ now: () => NOW, aiStepMs: 0 });
    const jira = await client.previewAutomation(
      body({ conditions: [{ type: 'jira', projectKeys: [] }] }),
    );
    const outsideWeb = await client.previewAutomation(
      body({
        conditions: [{ type: 'jira', projectKeys: [] }],
        exceptions: [{ type: 'jira', projectKeys: ['WEB'] }],
      }),
    );

    expect(jira.count).toBeGreaterThan(outsideWeb.count);
  });

  it('refuses exceptions the demo cannot evaluate', async () => {
    const client = createDemoMailClient({ now: () => NOW, aiStepMs: 0 });
    const rules = (await client.listAutomations()).map(toAutomationInput);
    const withException = (exception: AutomationCondition): AutomationInput[] =>
      rules.map((rule, index) => (index === 0 ? { ...rule, exceptions: [exception] } : rule));

    await expect(
      client.replaceAutomations(withException({ type: 'jiraEvent', kind: 'status' })),
    ).rejects.toThrow('Ukážka nevie vyhodnotiť výnimku na Jira udalosť ani na hlavičku mailu.');
    await expect(
      client.replaceAutomations(withException({ type: 'header', name: 'List-Id', pattern: 'x' })),
    ).rejects.toThrow('Ukážka nevie vyhodnotiť');
    await expect(
      client.replaceAutomations(withException({ type: 'jira', projectKeys: ['WEB'] })),
    ).resolves.toBeDefined();
  });

  it('looks only at the 50 newest messages of a thread in the preview', async () => {
    const state = buildDemoState(NOW);
    const record = [...state.threads.values()].find(
      (item) => item.summary.state === 'inbox' && item.messages.length > 0,
    );
    const template = record?.messages.at(-1);
    expect(template).toBeDefined();
    const day = (minutes: number) => new Date(NOW.getTime() - 86_400_000 + minutes * 60_000);
    if (record !== undefined && template !== undefined) {
      record.messages = Array.from({ length: 60 }, (_, index) => ({
        ...template,
        id: MessageIdSchema.parse(`limit-${String(index)}`),
        from: { name: 'Robot', email: index === 0 ? 'stary@robot.sk' : 'novy@robot.sk' },
        date: day(index).toISOString(),
      }));
    }
    const client = createDemoMailClient({ now: () => NOW, aiStepMs: 0, state });
    const preview = (address: string) =>
      client.previewAutomation(body({ conditions: [{ type: 'fromAddress', address }] }));

    expect((await preview('stary@robot.sk')).count).toBe(0);
    expect((await preview('novy@robot.sk')).count).toBe(1);
  });
});
