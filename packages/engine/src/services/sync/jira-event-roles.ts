import type { MailboxRole } from '@relay/shared/domain';

const IGNORED_ROLES: ReadonlySet<MailboxRole> = new Set(['spam', 'custom']);

export const acceptsJiraEvents = (role: MailboxRole): boolean => !IGNORED_ROLES.has(role);
