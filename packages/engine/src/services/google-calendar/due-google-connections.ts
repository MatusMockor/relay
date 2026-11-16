import type { Clock } from '../../ports/clock';
import type { GoogleConnectionRepository } from '../../ports/google-calendar-repositories';
import type { GoogleConnectionSync } from './google-connection-sync';

export const DEFAULT_GOOGLE_SYNC_SECONDS = 300;
const BATCH = 20;

export interface DueGoogleConnectionsDeps {
  readonly connections: GoogleConnectionRepository;
  readonly sync: GoogleConnectionSync;
  readonly clock: Clock;
  readonly syncSeconds: number;
}

export class DueGoogleConnections {
  constructor(private readonly deps: DueGoogleConnectionsDeps) {}

  async syncDue(): Promise<number> {
    const cutoff = new Date(this.deps.clock.now().getTime() - this.deps.syncSeconds * 1000);
    const due = await this.deps.connections.listDue(cutoff.toISOString(), BATCH);
    for (const connection of due) {
      await this.deps.sync.sync(connection);
    }
    return due.length;
  }
}
