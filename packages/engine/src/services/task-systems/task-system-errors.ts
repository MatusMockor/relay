import { isEngineError } from '../../errors/engine-error';
import { ForbiddenError, ProviderError } from '../../errors/errors';
import { ReauthorizationRequiredError } from '../../errors/reauthorization-error';

export const UNREACHABLE_MESSAGE = 'Systém úloh je nedostupný. Skús to neskôr.';
export const MISSING_SECRET_MESSAGE = 'Chýbajú prihlasovacie údaje. Pripoj systém znova.';

export const isAuthFailure = (error: unknown): error is ReauthorizationRequiredError =>
  error instanceof ReauthorizationRequiredError;

export const toTaskSystemError = (error: unknown): Error => {
  if (isAuthFailure(error)) {
    return new ForbiddenError(error.message, { cause: error });
  }
  if (isEngineError(error)) {
    return error;
  }
  return new ProviderError(UNREACHABLE_MESSAGE, { cause: error });
};
