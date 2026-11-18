// @vitest-environment jsdom
import { type CalendarOccurrence, CalendarOccurrenceSchema } from '@relay/shared';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AgendaRow } from '../src/features/side/AgendaRow';

const MONDAY = new Date(2026, 10, 16);

const at = (day: number, hours: number): string =>
  new Date(2026, 10, day, hours, 0, 0, 0).toISOString();

const event = (start: string, end: string): CalendarOccurrence =>
  CalendarOccurrenceSchema.parse({
    id: 'occ-1',
    eventId: 'occ-1',
    sourceKind: 'subscription',
    accountId: null,
    subscriptionId: 'sub-1',
    googleCalendarId: null,
    canDelete: false,
    canRespond: false,
    uid: 'occ-1@test',
    recurrenceId: null,
    title: 'Nočný release',
    location: null,
    start,
    end,
    allDay: false,
    status: 'confirmed',
    myStatus: null,
    organizer: null,
    threadId: null,
    color: '#3f7d6a',
  });

const detailOf = (offset: number): string | null => {
  const { container } = render(
    <AgendaRow
      occurrence={event(at(16, 22), at(17, 2))}
      base={MONDAY}
      offset={offset}
      past={false}
    />,
  );
  return container.querySelector('.eb > span')?.textContent ?? null;
};

describe('agenda row', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows only the end time when the start time is visible', () => {
    expect(detailOf(0)).toBe('do 2:00');
  });

  it('keeps the start time on the continuation row of an overnight event', () => {
    expect(detailOf(1)).toBe('22:00-2:00');
  });
});
