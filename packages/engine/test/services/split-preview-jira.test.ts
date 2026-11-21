import type { SplitPreviewBody } from '@relay/shared/api';
import { describe, expect, it, vi } from 'vitest';
import { folderSetup, scopedRule, syncNow, threadBySubject } from '../support/automation-filters';
import { addAutomations, JIRA, TIBOR } from '../support/automations';
import { deliverMail } from '../support/fixtures';
import { USER_ID } from '../support/test-engine';

const tiborOnJira: SplitPreviewBody = {
  splitId: null,
  accountId: null,
  match: 'all',
  rules: [
    { type: 'jira', projectKeys: [] },
    { type: 'fromAddress', address: TIBOR.email },
  ],
  exceptions: [],
};

const deliverJiraThread = async () => {
  const setup = await folderSetup();
  deliverMail(setup.server, 'INBOX', {
    id: 'j1',
    from: JIRA,
    subject: '[EF-1] Nasadenie',
    date: '2026-11-15T07:00:00.000Z',
    headers: { 'X-Jira-Event': 'mention' },
  });
  deliverMail(setup.server, 'INBOX', {
    id: 't1',
    from: TIBOR,
    subject: 'Re: [EF-1] Nasadenie',
    inReplyTo: 'j1',
  });
  for (let index = 2; index < 6; index += 1) {
    deliverMail(setup.server, 'INBOX', {
      id: `j${String(index)}`,
      from: JIRA,
      subject: `[EF-${String(index)}] Úloha`,
      headers: { 'X-Jira-Event': 'status' },
    });
  }
  await syncNow(setup);
  return setup;
};

describe('split preview and Jira', () => {
  it('matches Jira conditions by the thread key like the saved split membership', async () => {
    const setup = await deliverJiraThread();
    const { splits } = setup.engine.services;

    const preview = await splits.preview(USER_ID, tiborOnJira);
    await splits.replace(USER_ID, {
      splits: [
        {
          accountId: null,
          name: 'Tibor v Jire',
          order: 0,
          match: tiborOnJira.match,
          rules: tiborOnJira.rules,
          exclusive: true,
          hideTasks: false,
        },
      ],
    });

    expect(preview.count).toBe(1);
    expect(threadBySubject(setup.engine, '[EF-1] Nasadenie').splitIds).toHaveLength(1);
  });

  it('classifies Jira messages once for all automation rivals and never for split rivals', async () => {
    const setup = await deliverJiraThread();
    await setup.engine.services.splits.replace(USER_ID, {
      splits: [
        {
          accountId: null,
          name: 'Jira',
          order: 0,
          rules: [{ type: 'jira', projectKeys: ['EF'] }],
          exclusive: true,
          hideTasks: false,
        },
      ],
    });
    await addAutomations(
      setup.engine,
      ['Stavy', 'Stavy 2', 'Stavy 3'].map((name) =>
        scopedRule(setup, {
          name,
          conditions: [{ type: 'jiraEvent', kind: 'status' }],
          actions: [{ type: 'archive' }],
        }),
      ),
    );
    const batches = vi.spyOn(setup.engine.repositories.automationCandidates, 'findMessages');

    const preview = await setup.engine.services.splits.preview(USER_ID, {
      ...tiborOnJira,
      match: 'any',
      rules: [{ type: 'jira', projectKeys: [] }],
    });

    expect(preview.count).toBe(5);
    expect(preview.overlaps.map((overlap) => [overlap.name, overlap.count])).toEqual([
      ['Jira', 5],
      ['Stavy', 4],
      ['Stavy 2', 4],
      ['Stavy 3', 4],
    ]);
    expect(batches).toHaveBeenCalledTimes(1);
  });
});
