import type { MailboxRole } from '@relay/shared/domain';

const HELD_ROLES: ReadonlySet<MailboxRole> = new Set(['trash', 'spam']);

export const isHeldRole = (role: MailboxRole): boolean => HELD_ROLES.has(role);
