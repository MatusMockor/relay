import {
  type AccountId,
  CreateLabelBodySchema,
  type Label,
  type LabelId,
  LabelIdSchema,
  type RealtimeEvent,
  UpdateLabelBodySchema,
} from '@relay/shared';
import type { Organizer, ThreadReader } from '../MailClient';
import { assertLabelName, invalidLabel, labelNotFound } from './demo-label-rules';
import type { DemoState, DemoThreadRecord } from './demo-state';

type DemoLabelMethods = Pick<ThreadReader, 'listLabels'> &
  Pick<Organizer, 'createLabel' | 'updateLabel' | 'deleteLabel'>;

const attempt = <T>(work: () => T): Promise<T> => {
  try {
    return Promise.resolve(work());
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }
};

const stripLabel = (record: DemoThreadRecord, labelId: LabelId): boolean => {
  if (!record.summary.labelIds.includes(labelId)) {
    return false;
  }
  record.summary = {
    ...record.summary,
    labelIds: record.summary.labelIds.filter((id) => id !== labelId),
  };
  record.messages = record.messages.map((message) => ({
    ...message,
    labelIds: message.labelIds.filter((id) => id !== labelId),
  }));
  return true;
};

export const createDemoLabels = (
  state: DemoState,
  now: () => Date,
  emit: (event: RealtimeEvent) => void,
): DemoLabelMethods => {
  let created = 0;
  const changed = (accountId: AccountId) => {
    emit({
      type: 'labels.updated',
      at: now().toISOString(),
      data: { accountId, labels: state.labels.filter((label) => label.accountId === accountId) },
    });
  };
  const find = (labelId: LabelId): Label => {
    const found = state.labels.find((label) => label.id === labelId);
    if (found === undefined) {
      throw labelNotFound();
    }
    return found;
  };
  return {
    listLabels: (accountId) =>
      Promise.resolve(
        state.labels.filter((label) => accountId === undefined || label.accountId === accountId),
      ),
    createLabel: (body) =>
      attempt(() => {
        const parsed = CreateLabelBodySchema.safeParse(body);
        if (!parsed.success) {
          throw invalidLabel();
        }
        const { accountId, name, color } = parsed.data;
        const account = state.accounts.find((item) => item.id === accountId);
        const kind = account?.provider === 'gmail' ? 'gmail' : 'keyword';
        assertLabelName(state.labels, accountId, kind, name);
        created += 1;
        const label: Label = {
          id: LabelIdSchema.parse(`lbl-n${String(now().getTime())}-${String(created)}`),
          accountId,
          name,
          color: color ?? null,
          kind,
          remoteName: name,
        };
        state.labels = [...state.labels, label];
        changed(accountId);
        return label;
      }),
    updateLabel: (labelId, patch) =>
      attempt(() => {
        const parsed = UpdateLabelBodySchema.safeParse(patch);
        if (!parsed.success) {
          throw invalidLabel();
        }
        const current = find(labelId);
        const name = parsed.data.name ?? current.name;
        assertLabelName(state.labels, current.accountId, current.kind, name, labelId);
        const next: Label = {
          ...current,
          name,
          color: parsed.data.color === undefined ? current.color : parsed.data.color,
          remoteName: current.kind === 'gmail' ? name : current.remoteName,
        };
        state.labels = state.labels.map((label) => (label.id === labelId ? next : label));
        changed(next.accountId);
        return next;
      }),
    deleteLabel: (labelId) =>
      attempt(() => {
        const removed = find(labelId);
        state.labels = state.labels.filter((label) => label.id !== labelId);
        [...state.threads.values()]
          .filter((record) => stripLabel(record, labelId))
          .forEach((record) => {
            emit({
              type: 'thread.upserted',
              at: now().toISOString(),
              data: { thread: record.summary },
            });
          });
        changed(removed.accountId);
      }),
  };
};
