import type { AccountId } from '@relay/shared/domain';
import type { RemoteTextSearchField } from '../../model/remote-mail';
import type { MessageBodyStore } from '../../ports/message-body-store';

const DAY_MS = 24 * 60 * 60_000;
const MARGIN_DAYS = 2;

export type RemoteBodyBound = Date | null | undefined;

const dayAfter = (date: Date): Date =>
  new Date(Math.floor(date.getTime() / DAY_MS) * DAY_MS + MARGIN_DAYS * DAY_MS);

export class RemoteBodies {
  constructor(private readonly store: MessageBodyStore | undefined) {}

  async bound(
    accountId: AccountId,
    field: RemoteTextSearchField,
    historyComplete: boolean,
  ): Promise<RemoteBodyBound> {
    const { store } = this;
    if (store === undefined || field !== 'all' || !historyComplete) {
      return undefined;
    }
    const newest = await store.newestRemoteDate(accountId);
    return newest === null ? null : dayAfter(newest);
  }
}
