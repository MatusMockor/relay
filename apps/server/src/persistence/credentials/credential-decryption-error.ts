import { EngineError } from '@relay/engine';

export class CredentialDecryptionError extends EngineError {
  constructor(message: string, options?: ErrorOptions) {
    super('internal', message, options);
  }
}
