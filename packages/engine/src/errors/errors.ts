import { EngineError } from './engine-error';

export class NotFoundError extends EngineError {
  constructor(entity: string, id: string, options?: ErrorOptions) {
    super('not_found', `${entity} ${id} was not found`, options);
  }
}

export class ValidationError extends EngineError {
  constructor(message: string, options?: ErrorOptions) {
    super('validation_failed', message, options);
  }
}

export class ConflictError extends EngineError {
  constructor(message: string, options?: ErrorOptions) {
    super('conflict', message, options);
  }
}

export class ForbiddenError extends EngineError {
  constructor(message: string, options?: ErrorOptions) {
    super('forbidden', message, options);
  }
}

export class ProviderError extends EngineError {
  constructor(message: string, options?: ErrorOptions) {
    super('provider_error', message, options);
  }
}

export class NotImplementedError extends EngineError {
  constructor(feature: string, options?: ErrorOptions) {
    super('not_implemented', `${feature} is not implemented`, options);
  }
}
