import assert from 'node:assert/strict';
import { rowIsListed } from '../app/inbox';
import { eventually } from '../greenmail/eventually';
import { describePlacements, placementsOf } from '../gmail/gmail-placements';
import type { GmailScenarioContext } from './gmail-scenario';

export type FolderRule = (folders: readonly string[]) => boolean;

export const exactly =
  (...expected: string[]): FolderRule =>
  (folders) =>
    [...folders].sort().join('|') === [...expected].sort().join('|');

export const including =
  (wanted: readonly string[], excluded: readonly string[]): FolderRule =>
  (folders) =>
    wanted.every((path) => folders.includes(path)) &&
    !excluded.some((path) => folders.includes(path));

const foldersOf = (context: GmailScenarioContext, messageId: string): string[] =>
  placementsOf(context.gmail, messageId).map((placement) => placement.path);

export const expectServer = async (
  context: GmailScenarioContext,
  messageId: string,
  label: string,
  rule: FolderRule,
): Promise<void> => {
  await eventually(() => Promise.resolve(foldersOf(context, messageId)), rule, 15_000);
  const where = describePlacements(placementsOf(context.gmail, messageId));
  context.step(`server after ${label}: ${where}`);
  assert.ok(
    rule(foldersOf(context, messageId)),
    `Unexpected server placement after ${label}: ${where}`,
  );
};

export const expectListed = async (
  context: GmailScenarioContext,
  view: string,
  subject: string,
  listed: boolean,
): Promise<void> => {
  const actual = await rowIsListed(context.page, subject, listed ? 30_000 : 3_000);
  context.step(`${view} lists "${subject}": ${String(actual)}`);
  assert.equal(actual, listed, `${view} should ${listed ? '' : 'not '}list "${subject}"`);
};
