import type { EngineDeps } from '../../engine-deps';
import type { EngineEvents } from '../shared/engine-events';
import { AccountRegistration } from './account-registration';
import { AccountService } from './account-service';
import { AccountUpdater } from './account-updater';
import { ConnectionTester } from './connection-tester';
import { PrimaryAccountPublisher } from './primary-account-publisher';

export const createAccountService = (
  deps: EngineDeps,
  shared: { readonly events: EngineEvents },
): AccountService => {
  const { repositories, credentialVault: vault, clock, idGenerator: ids, logger } = deps;
  const tester = new ConnectionTester(deps.mailProviderFactory, deps.mailSender);
  return new AccountService({
    accounts: repositories.accounts,
    mailboxes: repositories.mailboxes,
    vault,
    registration: new AccountRegistration({
      accounts: repositories.accounts,
      vault,
      tester,
      clock,
      ids,
    }),
    updater: new AccountUpdater(repositories.accounts, vault, tester),
    primary: new PrimaryAccountPublisher(repositories.accounts, shared.events),
    tester,
    events: shared.events,
    logger,
  });
};
