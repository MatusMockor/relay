import { describe, expect, it } from 'vitest';
import { shouldRetryTasks } from '../src/data/hooks/task-system-retry';
import { MailClientError } from '../src/data/errors';

const failure = (code: 'rate_limited' | 'forbidden' | 'provider_error') =>
  new MailClientError({ code, message: 'Zlyhalo' });

describe('task list retries', () => {
  it('retries a provider failure once', () => {
    expect(shouldRetryTasks(0, failure('provider_error'))).toBe(true);
    expect(shouldRetryTasks(1, failure('provider_error'))).toBe(false);
  });

  it('never retries a rate limit or rejected credentials on its own', () => {
    expect(shouldRetryTasks(0, failure('rate_limited'))).toBe(false);
    expect(shouldRetryTasks(0, failure('forbidden'))).toBe(false);
  });
});
