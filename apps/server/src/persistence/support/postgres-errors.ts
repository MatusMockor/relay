const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

const hasCode = (value: unknown, code: string): boolean =>
  typeof value === 'object' && value !== null && 'code' in value && value.code === code;

const causeOf = (value: unknown): unknown => {
  if (value instanceof Error) {
    return value.cause;
  }
  return undefined;
};

const matches = (error: unknown, code: string): boolean => {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current !== undefined; depth += 1) {
    if (hasCode(current, code)) {
      return true;
    }
    current = causeOf(current);
  }
  return false;
};

export const isUniqueViolation = (error: unknown): boolean => matches(error, UNIQUE_VIOLATION);

export const isForeignKeyViolation = (error: unknown): boolean =>
  matches(error, FOREIGN_KEY_VIOLATION);
