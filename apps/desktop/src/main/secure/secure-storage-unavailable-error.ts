import { EngineError } from '@relay/engine';

const MESSAGE =
  'Bezpečné úložisko nie je dostupné. Na Linuxe nainštalujte a odomknite kľúčenku (GNOME Keyring, KWallet alebo iný Secret Service) a spustite Relay znova.';

export class SecureStorageUnavailableError extends EngineError {
  constructor() {
    super('internal', MESSAGE);
  }
}
