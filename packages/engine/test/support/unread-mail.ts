import { deliverMail } from './fixtures';
import type { FakeMailServer } from './mail/fake-mail-server';

const FIRST_DATE = Date.parse('2026-11-14T00:00:00.000Z');
const MINUTE = 60_000;

export const deliverUnread = (
  server: FakeMailServer,
  path: string,
  ids: readonly string[],
): void => {
  ids.forEach((id, index) => {
    deliverMail(server, path, { id, date: new Date(FIRST_DATE + index * MINUTE).toISOString() });
  });
};
