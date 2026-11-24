import { GMAIL_HOSTS, loopbackFor } from '../app/host-override';
import { deliverGmail } from '../gmail/gmail-delivery';
import type { GmailSeed } from '../gmail/gmail-seed';
import { type GmailServer, startGmailServer } from '../gmail/gmail-server';
import { type AppSession, reportScenario, scenarioLog, withAppSession } from './app-session';
import type { ScenarioName } from './registry';

export interface GmailScenarioContext extends AppSession {
  readonly gmail: GmailServer;
  readonly seed: GmailSeed;
}

export interface GmailScenarioDefinition {
  readonly name: ScenarioName;
  readonly seed: (gmail: GmailServer) => GmailSeed;
  readonly run: (context: GmailScenarioContext) => Promise<void>;
}

const megabytes = (bytes: number): string => `${String(Math.round(bytes / 1_048_576))} MB`;

const runDefinition = async (definition: GmailScenarioDefinition): Promise<void> => {
  const step = scenarioLog(definition.name);
  const gmail = await startGmailServer();
  try {
    const started = Date.now();
    const seed = definition.seed(gmail);
    const count = await deliverGmail(gmail, seed);
    step(
      `imapkit on ${gmail.host}:${String(gmail.port)} holds ${String(count)} messages, delivered in ${String(Date.now() - started)} ms, rss ${megabytes(process.memoryUsage().rss)}`,
    );
    await withAppSession(definition.name, { hostOverrides: loopbackFor(GMAIL_HOSTS) }, (session) =>
      definition.run({ ...session, gmail, seed }),
    );
  } finally {
    await gmail.stop();
  }
};

export const runGmailScenario = (definition: GmailScenarioDefinition): Promise<void> =>
  reportScenario(definition.name, () => runDefinition(definition));
