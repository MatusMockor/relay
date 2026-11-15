import type { ApiErrorBody, ApiErrorCode } from '@relay/shared/api';

export class ApiException extends Error {
  readonly body: ApiErrorBody;

  constructor(code: ApiErrorCode, message: string, issues?: ApiErrorBody['issues']) {
    super(message);
    this.name = 'ApiException';
    this.body = issues === undefined ? { code, message } : { code, message, issues };
  }

  static fromBody(body: ApiErrorBody): ApiException {
    return new ApiException(body.code, body.message, body.issues);
  }
}
