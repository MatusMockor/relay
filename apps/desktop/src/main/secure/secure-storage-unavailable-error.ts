import { EngineError } from '@relay/engine';

const MESSAGE =
  'Bezpečné úložisko nie je dostupné. Na Linuxe nainštaluj a odomkni kľúčenku (GNOME Keyring, KWallet alebo iný Secret Service) a spusti Relay znova.';

export class SecureStorageUnavailableError extends EngineError {
  constructor() {
    super('internal', MESSAGE);
  }
}
