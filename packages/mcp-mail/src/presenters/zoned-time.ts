const PARTS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
};

const pad = (value: number): string => String(value).padStart(2, '0');

const wallClock = (instant: Date, timeZone: string): Record<string, string> =>
  Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { ...PARTS, timeZone })
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );

const offsetOf = (instant: Date, wall: Record<string, string>): string => {
  const asUtc = Date.UTC(
    Number(wall.year),
    Number(wall.month) - 1,
    Number(wall.day),
    Number(wall.hour),
    Number(wall.minute),
    Number(wall.second),
  );
  const minutes = Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
  const sign = minutes < 0 ? '-' : '+';
  const absolute = Math.abs(minutes);
  return `${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
};

export const zonedDateTime = (iso: string, timeZone: string): string => {
  const instant = new Date(iso);
  const wall = wallClock(instant, timeZone);
  const date = `${wall.year ?? ''}-${wall.month ?? ''}-${wall.day ?? ''}`;
  const time = `${wall.hour ?? ''}:${wall.minute ?? ''}:${wall.second ?? ''}`;
  return `${date}T${time}${offsetOf(instant, wall)}`;
};

export const zonedDate = (iso: string, timeZone: string): string =>
  zonedDateTime(iso, timeZone).slice(0, 10);
