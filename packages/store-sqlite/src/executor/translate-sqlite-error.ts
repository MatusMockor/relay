import { ConflictError, ValidationError } from '@relay/engine';

const CONFLICT_CODES = new Set(['SQLITE_CONSTRAINT_UNIQUE', 'SQLITE_CONSTRAINT_PRIMARYKEY']);
const FOREIGN_KEY_CODE = 'SQLITE_CONSTRAINT_FOREIGNKEY';

const sqliteCodeOf = (error: unknown): string | null => {
  if (!(error instanceof Error)) {
    return null;
  }
  if ('code' in error && typeof error.code === 'string') {
    return error.code;
  }
  return sqliteCodeOf(error.cause);
};

export const translateSqliteError = (error: unknown): unknown => {
  const code = sqliteCodeOf(error);
  if (code !== null && CONFLICT_CODES.has(code)) {
    return new ConflictError('The record conflicts with an existing record', { cause: error });
  }
  if (code === FOREIGN_KEY_CODE) {
    return new ValidationError('The record references a missing entity', { cause: error });
  }
  return error;
};
