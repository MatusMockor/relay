import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GMAIL_HOSTS, loopbackFor } from '../app/host-override';
import { continuedBooks } from '../capture/continued-books';
import { readQaEnv } from '../config/qa-env';
import { deliverGmail } from '../gmail/gmail-delivery';
import { startGmailServer, type GmailServer } from '../gmail/gmail-server';
import { gmailSmallInbox } from '../gmail/gmail-small-inbox';
import { legacyAppDir } from '../run/legacy-app';
import {
  type AppSession,
  reportScenario,
  scenarioLog,
  type SessionOptions,
  withAppSession,
} from './app-session';
import type { GmailScenarioContext } from './gmail-scenario';
import { checkUpgrade, expectList } from './upgrade-checks';
import { runNewPhase } from './upgrade-new';
import { runOldPhase } from './upgrade-old';

const NAME = 'gmail-upgrade';
const SHOTS = 'upgrade';
const MERGE_LOG = /^\[\w+\] Copy merge[^\n{]*(?:\{\n[\s\S]*?\n\})?/gm;

const copyMergeLog = async (logFile: string): Promise<string[]> =>
  [...(await readFile(logFile, 'utf8')).matchAll(MERGE_LOG)].map((match) =>
    match[0].replace(/\s+/g, ' '),
  );

const phases = async (gmail: GmailServer, profileDir: string): Promise<void> => {
  const step = scenarioLog(NAME);
  const seed = gmailSmallInbox(gmail.account.email);
  const delivered = await deliverGmail(gmail, seed);
  step(`imapkit on ${gmail.host}:${String(gmail.port)} holds ${String(delivered)} messages`);
  const base: SessionOptions = {
    profileDir,
    hostOverrides: loopbackFor(GMAIL_HOSTS),
    openBook: continuedBooks(SHOTS),
  };
  const context = (session: AppSession): GmailScenarioContext => ({ ...session, gmail, seed });
  const before = await withAppSession(
    `${NAME}/old`,
    { ...base, appDir: await legacyAppDir() },
    (session) => runOldPhase(context(session)),
  );
  const launchedAt = Date.now();
  const after = await withAppSession(`${NAME}/new`, base, (session) =>
    runNewPhase(context(session), launchedAt),
  );
  const logFile = join(profileDir, 'app.log');
  (await copyMergeLog(logFile)).forEach((line) => {
    step(`app log: ${line}`);
  });
  const expect = expectList(step);
  checkUpgrade(expect, before, after);
  const failures = [...after.failures, ...expect.failures];
  assert.deepEqual(failures, [], `Failed checks:\n${failures.join('\n')}`);
};

const keepOrRemove = async (profileDir: string): Promise<void> => {
  if (readQaEnv().QA_KEEP_PROFILE) {
    scenarioLog(NAME)(`profile kept at ${profileDir}`);
    return;
  }
  await rm(profileDir, { recursive: true, force: true });
};

const runUpgrade = async (): Promise<void> => {
  const gmail = await startGmailServer();
  const profileDir = await mkdtemp(join(tmpdir(), 'relay-qa-upgrade-'));
  try {
    await phases(gmail, profileDir);
  } finally {
    await gmail.stop();
    await keepOrRemove(profileDir);
  }
};

export const runUpgradeScenario = (): Promise<void> => reportScenario(NAME, runUpgrade);
