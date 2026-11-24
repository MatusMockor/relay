import { asc, desc, type SQL } from 'drizzle-orm';
import { messages } from '../schema';
import { placedInRole } from './placement-conditions';

export const placedInInbox: SQL = placedInRole('inbox');

export const keeperOrder: readonly SQL[] = [desc(placedInInbox), asc(messages.seq)];
