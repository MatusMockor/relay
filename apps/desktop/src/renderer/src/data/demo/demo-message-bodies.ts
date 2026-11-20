import { isBodyLocal, type Message, type MessageBodyResult, type MessageId } from '@relay/shared';
import { MailClientError } from '../errors';
import type { MailClient } from '../MailClient';
import type { DemoState } from './demo-state';

export interface DemoRemoteBody {
  readonly textBody: string | null;
  readonly htmlBody: string | null;
}

export interface DemoRemoteBodies {
  readonly delayMs: number;
  readonly offline: () => boolean;
  readonly bodies: ReadonlyMap<MessageId, DemoRemoteBody>;
}

const findMessage = (state: DemoState, messageId: MessageId): Message | undefined =>
  [...state.threads.values()]
    .flatMap((record) => record.messages)
    .find((message) => message.id === messageId);

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const remoteBody = async (
  messageId: MessageId,
  remote: DemoRemoteBodies | undefined,
): Promise<MessageBodyResult> => {
  await wait(remote?.delayMs ?? 0);
  if (remote?.offline() === true) {
    return { status: 'offline' };
  }
  const body = remote?.bodies.get(messageId);
  return body === undefined ? { status: 'gone' } : { status: 'ok', ...body };
};

export const createDemoMessageBodies = (
  state: DemoState,
  remote: DemoRemoteBodies | undefined,
): Pick<MailClient, 'getMessageBody'> => ({
  getMessageBody: (messageId) => {
    const message = findMessage(state, messageId);
    if (message === undefined) {
      return Promise.reject(
        new MailClientError({ code: 'not_found', message: 'Správa neexistuje' }),
      );
    }
    if (isBodyLocal(message)) {
      return Promise.resolve({
        status: 'local',
        textBody: message.textBody,
        htmlBody: message.htmlBody,
      });
    }
    return remoteBody(messageId, remote);
  },
});
