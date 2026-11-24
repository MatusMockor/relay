import { MailClientError } from '../errors';

const FINAL_CODES = new Set(['forbidden', 'not_found', 'validation_failed', 'rate_limited']);

export const shouldRetryTasks = (failures: number, error: Error): boolean =>
  failures < 1 && !(error instanceof MailClientError && FINAL_CODES.has(error.code));
