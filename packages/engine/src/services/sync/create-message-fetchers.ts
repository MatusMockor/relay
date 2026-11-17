import type { MessageRepository } from '../../ports/message-repository';
import type { CalendarPartsSink } from './calendar-parts-sink';
import { IncrementalMessageFetcher } from './incremental-message-fetcher';
import { InitialSync } from './initial-sync';
import { MessageFetchSteps, type MessageFetchStepsDeps } from './message-fetch-steps';
import type { SyncOptions } from './sync-options';

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
  return {
    incremental: new IncrementalMessageFetcher({ steps, options: deps.options }),
    initialSync: new InitialSync({
      steps,
      messages: deps.messages,
      calendarParts: deps.calendarParts,
      clock: deps.clock,
      logger: deps.logger,
      options: deps.options,
    }),
  };
};
