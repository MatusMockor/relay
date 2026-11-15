import { testInfra, type GreenMailUser } from '@relay/config/test-infra';
import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';

const { greenmail } = testInfra;

export const createGreenMailUser = async (): Promise<GreenMailUser> => {
  const id = randomUUID().slice(0, 12);
  const user = { email: `mc-${id}@relay.test`, login: `mc-${id}@relay.test`, password: `pw-${id}` };
  const response = await fetch(`${greenmail.apiUrl}/api/user`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(user),
  });
  expect(response.ok).toBe(true);
  return user;
};

export const deleteGreenMailUser = async (user: GreenMailUser): Promise<void> => {
  await fetch(`${greenmail.apiUrl}/api/user/${encodeURIComponent(user.email)}`, {
    method: 'DELETE',
  });
};

export const greenmailImap = { host: greenmail.host, port: greenmail.imapPort, secure: false };
export const greenmailSmtp = { host: greenmail.host, port: greenmail.smtpPort, secure: false };
