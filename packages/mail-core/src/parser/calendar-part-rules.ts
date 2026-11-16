const CALENDAR_TYPES = new Set(['text/calendar', 'application/ics', 'application/x-ics']);

export const MAX_CALENDAR_PART_BYTES = 1024 * 1024;
const MAX_PARTS = 5;

export const isCalendarPart = (contentType: string, filename: string | null | undefined): boolean =>
  CALENDAR_TYPES.has(contentType.toLowerCase()) || /\.ics$/i.test(filename ?? '');

export const calendarTexts = (texts: readonly string[]): string[] => {
  const unique = new Map<string, string>();
  texts
    .filter((text) => /BEGIN:VCALENDAR/i.test(text))
    .forEach((text) => {
      const key = text.trimEnd();
      unique.set(key, unique.get(key) ?? text);
    });
  return [...unique.values()].slice(0, MAX_PARTS);
};
