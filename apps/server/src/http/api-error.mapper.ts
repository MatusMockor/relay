import { HttpException } from '@nestjs/common';
import { isEngineError } from '@relay/engine';
import { API_ERROR_HTTP_STATUS, type ApiErrorBody, type ApiErrorCode } from '@relay/shared/api';
import { ApiException } from './api-exception';

export interface MappedApiError {
  readonly status: number;
  readonly body: ApiErrorBody;
  readonly unexpected: boolean;
}

const STATUS_CODES: ReadonlyMap<number, ApiErrorCode> = new Map(
  Object.entries(API_ERROR_HTTP_STATUS).map(([code, status]) => [status, code as ApiErrorCode]),
);

const codeForStatus = (status: number): ApiErrorCode => {
  const known = STATUS_CODES.get(status);
  if (known !== undefined) {
    return known;
  }
  if (status === 413 || status === 415 || (status >= 400 && status < 500)) {
    return 'validation_failed';
  }
  return 'internal';
};

const fromCode = (code: ApiErrorCode, message: string, issues?: ApiErrorBody['issues']) => ({
  status: API_ERROR_HTTP_STATUS[code],
  body: issues === undefined ? { code, message } : { code, message, issues },
  unexpected: code === 'internal',
});

const readStatusCode = (error: unknown): number | null => {
  if (typeof error !== 'object' || error === null || !('statusCode' in error)) {
    return null;
  }
  const status = error.statusCode;
  return typeof status === 'number' && status >= 400 && status < 600 ? status : null;
};

const withStatus = (status: number, message: string): MappedApiError => {
  const code = codeForStatus(status);
  return { status, body: { code, message }, unexpected: status >= 500 };
};

export const mapApiError = (error: unknown): MappedApiError => {
  if (error instanceof ApiException) {
    return fromCode(error.body.code, error.body.message, error.body.issues);
  }
  if (isEngineError(error)) {
    return fromCode(error.code, error.message);
  }
  if (error instanceof HttpException) {
    return withStatus(error.getStatus(), error.message);
  }
  const status = readStatusCode(error);
  if (status !== null && error instanceof Error) {
    return withStatus(status, error.message);
  }
  return fromCode('internal', 'Internal server error');
};
