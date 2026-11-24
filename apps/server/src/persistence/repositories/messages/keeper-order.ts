import { asc, desc, type SQL, sql } from 'drizzle-orm';
import { messages } from '../../schema';
import { placedInRole } from './placement-conditions';

export const MESSAGE_ID_ORDER: SQL = sql`${messages.id} collate "C"`;

export const placedInInbox = (): SQL => placedInRole('inbox');

export const keeperOrder = (): SQL[] => [desc(placedInInbox()), asc(MESSAGE_ID_ORDER)];
