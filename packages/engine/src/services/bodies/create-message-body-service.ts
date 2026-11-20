import type { EngineDeps } from '../../engine-deps';
import type { LingeringSessions } from '../shared/lingering-sessions';
import { type BodyOptions, DEFAULT_BODY_OPTIONS } from './body-options';
import { MessageBodyService } from './message-body-service';
import { MessageCopyFinder } from './message-copies';
import { RemoteBodyCache } from './remote-body-cache';
import { RemoteBodyFetcher } from './remote-body-fetcher';

export const bodyOptionsOf = (deps: EngineDeps): BodyOptions => ({
  ...DEFAULT_BODY_OPTIONS,
  ...deps.options.bodies,
});

export const createMessageBodyService = (
  deps: EngineDeps,
  sessions: LingeringSessions,
): MessageBodyService => {
  const options = bodyOptionsOf(deps);
  const { repositories } = deps;
  return new MessageBodyService({
    messages: repositories.messages,
    accounts: repositories.accounts,
    copies: new MessageCopyFinder(repositories.messages),
    fetcher: new RemoteBodyFetcher({
      sessions,
      mailboxes: repositories.mailboxes,
      parser: deps.messageParser,
      logger: deps.logger.child({ component: 'remote-bodies' }),
    }),
    cache: new RemoteBodyCache(deps.clock, {
      maxBytes: options.cacheBytes,
      maxEntries: options.cacheEntries,
      ttlMs: options.cacheTtlMs,
    }),
  });
};
