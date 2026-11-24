import { readQaEnv } from '../config/qa-env';
import { createMailUser, deleteMailUser } from '../greenmail/greenmail-users';
import type { MailUser } from '../greenmail/mail-user';
import { seedMailbox } from '../seed/mail-seeder';
import type { SeedScenario } from '../seed/seed-message';
import { type AppSession, reportScenario, scenarioLog, withAppSession } from './app-session';
import type { ScenarioName } from './registry';

export interface ScenarioContext extends AppSession {
  readonly user: MailUser;
  readonly seeded: SeedScenario;
}

export interface ScenarioDefinition {
  readonly name: ScenarioName;
  readonly seed: (user: MailUser) => SeedScenario;
  readonly run: (context: ScenarioContext) => Promise<void>;
}

const runDefinition = async (definition: ScenarioDefinition): Promise<void> => {
  const env = readQaEnv();
  const user = await createMailUser(definition.name);
  const step = scenarioLog(definition.name);
  try {
    const started = Date.now();
    const seeded = definition.seed(user);
    const count = await seedMailbox(user, seeded);
    step(
      `seeded ${String(count)} messages for ${user.email} in ${String(Date.now() - started)} ms`,
    );
    await withAppSession(definition.name, {}, (session) =>
      definition.run({ ...session, user, seeded }),
    );
  } finally {
    if (!env.QA_KEEP_USER) {
      await deleteMailUser(user.email);
    }
  }
};

export const runScenario = (definition: ScenarioDefinition): Promise<void> =>
  reportScenario(definition.name, () => runDefinition(definition));
