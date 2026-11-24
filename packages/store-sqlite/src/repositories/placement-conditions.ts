import type { MailboxRole } from '@relay/shared/domain';
import { type SQL, sql } from 'drizzle-orm';
import { mailboxes, messagePlacements, messages } from '../schema';

const placedWhere = (roleCondition: SQL): SQL =>
  sql`exists (select 1 from ${messagePlacements} inner join ${mailboxes} on ${mailboxes.id} = ${messagePlacements.mailboxId} where ${messagePlacements.messageId} = ${messages.id} and ${roleCondition})`;

export const placedInRole = (role: MailboxRole): SQL =>
  placedWhere(sql`${mailboxes.role} = ${role}`);

export const placedOutsideRoles = (roles: readonly MailboxRole[]): SQL =>
  placedWhere(sql`${mailboxes.role} not in ${[...roles]}`);

export const placedWithKnownUid: SQL = sql`exists (select 1 from ${messagePlacements} where ${messagePlacements.messageId} = ${messages.id} and ${messagePlacements.uid} > 0)`;
