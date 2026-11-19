import type { Task, ThreadId } from '@relay/shared';
import type { MailClient } from '../../data/MailClient';

export const listOpenThreadTasks = async (
  client: Pick<MailClient, 'listTasks'>,
  threadId: ThreadId,
  cursor?: string,
): Promise<Task[]> => {
  const page = await client.listTasks({ threadId, ...(cursor === undefined ? {} : { cursor }) });
  const open = page.items.filter((task) => task.state !== 'done');
  if (page.nextCursor === null) {
    return open;
  }
  return [...open, ...(await listOpenThreadTasks(client, threadId, page.nextCursor))];
};
