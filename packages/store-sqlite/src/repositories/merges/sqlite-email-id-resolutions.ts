import {
  type EmailIdResolutions,
  NotImplementedError,
  type UnresolvedPlacement,
} from '@relay/engine';

export class SqliteEmailIdResolutions implements EmailIdResolutions {
  listUnresolved(): Promise<UnresolvedPlacement[]> {
    return Promise.reject(new NotImplementedError('SQLite unresolved email ids'));
  }

  fillEmailIds(): Promise<number> {
    return Promise.reject(new NotImplementedError('SQLite email id resolution'));
  }
}
