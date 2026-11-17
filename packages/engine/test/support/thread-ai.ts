import type { AiJob, AiTaskKind, ThreadId } from '@relay/shared/domain';
import { deliverMail, type MailSpec, present, type SeededAccount, seedAccount } from './fixtures';
import { type TestEngine, USER_ID } from './test-engine';

export const jobsOf = (engine: TestEngine, kind: AiTaskKind): AiJob[] =>
  [...engine.db.tables.aiJobs.values()].filter((job) => job.kind === kind);

export const inboxThread = async (engine: TestEngine, subject: string): Promise<ThreadId> => {
  const page = await engine.services.inbox.list(USER_ID, { view: 'inbox', limit: 50 });
  return present(page.items.find((thread) => thread.subject === subject)).id;
};

export interface SyncedThread extends SeededAccount {
  readonly threadId: ThreadId;
}

export const syncedThread = async (
  engine: TestEngine,
  spec: MailSpec & { readonly subject: string },
): Promise<SyncedThread> => {
  const { account, server } = await seedAccount(engine);
  deliverMail(server, 'INBOX', spec);
  await engine.services.sync.syncAccount(USER_ID, account.id);
  return { account, server, threadId: await inboxThread(engine, spec.subject) };
};

export const answerAll = (engine: TestEngine): void => {
  engine.claude.respondWith((request) => {
    if (request.input.kind === 'summary') {
      return [
        {
          type: 'completed',
          output: {
            kind: 'summary',
            summary: 'Peter chce potvrdiť termín.',
            checklist: [{ id: 'check-1', text: 'Potvrdiť termín', done: false }],
          },
        },
      ];
    }
    return [
      {
        type: 'completed',
        output: {
          kind: 'replySuggestions',
          suggestions: [
            { id: 'reply-1', label: 'Potvrdiť', body: 'Termín sedí.' },
            { id: 'reply-2', label: 'Presunúť', body: 'Môžeme to posunúť?' },
            { id: 'reply-3', label: 'Odmietnuť', body: 'Tento týždeň nemôžem.' },
          ],
        },
      },
    ];
  });
};
