import { type LabelMutation, NotImplementedError } from '@relay/engine';
import type { ImapFlow } from 'imapflow';
import { hasGmailLabels, type LabelReading, labelReadingOf } from './gmail-labels';
import type { ImapConnection } from './imap-connection';
import { requireAccepted } from './imap-results';
import { encodeModifiedUtf7 } from './modified-utf7';

type LabelStoreClient = Pick<
  ImapFlow,
  'capabilities' | 'enabled' | 'messageFlagsAdd' | 'messageFlagsRemove'
>;

const STORE = { operation: 'store labels', retryOnDisconnect: true } as const;
const LABEL_STORE = { uid: true, useLabels: true } as const;

const encodedLabel = (label: string, reading: LabelReading): string =>
  reading.utf8 || label.startsWith('\\') ? label : encodeModifiedUtf7(label);

const storeOnClient = async (
  client: LabelStoreClient,
  uids: readonly number[],
  mutation: LabelMutation,
): Promise<void> => {
  if (!hasGmailLabels(client)) {
    throw new NotImplementedError('Gmail labels on this server');
  }
  const reading = labelReadingOf(client);
  const add = mutation.add.map((label) => encodedLabel(label, reading));
  const remove = mutation.remove.map((label) => encodedLabel(label, reading));
  if (add.length > 0) {
    requireAccepted('store labels', await client.messageFlagsAdd([...uids], add, LABEL_STORE));
  }
  if (remove.length > 0) {
    requireAccepted(
      'store labels',
      await client.messageFlagsRemove([...uids], remove, LABEL_STORE),
    );
  }
};

export const setLabels = async (
  connection: ImapConnection,
  path: string,
  uids: readonly number[],
  mutation: LabelMutation,
): Promise<void> => {
  if (uids.length === 0 || (mutation.add.length === 0 && mutation.remove.length === 0)) {
    return;
  }
  await connection.withMailbox(path, STORE, (client) => storeOnClient(client, uids, mutation));
};
