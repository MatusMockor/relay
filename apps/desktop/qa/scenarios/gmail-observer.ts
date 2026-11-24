import { listedSubjects } from '../app/inbox';
import { openThread, threadFacts, type ThreadFacts } from '../app/thread-view';
import type { AppSession } from './app-session';

export interface GmailObserver {
  list(label: string): Promise<string[]>;
  thread(subject: string, shot: string): Promise<ThreadFacts>;
}

export const observer = (session: AppSession): GmailObserver => ({
  list: async (label) => {
    const subjects = await listedSubjects(session.page);
    session.step(`${label} lists ${String(subjects.length)} rows: ${subjects.join(' | ')}`);
    return subjects;
  },
  thread: async (subject, shot) => {
    await openThread(session.page, subject);
    const facts = await threadFacts(session.page);
    session.step(
      `thread "${facts.title}": meta "${facts.meta}", ${String(facts.messageElements)} message elements`,
    );
    await session.screenshot(shot);
    return facts;
  },
});
