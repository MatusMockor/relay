import { PORT_TOKENS, type PendingWorkRepository } from '@relay/engine';
import type { AccountId } from '@relay/shared/domain';
import { expect } from 'vitest';
import { waitForInbox } from '../../support/mail-flow';
import type { TestApp } from '../../support/test-app';

export const waitForInvites = async (
  app: TestApp,
  token: string,
  accountId: AccountId,
  messages: number,
): Promise<void> => {
  await waitForInbox(app.api, token, (threads) => threads.length >= messages, accountId);
  const work = app.app.get<symbol, PendingWorkRepository>(PORT_TOKENS.PendingWorkRepository);
  await expect
    .poll(async () => (await work.list(accountId, 'calendar-invite')).length, {
      timeout: 20_000,
      interval: 250,
    })
    .toBe(0);
};
