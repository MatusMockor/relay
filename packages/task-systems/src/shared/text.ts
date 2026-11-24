export const clip = (value: string | null | undefined, max: number): string =>
  (value ?? '').trim().slice(0, max);

export const clipOrNull = (value: string | null | undefined, max: number): string | null => {
  const clipped = clip(value, max);
  return clipped === '' ? null : clipped;
};
