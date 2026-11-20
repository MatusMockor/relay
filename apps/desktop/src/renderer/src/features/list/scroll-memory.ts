const LIMIT = 50;

const offsets = new Map<string, number>();

export const rememberedOffset = (key: string): number => offsets.get(key) ?? 0;

export const rememberOffset = (key: string, offset: number): void => {
  offsets.delete(key);
  offsets.set(key, offset);
  const oldest = offsets.keys().next();
  if (offsets.size > LIMIT && oldest.done !== true) {
    offsets.delete(oldest.value);
  }
};

export const forgetOffsets = (): void => {
  offsets.clear();
};
