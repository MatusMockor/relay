import {
  type CreateCalendarEventBody,
  CreateCalendarEventBodySchema,
  EmailAddressSchema,
  type GoogleCalendarId,
} from '@relay/shared';

export interface EventDraft {
  readonly calendarId: GoogleCalendarId | null;
  readonly title: string;
  readonly allDay: boolean;
  readonly from: string;
  readonly to: string;
  readonly location: string;
  readonly attendees: string;
}

export type DraftResult =
  | { readonly ok: true; readonly body: CreateCalendarEventBody }
  | { readonly ok: false; readonly error: string };

const atTime = (day: Date, time: string): Date | null => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (match === null) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return null;
  }
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes);
};

const emailsOf = (input: string): string[] | null => {
  const emails = input
    .split(/[\s,;]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
  return emails.every((email) => EmailAddressSchema.safeParse(email).success) ? emails : null;
};

const spanOf = (draft: EventDraft, day: Date): { start: Date; end: Date } | null => {
  if (draft.allDay) {
    return {
      start: new Date(day.getFullYear(), day.getMonth(), day.getDate()),
      end: new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1),
    };
  }
  const start = atTime(day, draft.from);
  const end = atTime(day, draft.to);
  return start === null || end === null ? null : { start, end };
};

export const buildEventBody = (draft: EventDraft, day: Date, timeZone: string): DraftResult => {
  if (draft.calendarId === null) {
    return { ok: false, error: 'Vyber kalendár.' };
  }
  if (draft.title.trim() === '') {
    return { ok: false, error: 'Zadaj názov udalosti.' };
  }
  const span = spanOf(draft, day);
  if (span === null || span.end.getTime() <= span.start.getTime()) {
    return { ok: false, error: 'Koniec musí byť po začiatku, čas zadaj ako 9:30.' };
  }
  const attendees = emailsOf(draft.attendees);
  if (attendees === null) {
    return { ok: false, error: 'Niektorá adresa účastníka nie je platná.' };
  }
  const parsed = CreateCalendarEventBodySchema.safeParse({
    calendarId: draft.calendarId,
    title: draft.title.trim(),
    allDay: draft.allDay,
    start: span.start.toISOString(),
    end: span.end.toISOString(),
    timeZone,
    location: draft.location.trim() === '' ? null : draft.location.trim(),
    attendees,
  });
  if (!parsed.success) {
    return { ok: false, error: 'Udalosť sa nedá vytvoriť, skontroluj údaje.' };
  }
  return { ok: true, body: parsed.data };
};
