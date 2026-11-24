import { EngineError } from './engine-error';

export class RateLimitedError extends EngineError {
  constructor(message: string, options?: ErrorOptions) {
    super('rate_limited', message, options);
  }
}
