import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { testInfra } from '@relay/config/test-infra';
import { z } from 'zod';
import type { MailUser } from './mail-user';

const { greenmail } = testInfra;

const CreatedUserSchema = z.object({ email: z.string(), login: z.string() });

const slugOf = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);

export const mailUserOf = (email: string, password: string): MailUser => ({
  email,
  password,
  host: greenmail.host,
  imapPort: greenmail.imapPort,
  smtpPort: greenmail.smtpPort,
});

export const createMailUser = async (label: string): Promise<MailUser> => {
  const email = `qa-${slugOf(label)}-${randomBytes(4).toString('hex')}@relay.test`;
  const password = `qa-${randomBytes(8).toString('hex')}`;
  const response = await fetch(`${greenmail.apiUrl}/api/user`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, login: email, password }),
  });
  assert.ok(response.ok, `GreenMail refused to create ${email}: HTTP ${String(response.status)}`);
  CreatedUserSchema.parse(await response.json());
  return mailUserOf(email, password);
};

export const deleteMailUser = async (email: string): Promise<void> => {
  const response = await fetch(`${greenmail.apiUrl}/api/user/${encodeURIComponent(email)}`, {
    method: 'DELETE',
  });
  assert.ok(
    response.ok || response.status === 404,
    `GreenMail refused to delete ${email}: HTTP ${String(response.status)}`,
  );
};
