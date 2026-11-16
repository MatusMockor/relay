import type {
  CalendarConnectionId,
  GoogleCalendar,
  GoogleCalendarConnection,
  GoogleCalendarId,
  GoogleCalendarOverview,
  OAuthCredentials,
  UserId,
} from '@relay/shared/domain';
import type { UpdateGoogleCalendarBody } from '@relay/shared/api';
import { NotFoundError, ValidationError } from '../../errors';
import type { GoogleConnectionRecord } from '../../model/google-calendar';
import type { AccountRepository } from '../../ports/account-repository';
import type { Clock } from '../../ports/clock';
import type { GoogleCalendarAdapters } from '../../ports/google-calendar-adapters';
import type { IdGenerator } from '../../ports/id-generator';
import type { Repositories } from '../../ports/repositories';
import type { EngineEvents } from '../shared/engine-events';
import type { GoogleCalendarPreferencesService } from './google-calendar-preferences';
import type { GoogleConnectionSync } from './google-connection-sync';
import { GOOGLE_MESSAGES } from './google-messages';
import { grantsGoogleCalendar } from './google-scopes';
import { toConnectionView } from './google-views';

export interface GoogleConnectInput {
  readonly email: string;
  readonly credentials: OAuthCredentials;
}

export interface GoogleConnectionServiceDeps {
  readonly repositories: Pick<Repositories, 'googleConnections' | 'googleCalendars'>;
  readonly accounts: AccountRepository;
  readonly adapters: GoogleCalendarAdapters;
  readonly sync: GoogleConnectionSync;
  readonly preferences: GoogleCalendarPreferencesService;
  readonly notifier: EngineEvents;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export class GoogleConnectionService {
  constructor(private readonly deps: GoogleConnectionServiceDeps) {}

  async overview(userId: UserId): Promise<GoogleCalendarOverview> {
    const [setup, connections] = await Promise.all([
      this.deps.adapters.setup.setup(),
      this.deps.repositories.googleConnections.list(userId),
    ]);
    return { ...setup, connections: await Promise.all(connections.map((c) => this.view(c))) };
  }

  async connect(userId: UserId, input: GoogleConnectInput): Promise<GoogleCalendarConnection> {
    if (!grantsGoogleCalendar(input.credentials.scope)) {
      throw new ValidationError(GOOGLE_MESSAGES.missingScope);
    }
    const email = input.email.toLowerCase();
    const record = await this.deps.repositories.googleConnections.save(
      await this.recordFor(userId, email),
    );
    await this.deps.adapters.credentials.set(record.id, input.credentials);
    await this.deps.sync.sync(record);
    return this.view(await this.reload(userId, record.id));
  }

  async disconnect(userId: UserId, connectionId: CalendarConnectionId): Promise<void> {
    const record = await this.reload(userId, connectionId);
    await this.deps.adapters.credentials.delete(record.id);
    await this.deps.repositories.googleConnections.delete(userId, record.id);
    await this.deps.notifier.emit(userId, 'calendar.updated', {
      sourceKind: 'google',
      sourceId: record.id,
    });
  }

  async sync(
    userId: UserId,
    connectionId: CalendarConnectionId,
  ): Promise<GoogleCalendarConnection> {
    await this.deps.sync.sync(await this.reload(userId, connectionId));
    return this.view(await this.reload(userId, connectionId));
  }

  updateCalendar(
    userId: UserId,
    calendarId: GoogleCalendarId,
    patch: UpdateGoogleCalendarBody,
  ): Promise<GoogleCalendar> {
    return this.deps.preferences.update(userId, calendarId, patch);
  }

  private async recordFor(userId: UserId, email: string): Promise<GoogleConnectionRecord> {
    const now = this.deps.clock.now().toISOString();
    const existing = await this.deps.repositories.googleConnections.findByEmail(userId, email);
    const accounts = await this.deps.accounts.listByUser(userId);
    const linked = accounts.find(
      (account) => account.provider === 'gmail' && account.email.toLowerCase() === email,
    );
    const base = existing ?? {
      id: this.deps.ids.generate('calendarConnection'),
      userId,
      email,
      lastSyncedAt: null,
      lastAttemptAt: null,
      createdAt: now,
    };
    return {
      ...base,
      accountId: linked?.id ?? null,
      status: 'pending',
      lastError: null,
      updatedAt: now,
    };
  }

  private async reload(
    userId: UserId,
    connectionId: CalendarConnectionId,
  ): Promise<GoogleConnectionRecord> {
    const record = await this.deps.repositories.googleConnections.findById(userId, connectionId);
    if (record === null) {
      throw new NotFoundError('Google calendar connection', connectionId);
    }
    return record;
  }

  private async view(record: GoogleConnectionRecord): Promise<GoogleCalendarConnection> {
    return toConnectionView(
      record,
      await this.deps.repositories.googleCalendars.listByConnection(record.id),
    );
  }
}
