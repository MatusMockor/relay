import { normalizeSubject } from './normalize-subject';

export const DEFAULT_SUBJECT_WINDOW_DAYS = 14;

const DAY_MS = 86_400_000;

export interface SubjectFallbackCandidate {
  readonly subject: string;
  readonly date: string;
  readonly hasReplyHeaders: boolean;
}

export interface SubjectFallbackWindow {
  readonly normalizedSubject: string;
  readonly since: Date;
  readonly until: Date;
}

export const subjectFallbackWindow = (
  candidate: SubjectFallbackCandidate,
  windowDays: number = DEFAULT_SUBJECT_WINDOW_DAYS,
): SubjectFallbackWindow | null => {
  const subject = normalizeSubject(candidate.subject);
  if (subject.value === '' || !(subject.hadReplyPrefix || candidate.hasReplyHeaders)) {
    return null;
  }
  const until = new Date(candidate.date);
  return {
    normalizedSubject: subject.value,
    since: new Date(until.getTime() - windowDays * DAY_MS),
    until,
  };
};
