type BackGuard = () => void;

const guards = new Set<BackGuard>();

export const guardBack = (guard: BackGuard): (() => void) => {
  guards.add(guard);
  return () => {
    guards.delete(guard);
  };
};

export const runBackGuards = (): void => {
  [...guards].forEach((guard) => {
    guard();
  });
};
