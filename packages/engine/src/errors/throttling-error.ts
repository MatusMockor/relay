const THROTTLING =
  /overquota|bandwidth|too many (simultaneous |concurrent )?connections|throttl|rate.?limit|\[limit\]/i;

const MAX_DEPTH = 5;

const textsOf = (error: object): string[] =>
  ['message', 'responseText', 'serverResponseCode', 'code'].flatMap((key) => {
    const value: unknown = Reflect.get(error, key);
    return typeof value === 'string' ? [value] : [];
  });

export const isThrottlingError = (error: unknown, depth = 0): boolean => {
  if (typeof error !== 'object' || error === null || depth > MAX_DEPTH) {
    return false;
  }
  if (textsOf(error).some((text) => THROTTLING.test(text))) {
    return true;
  }
  return isThrottlingError(Reflect.get(error, 'cause'), depth + 1);
};
