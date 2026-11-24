import type { SeedMessage } from '../seed/seed-message';

export interface GmailSeedMessage {
  readonly message: SeedMessage;
  readonly folders: readonly string[];
}

export interface GmailSeed {
  readonly total: number;
  readonly messages: () => Iterable<GmailSeedMessage>;
}
