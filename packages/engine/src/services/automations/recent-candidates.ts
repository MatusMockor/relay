import type { MailboxRole, ThreadState } from '@relay/shared/domain';

export const RECENT_EXCLUDED_STATES: readonly ThreadState[] = ['trash', 'spam'];

export const RECENT_EXCLUDED_ROLES: readonly MailboxRole[] = ['sent', 'drafts', 'trash', 'spam'];

export const CANDIDATE_MESSAGES_PER_THREAD = 50;

export const CANDIDATE_MESSAGE_BATCH = 500;
