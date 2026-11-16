import type { ThreadId } from '@relay/shared';
import { useInvitations } from '../../data/hooks/use-calendar';
import { systemTimeZone } from '../calendar/calendar-time';
import { InvitationCard } from './InvitationCard';

export function InvitationCards({ threadId }: { readonly threadId: ThreadId }) {
  const invitations = useInvitations(threadId, systemTimeZone());
  const items = invitations.data ?? [];
  if (items.length === 0) {
    return null;
  }
  return (
    <div className="inv-list">
      {items.map((invitation) => (
        <InvitationCard key={`${invitation.eventId}:${invitation.start}`} invitation={invitation} />
      ))}
    </div>
  );
}
