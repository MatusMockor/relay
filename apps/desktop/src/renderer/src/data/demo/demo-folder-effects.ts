import type { Mailbox, ThreadSummary } from '@relay/shared';
import type { DemoState } from './demo-state';

export const relabelDemoTree = (state: DemoState, from: string, to: string, root: Mailbox) => {
  state.labels = state.labels.map((label) => {
    const inside = label.remoteName === from || label.remoteName.startsWith(`${from}/`);
    if (label.accountId !== root.accountId || label.kind !== 'gmail' || !inside) {
      return label;
    }
    const remoteName = `${to}${label.remoteName.slice(from.length)}`;
    return { ...label, name: remoteName, remoteName };
  });
};

export const trashDemoFolder = (state: DemoState, folder: Mailbox): ThreadSummary[] => {
  const trash = state.mailboxes.find(
    (mailbox) => mailbox.accountId === folder.accountId && mailbox.role === 'trash',
  );
  if (trash === undefined) {
    return [];
  }
  const changed: ThreadSummary[] = [];
  state.threads.forEach((record) => {
    if (!record.messages.some((message) => message.mailboxId === folder.id)) {
      return;
    }
    record.messages = record.messages.map((message) =>
      message.mailboxId === folder.id ? { ...message, mailboxId: trash.id } : message,
    );
    const held = record.messages.every((message) => message.mailboxId === trash.id);
    record.summary = held ? { ...record.summary, state: 'trash' } : record.summary;
    changed.push(record.summary);
  });
  return changed;
};

export const dropDemoLabel = (state: DemoState, mailbox: Mailbox): ThreadSummary[] => {
  const label = state.labels.find(
    (candidate) =>
      candidate.accountId === mailbox.accountId &&
      candidate.kind === 'gmail' &&
      candidate.remoteName === mailbox.path,
  );
  if (label === undefined) {
    return [];
  }
  state.labels = state.labels.filter((candidate) => candidate.id !== label.id);
  const changed: ThreadSummary[] = [];
  state.threads.forEach((record) => {
    if (!record.summary.labelIds.includes(label.id)) {
      return;
    }
    record.messages = record.messages.map((message) => ({
      ...message,
      labelIds: message.labelIds.filter((id) => id !== label.id),
    }));
    record.summary = {
      ...record.summary,
      labelIds: record.summary.labelIds.filter((id) => id !== label.id),
    };
    changed.push(record.summary);
  });
  return changed;
};
