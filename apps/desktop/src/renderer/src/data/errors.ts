import type { ApiErrorBody, ApiErrorCode, ApiErrorIssue } from '@relay/shared';

export class MailClientError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number | null;
  readonly issues: readonly ApiErrorIssue[];

  constructor(body: ApiErrorBody, status: number | null = null) {
    super(body.message);
    this.name = 'MailClientError';
    this.code = body.code;
    this.status = status;
    this.issues = body.issues ?? [];
  }
}

export const describeError = (error: unknown): string => {
  if (error instanceof MailClientError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Neznáma chyba';
};
