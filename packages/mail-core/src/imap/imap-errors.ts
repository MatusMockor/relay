import { ProviderError, isEngineError } from '@relay/engine';

interface ImapErrorShape {
  readonly authenticationFailed?: unknown;
  readonly responseText?: unknown;
  readonly code?: unknown;
}

const describe = (error: unknown): string => {
  if (typeof error !== 'object' || error === null) {
    return String(error);
  }
  const shape = error as ImapErrorShape;
  if (typeof shape.responseText === 'string' && shape.responseText !== '') {
    return shape.responseText;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'unknown error';
};

export const isAuthenticationError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  (error as ImapErrorShape).authenticationFailed === true;

export const toProviderError = (operation: string, error: unknown): Error => {
  if (isEngineError(error)) {
    return error;
  }
  if (isAuthenticationError(error)) {
    return new ProviderError('IMAP authentication failed', { cause: error });
  }
  return new ProviderError(`IMAP ${operation} failed: ${describe(error)}`, { cause: error });
};
