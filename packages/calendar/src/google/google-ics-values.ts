import { isIanaZone, wallTimeAt } from '../ics/wall-clock';
import type { GoogleEventDateTime } from './google-api-schemas';

const pad = (value: number): string => String(value).padStart(2, '0');

export const escapeText = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

const printable = (value: string): string =>
  Array.from(value, (char) => (char.charCodeAt(0) < 0x20 || char === '"' ? '' : char)).join('');

export const paramValue = (value: string): string => `"${printable(value)}"`;

const utcStamp = (instant: number): string =>
  new Date(instant)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');

export const dtstampValue = (iso: string | undefined): string =>
  utcStamp(iso === undefined ? 0 : Date.parse(iso));

export const dateProperty = (
  name: string,
  value: GoogleEventDateTime,
  fallbackZone: string | null,
): string | null => {
  if (value.date !== undefined) {
    return `${name};VALUE=DATE:${value.date.replace(/-/g, '')}`;
  }
  if (value.dateTime === undefined) {
    return null;
  }
  const instant = Date.parse(value.dateTime);
  const zone = value.timeZone ?? fallbackZone;
  if (zone === null || !isIanaZone(zone)) {
    return `${name}:${utcStamp(instant)}`;
  }
  const wall = wallTimeAt(instant, zone);
  const stamp = `${String(wall.year)}${pad(wall.month)}${pad(wall.day)}T${pad(wall.hour)}${pad(wall.minute)}${pad(wall.second)}`;
  return `${name};TZID=${zone}:${stamp}`;
};
