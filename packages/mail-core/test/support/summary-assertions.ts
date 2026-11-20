import type { ParsedMessage, RemoteMessageSummary } from '@relay/engine';
import { expect } from 'vitest';
import { isTraceHeader } from '../../src/parser/trace-headers';
import type { SummaryFixture } from './summary-fixtures';
import { attachmentShape } from './summary-harness';

const headerFields = (parsed: ParsedMessage) => ({
  from: parsed.from,
  to: parsed.to,
  cc: parsed.cc,
  subject: parsed.subject,
  date: parsed.date,
  messageIdHeader: parsed.messageIdHeader,
  inReplyTo: parsed.inReplyTo,
  references: parsed.references,
  unsubscribe: parsed.headers.get('list-unsubscribe'),
});

const SIZE_SLACK_BYTES = 256;

const expectSizeEstimates = (summary: RemoteMessageSummary, full: ParsedMessage): void => {
  summary.attachments.forEach((attachment, index) => {
    const real = full.attachments[index]?.size ?? 0;
    const slack = Math.max(real * 0.1, SIZE_SLACK_BYTES);
    expect(Math.abs(attachment.size - real)).toBeLessThanOrEqual(slack);
  });
};

const expectSnippet = (fixture: SummaryFixture, snippet: string, full: string): void => {
  if (fixture.snippetPrefix === true) {
    expect(snippet).not.toBe('');
    expect(full.startsWith(snippet)).toBe(true);
    return;
  }
  expect(snippet).toBe(full);
};

export const expectSummaryMatchesFullParse = (
  fixture: SummaryFixture,
  summary: RemoteMessageSummary,
  header: ParsedMessage,
  full: ParsedMessage,
): void => {
  expect(headerFields(header)).toEqual(headerFields(full));
  expect([...full.headers.keys()].some(isTraceHeader)).toBe(true);
  expect([...header.headers.keys()].filter(isTraceHeader)).toEqual([]);
  expect(summary.attachments.map(attachmentShape)).toEqual(full.attachments.map(attachmentShape));
  expectSizeEstimates(summary, full);
  expectSnippet(fixture, summary.snippet, full.snippet);
};
