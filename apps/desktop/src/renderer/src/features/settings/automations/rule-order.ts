const inRange = (length: number, index: number): boolean => index >= 0 && index < length;

export const moveRule = <T>(items: readonly T[], from: number, to: number): T[] => {
  const next = [...items];
  if (from === to || !inRange(items.length, from) || !inRange(items.length, to)) {
    return next;
  }
  const [moved] = next.splice(from, 1);
  if (moved === undefined) {
    return next;
  }
  next.splice(to, 0, moved);
  return next;
};
