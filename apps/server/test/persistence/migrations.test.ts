import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../../src/persistence/migrations/migration-runner';
import { createTestDatabase, type TestDatabase } from './support/test-database';

describe('runMigrations', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.drop();
  });

  it('creates every table and is idempotent', async () => {
    await runMigrations({ databaseUrl: database.url });
    const client = new pg.Client({ connectionString: database.url });
    await client.connect();
    const result = await client.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
    );
    await client.end();
    expect(result.rows.map((row) => row.table_name)).toEqual([
      'account_credentials',
      'ai_jobs',
      'ai_results',
      'attachments',
      'automation_runs',
      'automations',
      'calendar_events',
      'calendar_subscriptions',
      'devices',
      'draft_attachments',
      'drafts',
      'google_calendar_connections',
      'google_calendars',
      'labels',
      'mail_accounts',
      'mailboxes',
      'message_labels',
      'messages',
      'pending_work',
      'refresh_tokens',
      'reminders',
      'scheduled_sends',
      'splits',
      'sync_state',
      'tasks',
      'thread_splits',
      'threads',
      'user_settings',
      'users',
    ]);
  });

  it('runs concurrently without conflicts', async () => {
    await expect(
      Promise.all([
        runMigrations({ databaseUrl: database.url }),
        runMigrations({ databaseUrl: database.url }),
      ]),
    ).resolves.toHaveLength(2);
  });
});
