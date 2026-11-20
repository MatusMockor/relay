import type { RemoteMessageSummary } from '@relay/engine';
import type { FetchMessageObject, FetchQueryObject, ImapFlow } from 'imapflow';
import { stripTraceHeaders } from '../parser/trace-headers';
import { READ, requireSameUidValidity } from './fetch-batch';
import { labelReadingOf, toGmailLabels, type LabelReading } from './gmail-labels';
import type { ImapConnection } from './imap-connection';
import { toKeywords, toMessageFlags } from './message-flags';
import { toIsoDate } from './raw-message';
import { PREVIEW_BYTES, previewSnippet } from './summary-preview';
import type { PreviewPart } from './preview-part';
import { summaryStructure, type SummaryStructure } from './summary-structure';
import { chunk, sortedUids } from './uid-batches';

export const SUMMARY_BATCH_SIZE = 100;
export const PREVIEW_FETCH_GROUP_SIZE = 10;

const SUMMARY_QUERY: FetchQueryObject = {
  uid: true,
  flags: true,
  internalDate: true,
  size: true,
  labels: true,
  bodyStructure: true,
  headers: true,
};

interface Fetched {
  readonly message: FetchMessageObject;
  readonly structure: SummaryStructure;
}

const structureOf = (message: FetchMessageObject): SummaryStructure =>
  message.bodyStructure === undefined
    ? { preview: null, attachments: [] }
    : summaryStructure(message.bodyStructure);

interface PreviewRequest {
  readonly uid: number;
  readonly preview: PreviewPart;
}

const groupByPreviewPart = (fetched: readonly Fetched[]): Map<string, PreviewRequest[]> => {
  const groups = new Map<string, PreviewRequest[]>();
  fetched.forEach(({ message, structure }) => {
    const preview = structure.preview;
    if (preview === null) {
      return;
    }
    groups.set(preview.part, [...(groups.get(preview.part) ?? []), { uid: message.uid, preview }]);
  });
  return groups;
};

const fetchPreviewGroup = async (
  client: ImapFlow,
  part: string,
  requests: readonly PreviewRequest[],
  snippets: Map<number, string>,
): Promise<void> => {
  const uids = requests.map((request) => request.uid);
  const query = { uid: true, bodyParts: [{ key: part, start: 0, maxLength: PREVIEW_BYTES }] };
  const parts = await client.fetchAll(uids, query, { uid: true });
  const raws = new Map(parts.map((entry) => [entry.uid, entry.bodyParts?.get(part.toLowerCase())]));
  requests.forEach(({ uid, preview }) => {
    const raw = raws.get(uid);
    if (raw !== undefined) {
      snippets.set(uid, previewSnippet(raw, preview));
    }
  });
};

const fetchPreviews = async (
  client: ImapFlow,
  fetched: readonly Fetched[],
): Promise<Map<number, string>> => {
  const snippets = new Map<number, string>();
  for (const [part, requests] of groupByPreviewPart(fetched)) {
    for (const group of chunk(requests, PREVIEW_FETCH_GROUP_SIZE)) {
      await fetchPreviewGroup(client, part, group, snippets);
    }
  }
  return snippets;
};

const toSummary = (item: Fetched, snippet: string, reading: LabelReading): RemoteMessageSummary => {
  const message = item.message;
  return {
    uid: message.uid,
    flags: toMessageFlags(message.flags),
    keywords: toKeywords(message.flags),
    labels: toGmailLabels(reading, message.labels),
    emailId: message.emailId === undefined || message.emailId === '' ? null : message.emailId,
    internalDate: toIsoDate(message.internalDate),
    size: message.size ?? 0,
    modseq: message.modseq === undefined ? null : message.modseq.toString(),
    header: new Uint8Array(stripTraceHeaders(message.headers ?? Buffer.alloc(0))),
    snippet,
    attachments: item.structure.attachments,
  };
};

const fetchSummaryBatch = (
  connection: ImapConnection,
  path: string,
  uidValidity: bigint,
  uids: number[],
): Promise<RemoteMessageSummary[]> =>
  connection.withMailbox(path, READ, async (client, mailbox) => {
    requireSameUidValidity(path, uidValidity, mailbox);
    const messages = await client.fetchAll(uids, SUMMARY_QUERY, { uid: true });
    const fetched = messages.map((message) => ({ message, structure: structureOf(message) }));
    const snippets = await fetchPreviews(client, fetched);
    const reading = labelReadingOf(client);
    return fetched.map((item) => toSummary(item, snippets.get(item.message.uid) ?? '', reading));
  });

export const fetchSummaries = async (
  connection: ImapConnection,
  path: string,
  uidValidity: number,
  uids: readonly number[],
): Promise<RemoteMessageSummary[]> => {
  const summaries: RemoteMessageSummary[] = [];
  for (const batch of chunk(sortedUids(uids), SUMMARY_BATCH_SIZE)) {
    summaries.push(...(await fetchSummaryBatch(connection, path, BigInt(uidValidity), batch)));
  }
  return summaries.sort((left, right) => left.uid - right.uid);
};
