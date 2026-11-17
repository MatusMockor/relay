import type { RawMessage } from '@relay/engine';
import type { FetchMessageObject, FetchQueryObject } from 'imapflow';
import { toKeywords, toMessageFlags } from './message-flags';

export const FULL_MESSAGE_QUERY: FetchQueryObject = {
  uid: true,
  flags: true,
  internalDate: true,
  size: true,
  source: true,
};

export const toIsoDate = (value: Date | string | undefined): string => {
  const date = value === undefined ? new Date(0) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date(0).toISOString();
  }
  return date.toISOString();
};

export const toRawMessage = (
  mailboxPath: string,
  fetched: FetchMessageObject,
): RawMessage | null => {
  if (!fetched.source) {
    return null;
  }
  return {
    mailboxPath,
    uid: fetched.uid,
    flags: toMessageFlags(fetched.flags),
    keywords: toKeywords(fetched.flags),
    internalDate: toIsoDate(fetched.internalDate),
    size: fetched.size ?? fetched.source.length,
    modseq: fetched.modseq === undefined ? null : fetched.modseq.toString(),
    source: new Uint8Array(fetched.source),
  };
};
