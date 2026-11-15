import { isEngineError } from '@relay/engine';
import type { ApiErrorBody } from '@relay/shared/api';

export const toApiError = (error: unknown): ApiErrorBody => {
  if (isEngineError(error)) {
    return { code: error.code, message: error.message };
  }
  return { code: 'internal', message: 'Unexpected error in the main process' };
};
