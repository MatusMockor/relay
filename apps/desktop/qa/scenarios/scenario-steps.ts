import type { AppSession } from './app-session';

export interface StepRecorder {
  attempt(label: string, work: () => Promise<void>): Promise<boolean>;
  readonly failures: readonly string[];
}

export const stepRecorder = (session: AppSession): StepRecorder => {
  const failures: string[] = [];
  return {
    failures,
    attempt: async (label, work) => {
      session.step(label);
      try {
        await work();
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
        failures.push(`${label}: ${message ?? ''}`);
        session.step(`FAILED ${label}: ${message ?? ''}`);
        await session.screenshot(`${label}-failed`).catch(() => undefined);
        return false;
      }
    },
  };
};
