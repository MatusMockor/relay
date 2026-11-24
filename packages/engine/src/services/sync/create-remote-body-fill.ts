import type { EngineDeps } from '../../engine-deps';
import { HydrationParse } from '../bodies/hydration-parse';
import { RemoteBodyFill } from './remote-body-fill';

export const remoteBodyFill = (deps: EngineDeps): { readonly bodyFill?: RemoteBodyFill } => {
  const store = deps.messageBodies;
  if (store === undefined) {
    return {};
  }
  return {
    bodyFill: new RemoteBodyFill(store, new HydrationParse(deps.messageParser, deps.idGenerator)),
  };
};
