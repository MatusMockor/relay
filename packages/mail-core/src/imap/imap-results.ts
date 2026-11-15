import { ProviderError } from '@relay/engine';

export const requireAccepted = <Result>(operation: string, result: Result | false): Result => {
  if (result === false) {
    throw new ProviderError(`IMAP ${operation} was rejected by the server`);
  }
  return result;
};
