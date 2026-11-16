import { EngineError } from '@relay/engine';

const FILE_EXAMPLE = '{ "clientId": "...apps.googleusercontent.com", "clientSecret": "..." }';

export class OAuthNotConfiguredError extends EngineError {
  constructor(filePath: string) {
    super(
      'validation_failed',
      [
        'Prihlásenie cez Google nie je nastavené, chýba Google OAuth client ID.',
        'Nastav premennú prostredia RELAY_GOOGLE_CLIENT_ID (prípadne aj RELAY_GOOGLE_CLIENT_SECRET) a reštartuj Relay,',
        `alebo vytvor súbor ${filePath} s obsahom ${FILE_EXAMPLE}.`,
      ].join(' '),
    );
  }
}

export class OAuthConfigInvalidError extends EngineError {
  constructor(filePath: string) {
    super(
      'validation_failed',
      `Súbor ${filePath} s nastavením prihlásenia cez Google nie je platný. Očakáva sa JSON ${FILE_EXAMPLE}.`,
    );
  }
}

export class OAuthFlowError extends EngineError {
  constructor(message: string) {
    super('provider_error', message);
  }
}
