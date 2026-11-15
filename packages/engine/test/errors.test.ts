import type { ApiErrorCode } from '@relay/shared/api';
import { describe, expect, it } from 'vitest';
import {
  ConflictError,
  EngineError,
  ForbiddenError,
  isEngineError,
  NotFoundError,
  NotImplementedError,
  ProviderError,
  ValidationError,
} from '../src';

describe('engine errors', () => {
  it('maps each error to its api error code', () => {
    const cases: [EngineError, ApiErrorCode][] = [
      [new NotFoundError('Thread', 'thr_1'), 'not_found'],
      [new ValidationError('bad'), 'validation_failed'],
      [new ConflictError('dup'), 'conflict'],
      [new ForbiddenError('no'), 'forbidden'],
      [new ProviderError('imap down'), 'provider_error'],
      [new NotImplementedError('Outlook'), 'not_implemented'],
    ];
    cases.forEach(([error, code]) => {
      expect(error.code).toBe(code);
      expect(isEngineError(error)).toBe(true);
      expect(error).toBeInstanceOf(EngineError);
    });
  });

  it('keeps the subclass name and the cause', () => {
    const cause = new Error('socket closed');
    const error = new ProviderError('IMAP connection failed', { cause });
    expect(error.name).toBe('ProviderError');
    expect(error.cause).toBe(cause);
    expect(new NotFoundError('Thread', 'thr_1').message).toBe('Thread thr_1 was not found');
    expect(isEngineError(new Error('plain'))).toBe(false);
  });
});
