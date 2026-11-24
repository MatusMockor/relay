import { type AttachmentId, type Automation, JiraKeySchema } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { JiraTaskAutomation } from '../../src/services/automations/jira-task-automation';
import { threadBySubject } from '../support/automation-filters';
import { JIRA, sync, syncedSetup, listRules, replaceRules } from '../support/automations';
import { deliverMail, present } from '../support/fixtures';
import { RuleAutomationMatcher } from '../support/mail/rule-split-matcher';
import { USER_ID } from '../support/test-engine';

const PDF = {
  id: 'att_pdf' as AttachmentId,
  filename: 'zadanie.pdf',
  contentType: 'application/pdf',
  size: 3,
  contentId: null,
  inline: false,
};

const setupJiraMail = async () => {
  const setup = await syncedSetup();
  deliverMail(setup.server, 'INBOX', {
    id: 'j1',
    from: JIRA,
    subject: '[EF-10] Zadanie s prílohou',
    headers: { 'X-Jira-Event': 'assigned' },
  });
  await sync(setup);
  const thread = threadBySubject(setup.engine, '[EF-10] Zadanie s prílohou');
  const message = present(
    (await setup.engine.repositories.messages.listByThread(USER_ID, thread.id))[0],
  );
  const automation = new JiraTaskAutomation({
    automations: setup.engine.repositories.automations,
    messages: setup.engine.repositories.messages,
    matcher: new RuleAutomationMatcher(),
    tasks: setup.engine.services.tasks,
  });
  const configure = async (change: Partial<Automation>, attached: boolean) => {
    const current = await listRules(setup.engine, USER_ID);
    await replaceRules(setup.engine, USER_ID, {
      automations: current.map((rule) =>
        rule.preset === 'jiraTasks' ? { ...rule, enabled: true, ...change } : rule,
      ),
    });
    setup.engine.db.tables.messages.set(message.id, {
      ...message,
      attachments: attached ? [PDF] : [],
    });
  };
  const apply = () =>
    automation.applyJiraEvent(
      USER_ID,
      {
        threadId: thread.id,
        classification: {
          jiraKey: JiraKeySchema.parse('EF-10'),
          eventKind: 'assigned',
          actor: 'Peter',
        },
        title: thread.subject,
        from: JIRA,
        headers: [],
      },
      { accountId: setup.account.id, messageId: message.id },
    );
  return { configure, apply };
};

describe('Jira preset with attachment conditions', () => {
  it('skips a Jira mail with an attachment when the preset excludes attachments', async () => {
    const { configure, apply } = await setupJiraMail();

    await configure({ exceptions: [{ type: 'hasAttachment' }] }, true);

    expect(await apply()).toBeNull();
  });

  it('matches a Jira mail with an attachment when the preset requires one', async () => {
    const { configure, apply } = await setupJiraMail();

    await configure(
      { conditions: [{ type: 'jira', projectKeys: [] }, { type: 'hasAttachment' }] },
      true,
    );

    expect(await apply()).toMatchObject({ jiraKey: 'EF-10' });
  });
});
