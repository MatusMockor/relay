import type { Mailbox } from 'imapkit';
import type { OutputHandler } from 'imapkit/lib/types.js';
import { isAllMail } from './gmail-layout';
import { isMailbox, msgidOf } from './gmail-message';

const COPY_RESPONSES: ReadonlySet<string> = new Set([
  'COPY',
  'UID COPY',
  'MOVE COPYUID',
  'UID MOVE COPYUID',
]);

interface CopyResult {
  readonly mailbox: Mailbox;
  targetUids: number[];
}

const isCopyResult = (value: unknown): value is CopyResult =>
  typeof value === 'object' &&
  value !== null &&
  'mailbox' in value &&
  isMailbox(value.mailbox) &&
  'targetUids' in value &&
  Array.isArray(value.targetUids);

const survivingUid = (mailbox: Mailbox, uid: number): number => {
  const added = mailbox.messages.find((message) => message.uid === uid);
  const msgid = added === undefined ? '' : msgidOf(added);
  if (msgid === '') {
    return uid;
  }
  const kept = mailbox.messages.find(
    (message) => message !== added && message.ghost !== true && msgidOf(message) === msgid,
  );
  return kept?.uid ?? uid;
};

export const survivingCopyUids: OutputHandler = (
  _connection,
  _response,
  description,
  _parsed,
  _data,
  extra: unknown,
) => {
  if (description === undefined || !COPY_RESPONSES.has(description) || !isCopyResult(extra)) {
    return;
  }
  if (!isAllMail(extra.mailbox.path)) {
    return;
  }
  extra.targetUids = extra.targetUids.map((uid) => survivingUid(extra.mailbox, uid));
};
