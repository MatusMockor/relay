export const MOMENTUM_SAMPLES = 5;
const MIN_RATIO = 0.7;
const MAX_SPREAD = 0.1;

export const recentSteps = (steps: readonly number[], step: number): readonly number[] => [
  ...steps.slice(-(MOMENTUM_SAMPLES - 1)),
  step,
];

export const isCoasting = (steps: readonly number[]): boolean => {
  if (steps.length < MOMENTUM_SAMPLES || steps.some((step) => step <= 0)) {
    return false;
  }
  const ratios = steps.slice(1).map((step, index) => step / (steps[index] ?? step));
  if (ratios.some((ratio) => ratio < MIN_RATIO || ratio >= 1)) {
    return false;
  }
  return Math.max(...ratios) - Math.min(...ratios) < MAX_SPREAD;
};
