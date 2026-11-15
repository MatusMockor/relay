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

export class PartialMoveError extends ProviderError {
  constructor(
    readonly sourcePath: string,
    readonly targetPath: string,
    readonly uidMap: ReadonlyMap<number, number>,
    options?: ErrorOptions,
  ) {
    super(
      `IMAP move from ${sourcePath} to ${targetPath} failed after the messages were copied and the copies could not be rolled back`,
      options,
    );
  }
}

export class UidValidityChangedError extends ProviderError {
  constructor(
    readonly mailboxPath: string,
    readonly expected: number,
    readonly actual: number,
  ) {
    super(
      `UIDVALIDITY of ${mailboxPath} changed from ${String(expected)} to ${String(actual)}, the sync cursor is stale`,
    );
  }
}
