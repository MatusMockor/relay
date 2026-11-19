const inRange = (length: number, index: number): boolean => index >= 0 && index < length;

export const canMove = (length: number, from: number, to: number): boolean =>
  from !== to && inRange(length, from) && inRange(length, to);

export const moveRule = <T>(items: readonly T[], from: number, to: number): T[] => {
  const next = [...items];
  if (!canMove(items.length, from, to)) {
    return next;
  }
  const [moved] = next.splice(from, 1);
  if (moved === undefined) {
    return next;
  }
  next.splice(to, 0, moved);
  return next;
};
