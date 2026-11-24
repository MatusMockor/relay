import {
  hasMessageBody,
  isBodyLocal,
  type MessageBodyResult,
  type MessageId,
  type ThreadDetail,
} from '@relay/shared';
import { forwardTarget } from './forward-draft';

export const FORWARD_BODY_WAIT_MS = 5_000;

export type MessageBodyLoader = (messageId: MessageId) => Promise<MessageBodyResult>;

const within = (work: Promise<MessageBodyResult>, waitMs: number) =>
  new Promise<MessageBodyResult | null>((resolve) => {
    const timer = setTimeout(() => {
      resolve(null);
    }, waitMs);
    work
      .then(resolve, () => {
        resolve(null);
      })
      .finally(() => {
        clearTimeout(timer);
      });
  });

export const withForwardBody = async (
  detail: ThreadDetail,
  messageId: MessageId | undefined,
  load: MessageBodyLoader,
  waitMs = FORWARD_BODY_WAIT_MS,
): Promise<ThreadDetail> => {
  const target = forwardTarget(detail.messages, messageId);
  if (target === undefined || isBodyLocal(target)) {
    return detail;
  }
  const result = await within(load(target.id), waitMs);
  if (result === null || !hasMessageBody(result)) {
    return detail;
  }
  return {
    ...detail,
    messages: detail.messages.map((message) =>
      message.id === target.id
        ? { ...message, textBody: result.textBody, htmlBody: result.htmlBody }
        : message,
    ),
  };
};
