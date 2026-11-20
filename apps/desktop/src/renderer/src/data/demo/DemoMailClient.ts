import type { AiOutput, RealtimeEvent, ThreadId, ThreadSummary } from '@relay/shared';
import { EventBus } from '../event-bus';
import { MailClientError } from '../errors';
import type { MailClient, Unsubscribe } from '../MailClient';
import { demoAccountFrom, demoTestConnection } from './demo-accounts';
import { DemoHistory } from './demo-history';
import { runDemoAi } from './demo-ai';
import { createDemoAttachments } from './demo-attachments';
import { createDemoAutomationApply } from './demo-automation-apply';
import { createDemoAutomations } from './demo-automations';
import { createDemoCalendarClient } from './demo-calendar';
import { createDemoLabels } from './demo-labels';
import { demoSend, newDraftKey } from './demo-compose';
import { dropAccountData, removeDraft, syncDraftFlags } from './demo-drafts';
import { requestDemoSummary } from './demo-summary';
import { createDemoTaskMethods, demoTaskFromAi } from './demo-tasks';
import { createDemoFolders } from './demo-folders';
import { demoMailboxesOf } from './demo-mailboxes';
import { createDemoMarkRead } from './demo-mark-read';
import { createDemoMessageBodies, type DemoRemoteBodies } from './demo-message-bodies';
import { DemoMoves } from './demo-moves';
import { queryThreads } from './demo-query';
import { createDemoServerSearch, type DemoServerSearchOptions } from './demo-server-search';
import { demoUnsubscribe, demoUnsubscribeOptions } from './demo-unsubscribe';
import type { DemoState } from './demo-state';
import { buildDemoState } from './seed/build-state';
import { demoIds } from './seed/ids';

export interface DemoMailClientOptions {
  readonly now?: () => Date;
  readonly aiStepMs?: number;
  readonly state?: DemoState;
  readonly serverSearch?: DemoServerSearchOptions;
  readonly remoteBodies?: DemoRemoteBodies;
  readonly history?: DemoHistory;
}

const run = <T>(work: () => T): Promise<T> => {
  try {
    return Promise.resolve(work());
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }
};

const notFound = (what: string) =>
  new MailClientError({ code: 'not_found', message: `${what} neexistuje` });

export const createDemoMailClient = (options: DemoMailClientOptions = {}): MailClient => {
  const now = options.now ?? (() => new Date());
  const state = options.state ?? buildDemoState(now());
  const bus = new EventBus<RealtimeEvent>();
  const aiRuns = new Set<Unsubscribe>();
  const moves = new DemoMoves(state);
  const emit = (event: RealtimeEvent) => {
    queueMicrotask(() => {
      bus.emit(event);
    });
  };
  const history = options.history ?? new DemoHistory();
  history.bind(emit, now);
  const upserted = (thread: ThreadSummary): ThreadSummary => {
    emit({ type: 'thread.upserted', at: now().toISOString(), data: { thread } });
    return thread;
  };
  const record = (threadId: string) => {
    const found = state.threads.get(threadId);
    if (found === undefined) {
      throw notFound('Konverzácia');
    }
    return found;
  };
  const addAiTask = (output: AiOutput) => {
    const stamp = now().toISOString();
    const task = demoTaskFromAi(output, stamp, state.tasks.length + 1);
    if (task === null) {
      return;
    }
    state.tasks = [task, ...state.tasks];
    emit({ type: 'task.upserted', at: stamp, data: { task } });
  };
  const draft = (draftId: string) => {
    const found = state.drafts.find((item) => item.id === draftId);
    if (found === undefined) {
      throw notFound('Koncept');
    }
    return found;
  };
  const draftsChanged = (...threadIds: readonly (ThreadId | null)[]) => {
    syncDraftFlags(state, threadIds).forEach(upserted);
  };
  return {
    kind: 'demo',
    ...createDemoCalendarClient(now),
    listThreads: (params) => Promise.resolve(queryThreads(state, params)),
    ...createDemoServerSearch(state, options.serverSearch),
    getThread: (threadId) =>
      run(() => {
        const found = record(threadId);
        return {
          thread: found.summary,
          messages: found.messages,
          aiSummary: found.aiSummary,
          checklist: found.checklist,
          replySuggestions: found.replySuggestions,
        };
      }),
    ...createDemoMessageBodies(state, options.remoteBodies),
    prepareThreadAi: (threadId) =>
      run(() => {
        record(threadId);
        return { pending: [], jobs: [] };
      }),
    requestThreadSummary: (threadId) => run(() => requestDemoSummary(state, record(threadId))),
    applyThreadAction: (threadId, action) =>
      run(() => upserted(moves.apply(record(threadId), action))),
    ...createDemoMarkRead(state, moves, upserted),
    getUnsubscribeOptions: (threadId) =>
      run(() => demoUnsubscribeOptions(record(threadId).summary)),
    unsubscribe: (threadId, url) =>
      run(() => {
        demoUnsubscribe(record(threadId).summary, url);
      }),
    downloadAttachment: () => Promise.reject(notFound('Príloha')),
    updateChecklistItem: (threadId, item) =>
      run(() => {
        const found = record(threadId);
        if (!found.checklist.some((entry) => entry.id === item.itemId)) {
          throw notFound('Bod zoznamu');
        }
        found.checklist = found.checklist.map((entry) =>
          entry.id === item.itemId ? { ...entry, done: item.done } : entry,
        );
        return { checklist: found.checklist };
      }),
    ...createDemoLabels(state, now, emit),
    listAccounts: () => Promise.resolve([...state.accounts]),
    listMailboxes: (accountId) => Promise.resolve(demoMailboxesOf(state, accountId)),
    createAccount: (body) =>
      run(() => {
        const account = demoAccountFrom(body, state.accounts, now());
        state.accounts.push(account);
        emit({ type: 'account.upserted', at: now().toISOString(), data: { account } });
        return account;
      }),
    updateAccount: (accountId, patch) =>
      run(() => {
        const index = state.accounts.findIndex((account) => account.id === accountId);
        const current = state.accounts[index];
        if (current === undefined) {
          throw notFound('Účet');
        }
        const next = { ...current, ...patch, settings: patch.settings ?? current.settings };
        state.accounts = state.accounts.map((account) =>
          account.id === accountId
            ? next
            : patch.isPrimary === true
              ? { ...account, isPrimary: false }
              : account,
        );
        return next;
      }),
    removeAccount: (accountId) =>
      run(() => {
        dropAccountData(state, accountId);
        emit({ type: 'account.removed', at: now().toISOString(), data: { accountId } });
      }),
    testConnection: (body) => Promise.resolve(demoTestConnection(body)),
    syncNow: () => Promise.resolve(),
    historyProgress: () => Promise.resolve(history.progress(state.accounts)),
    listDrafts: () => Promise.resolve([...state.drafts]),
    createDraft: (content) =>
      run(() => {
        const stamp = now().toISOString();
        const created = {
          ...content,
          attachments: content.attachments ?? [],
          id: demoIds.draft(newDraftKey()),
          createdAt: stamp,
          updatedAt: stamp,
        };
        state.drafts.push(created);
        draftsChanged(created.inReplyToThreadId);
        return created;
      }),
    updateDraft: (draftId, patch) =>
      run(() => {
        const previous = draft(draftId);
        const next = { ...previous, ...patch, updatedAt: now().toISOString() };
        state.drafts = state.drafts.map((item) => (item.id === draftId ? next : item));
        draftsChanged(previous.inReplyToThreadId, next.inReplyToThreadId);
        return next;
      }),
    deleteDraft: (draftId) =>
      run(() => {
        const removed = state.drafts.find((item) => item.id === draftId);
        removeDraft(state, draftId);
        draftsChanged(removed?.inReplyToThreadId ?? null);
      }),
    ...createDemoAttachments(state, now),
    ...createDemoAutomations(state, now, createDemoAutomationApply(state, moves, upserted)),
    ...createDemoFolders(state, now, emit),
    send: (body) => run(() => demoSend(state, body, now())),
    listScheduled: () =>
      Promise.resolve(state.scheduled.filter((item) => item.status === 'pending')),
    cancelScheduled: (scheduledSendId) =>
      run(() => {
        state.scheduled = state.scheduled.map((item) =>
          item.id === scheduledSendId ? { ...item, status: 'cancelled' } : item,
        );
      }),
    listSplits: () => Promise.resolve([...state.splits]),
    replaceSplits: (splits) =>
      run(() => {
        state.splits = splits.map((split, order) => ({
          ...split,
          id: split.id ?? demoIds.split(`n${String(order)}-${String(now().getTime())}`),
          userId: demoIds.user,
        }));
        return state.splits;
      }),
    ...createDemoTaskMethods(state, now),
    getSettings: () => Promise.resolve(state.settings),
    updateSettings: (patch) =>
      run(() => {
        state.settings = {
          ...state.settings,
          ...patch,
          ai: {
            ...state.settings.ai,
            ...patch.ai,
            features: { ...state.settings.ai.features, ...patch.ai?.features },
          },
          jira: { ...state.settings.jira, ...patch.jira },
        };
        emit({
          type: 'settings.updated',
          at: now().toISOString(),
          data: { settings: state.settings },
        });
        return state.settings;
      }),
    listAiRunners: () =>
      Promise.resolve([
        {
          runner: 'claude',
          location: state.settings.ai.location,
          installed: true,
          authenticated: true,
          version: '2.1.0',
          executablePath: '/usr/local/bin/claude',
        },
        {
          runner: 'codex',
          location: state.settings.ai.location,
          installed: true,
          authenticated: false,
          version: '0.60.0',
          executablePath: '/usr/local/bin/codex',
        },
      ]),
    getAiJob: () => Promise.reject(notFound('AI úloha')),
    runAi: (request, listener) => {
      const stop = runDemoAi(
        state,
        request.input,
        (event) => {
          if (event.type === 'completed') {
            aiRuns.delete(stop);
            addAiTask(event.output);
          }
          listener(event);
        },
        options.aiStepMs ?? 160,
      );
      aiRuns.add(stop);
      return () => {
        aiRuns.delete(stop);
        stop();
      };
    },
    subscribe: (listener) => bus.subscribe(listener),
    onRealtimeConnected: () => () => undefined,
    dispose: () => {
      aiRuns.forEach((stop) => {
        stop();
      });
      aiRuns.clear();
      bus.clear();
    },
  };
};
