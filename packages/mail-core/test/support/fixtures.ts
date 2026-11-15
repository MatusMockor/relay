import type { ParsedMessage } from '@relay/engine';
import { readFile } from 'node:fs/promises';
import { MailparserMessageParser } from '../../src';
import { FixedClock } from './infrastructure';
import { fixturePath } from './raw-mail';

export const FIXTURE_NOW = new Date('2026-11-15T10:00:00.000Z');

const parser = new MailparserMessageParser(new FixedClock(FIXTURE_NOW));

export const parseFixture = async (name: string): Promise<ParsedMessage> =>
  parser.parse(new Uint8Array(await readFile(fixturePath(name))));
