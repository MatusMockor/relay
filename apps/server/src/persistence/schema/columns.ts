import { customType, timestamp } from 'drizzle-orm/pg-core';

export const timestampTz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const tsvector = customType<{ data: string }>({
  dataType: () => 'tsvector',
});
