import type { ApiErrorCode } from '@relay/shared/api';

export class EngineError extends Error {
  readonly code: ApiErrorCode;

  constructor(code: ApiErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
  }
}

export const isEngineError = (error: unknown): error is EngineError => error instanceof EngineError;
