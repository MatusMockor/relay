import {
  type EmailIdResolutions,
  NotImplementedError,
  type UnresolvedPlacement,
} from '@relay/engine';

export class PgEmailIdResolutions implements EmailIdResolutions {
  listUnresolved(): Promise<UnresolvedPlacement[]> {
    return Promise.reject(new NotImplementedError('Postgres unresolved email ids'));
  }

  fillEmailIds(): Promise<number> {
    return Promise.reject(new NotImplementedError('Postgres email id resolution'));
  }
}
