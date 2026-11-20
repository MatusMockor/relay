import type { GreenMailUser } from '@relay/config/test-infra';
import type { ParsedAttachment, RemoteAttachmentMeta, RemoteMessageSummary } from '@relay/engine';
import { ImapFlow } from 'imapflow';
import { expect } from 'vitest';
import { ImapMailProvider, MailparserMessageParser } from '../../src';
import { createGreenMailUser, deleteGreenMailUser, greenmailImap } from './greenmail';
import { FixedClock } from './infrastructure';
import { RecordingClientFactory } from './recording-client-factory';

export interface SummaryHarness {
  readonly user: GreenMailUser;
  readonly factory: RecordingClientFactory;
  readonly provider: ImapMailProvider;
  readonly admin: ImapFlow;
  readonly parser: MailparserMessageParser;
  readonly dispose: () => Promise<void>;
}

export const createSummaryHarness = async (): Promise<SummaryHarness> => {
  const user = await createGreenMailUser();
  const factory = new RecordingClientFactory(user);
  const provider = new ImapMailProvider(factory);
  const admin = new ImapFlow({
    ...greenmailImap,
    auth: { user: user.login, pass: user.password },
    logger: false,
  });
  await admin.connect();
  const parser = new MailparserMessageParser(new FixedClock(new Date('2026-11-15T10:00:00Z')));
  const dispose = async () => {
    await provider.close();
    await admin.logout().catch(() => undefined);
    await deleteGreenMailUser(user);
  };
  return { user, factory, provider, admin, parser, dispose };
};

export const appendFixture = async (
  harness: SummaryHarness,
  source: Uint8Array,
  flags: readonly string[] = [],
): Promise<number> => {
  const appended = await harness.admin.append('INBOX', Buffer.from(source), [...flags]);
  expect(appended).not.toBe(false);
  const uid = appended === false ? undefined : appended.uid;
  expect(uid).toBeTypeOf('number');
  return uid ?? 0;
};

export const measuredSummaries = async (
  harness: SummaryHarness,
  uidValidity: number,
  uids: readonly number[],
): Promise<{ summaries: RemoteMessageSummary[]; received: number }> => {
  const client = harness.factory.created.at(-1);
  expect(client).toBeDefined();
  client?.stats(true);
  const summaries = await harness.provider.fetchSummaries('INBOX', uidValidity, uids);
  return { summaries, received: client?.stats().received ?? 0 };
};

export const attachmentShape = (attachment: ParsedAttachment | RemoteAttachmentMeta) => ({
  filename: attachment.filename,
  contentType: attachment.contentType,
  inline: attachment.inline,
  contentId: attachment.contentId,
});
