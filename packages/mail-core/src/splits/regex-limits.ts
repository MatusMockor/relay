export const MAX_PATTERN_LENGTH = 500;
export const MAX_GROUP_DEPTH = 16;

const groupDepth = (pattern: string): number => {
  let depth = 0;
  let deepest = 0;
  let inClass = false;
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === '\\') {
      index += 1;
      continue;
    }
    if (inClass) {
      inClass = char !== ']';
      continue;
    }
    if (char === '[') {
      inClass = true;
      continue;
    }
    if (char === '(') {
      depth += 1;
      deepest = Math.max(deepest, depth);
      continue;
    }
    if (char === ')') {
      depth = Math.max(0, depth - 1);
    }
  }
  return deepest;
};

export const exceedsAnalysisLimits = (pattern: string): boolean =>
  pattern.length > MAX_PATTERN_LENGTH || groupDepth(pattern) > MAX_GROUP_DEPTH;
