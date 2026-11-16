import ICAL from 'ical.js';
import { isResolvedZone } from '../ics/ical-time';
import { isIanaZone, type WallTime, wallTimeAt } from '../ics/wall-clock';
import type { ZonedTime } from './occurrence-span';

const asUtc = (wall: WallTime): number =>
  Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);

const wallOf = (instant: number, zone: ZonedTime, viewerZone: string): WallTime => {
  if (isResolvedZone(zone.time)) {
    return ICAL.Time.fromJSDate(new Date(instant), true).convertToZone(zone.time.zone);
  }
  const tzid = zone.tzid !== null && isIanaZone(zone.tzid) ? zone.tzid : viewerZone;
  return wallTimeAt(instant, tzid);
};

export const wallShift = (from: number, to: number, zone: ZonedTime, viewerZone: string): number =>
  asUtc(wallOf(to, zone, viewerZone)) - asUtc(wallOf(from, zone, viewerZone));
