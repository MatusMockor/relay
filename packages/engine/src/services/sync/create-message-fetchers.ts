import type { MessageRepository } from '../../ports/message-repository';
import type { CalendarPartsSink } from './calendar-parts-sink';
import { InboxAncestors } from './inbox-ancestors';
import { IncrementalMessageFetcher } from './incremental-message-fetcher';
import { InitialBacklog } from './initial-backlog';
import { InitialSync } from './initial-sync';
import { MessageFetchSteps, type MessageFetchStepsDeps } from './message-fetch-steps';
import { RelatedMailSearch } from './related-mail-search';
import type { SyncOptions } from './sync-options';
import { TrashRelatives } from './trash-relatives';

export interface MessageFetchersDeps extends MessageFetchStepsDeps {
  readonly messages: MessageRepository;
  readonly calendarParts: CalendarPartsSink;
  readonly options: SyncOptions;
}

export interface MessageFetchers {
  readonly incremental: IncrementalMessageFetcher;
  readonly initialSync: InitialSync;
}

export const createMessageFetchers = (deps: MessageFetchersDeps): MessageFetchers => {
  const steps = new MessageFetchSteps(deps);
  const search = new RelatedMailSearch({ messages: deps.messages, logger: deps.logger });
  const backlog = new InitialBacklog({
    steps,
    relatives: new TrashRelatives(search),
    ancestors: new InboxAncestors({ messages: deps.messages, search }),
    logger: deps.logger,
    options: deps.options,
  });
  return {
    incremental: new IncrementalMessageFetcher({ steps, options: deps.options }),
    initialSync: new InitialSync({
      steps,
      backlog,
      messages: deps.messages,
      syncStates: deps.syncStates,
      calendarParts: deps.calendarParts,
      clock: deps.clock,
      logger: deps.logger,
      options: deps.options,
    }),
  };
};
