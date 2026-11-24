import type { AiJob, AiOutputOf, Draft, ThreadSummary } from '@relay/shared/domain';
import type { Clock } from '../../ports/clock';
import type { IdGenerator } from '../../ports/id-generator';
import type { Repositories } from '../../ports/repositories';

export interface WrittenDraft {
  readonly draft: Draft;
  readonly thread: ThreadSummary | null;
}

export const replySubject = (subject: string): string =>
  /^re:/i.test(subject.trim()) ? subject : `Re: ${subject}`;

export class AutomationDraftWriter {
  constructor(
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async write(
    repositories: Repositories,
    job: AiJob,
    output: AiOutputOf<'automationDraft'>,
  ): Promise<WrittenDraft | null> {
    const { userId, input } = job;
    if (input.kind !== 'automationDraft' || output.body.trim() === '') {
      return null;
    }
    if ((await repositories.drafts.findByThread(userId, input.threadId)) !== null) {
      return null;
    }
    const message = await repositories.messages.findById(userId, input.messageId);
    const thread = await repositories.threads.findById(userId, input.threadId);
    const recipient = message?.replyTo[0] ?? message?.from ?? null;
    if (message?.threadId !== input.threadId || thread === null || recipient === null) {
      return null;
    }
    const now = this.clock.now().toISOString();
    const draft = await repositories.drafts.create(userId, {
      id: this.ids.generate('draft'),
      accountId: message.accountId,
      to: [recipient],
      cc: [],
      bcc: [],
      subject: replySubject(thread.subject),
      body: output.body.trim(),
      inReplyToThreadId: input.threadId,
      inReplyToMessageId: message.id,
      attachments: [],
      createdAt: now,
      updatedAt: now,
    });
    return { draft, thread: await repositories.threads.setHasDraft(userId, input.threadId, true) };
  }
}
