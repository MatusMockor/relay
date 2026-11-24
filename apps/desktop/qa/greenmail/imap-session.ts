import { ImapFlow } from 'imapflow';
import type { MailUser } from './mail-user';

export const withImap = async <Result>(
  user: MailUser,
  work: (client: ImapFlow) => Promise<Result>,
): Promise<Result> => {
  const client = new ImapFlow({
    host: user.host,
    port: user.imapPort,
    secure: false,
    auth: { user: user.email, pass: user.password },
    logger: false,
  });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.logout();
  }
};
