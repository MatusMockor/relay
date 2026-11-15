import type { MessageHeaders } from '@relay/engine';
import type { StoredHeaders } from '../../schema';

export const toStoredHeaders = (headers: MessageHeaders): StoredHeaders =>
  Object.fromEntries([...headers.entries()].map(([name, values]) => [name, [...values]]));

export const toMessageHeaders = (stored: StoredHeaders): MessageHeaders =>
  new Map(Object.entries(stored));
