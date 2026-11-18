export type FrameHeightSettler = (frameWidth: number, measured: number) => number;

export const createFrameHeightSettler = (): FrameHeightSettler => {
  let width = Number.NaN;
  let current = Number.NaN;
  let applied = new Set<number>();
  let growOnly = false;
  return (frameWidth, measured) => {
    if (frameWidth !== width) {
      width = frameWidth;
      applied = new Set();
      growOnly = false;
    }
    if (measured !== current && applied.has(measured)) {
      growOnly = true;
    }
    const height = growOnly ? Math.max(measured, ...applied) : measured;
    applied.add(height);
    current = height;
    return height;
  };
};
