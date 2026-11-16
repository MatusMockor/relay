import type { CalendarInvitation, CalendarRsvpResponse } from '@relay/shared';
import { Button, Icon } from '@relay/ui';
import { useState } from 'react';
import { describeError } from '../../data/errors';
import { useRsvp } from '../../data/hooks/use-calendar';
import { showToast } from '../../state/toast-store';
import { systemTimeZone } from '../calendar/calendar-time';
import { conflictOf, headlineOf, peopleOf, RESPONSES, whenOf } from './invitation-copy';

const CONFIRMATION: Record<CalendarRsvpResponse, string> = {
  accepted: 'Odpoveď odoslaná: prijaté',
  tentative: 'Odpoveď odoslaná: možno',
  declined: 'Odpoveď odoslaná: odmietnuté',
};

export function InvitationCard({ invitation }: { readonly invitation: CalendarInvitation }) {
  const respond = useRsvp();
  const [busy, setBusy] = useState<CalendarRsvpResponse | null>(null);
  const cancelled = invitation.status === 'cancelled';
  const people = peopleOf(invitation);
  const conflict = conflictOf(invitation);
  const answer = (response: CalendarRsvpResponse) => {
    setBusy(response);
    respond(invitation.eventId, response, systemTimeZone())
      .then(() => {
        showToast(CONFIRMATION[response]);
      })
      .catch((error: unknown) => {
        showToast(describeError(error));
      })
      .finally(() => {
        setBusy(null);
      });
  };
  return (
    <section
      className={`inv${cancelled ? ' cancelled' : ''}`}
      aria-label={`Pozvánka ${invitation.title}`}
    >
      <span className="h">
        <Icon name="calendar" size={13} />
        {headlineOf(invitation)}
      </span>
      <b className="inv-t">{invitation.title === '' ? '(bez názvu)' : invitation.title}</b>
      <span className="inv-l">{whenOf(invitation)}</span>
      {invitation.location === null ? null : <span className="inv-l">{invitation.location}</span>}
      {people === null ? null : <span className="inv-l muted">{people}</span>}
      {conflict === null ? null : <span className="inv-warn">{conflict}</span>}
      {invitation.canRespond ? (
        <div className="inv-acts" role="group" aria-label="Odpoveď na pozvánku">
          {RESPONSES.map(([response, label]) => (
            <Button
              key={response}
              variant={invitation.myStatus === response ? 'primary' : 'default'}
              aria-pressed={invitation.myStatus === response}
              disabled={busy !== null}
              onClick={() => {
                answer(response);
              }}
            >
              {busy === response ? 'Odosiela sa…' : label}
            </Button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
