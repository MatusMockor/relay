import { isBodyLocal, type Message, type MessageBodyResult, type MessageId } from '@relay/shared';
import { queryOptions, useQuery } from '@tanstack/react-query';
import type { MailClient } from '../MailClient';
import { queryKeys } from './query-keys';
import { useClient } from './services-context';

const BODY_GC_MS = 5 * 60_000;

export const messageBodyQuery = (client: MailClient, messageId: MessageId) =>
  queryOptions<MessageBodyResult>({
    queryKey: queryKeys.messageBody(messageId),
    queryFn: () => client.getMessageBody(messageId),
    staleTime: (query) => (query.state.data?.status === 'offline' ? 0 : Infinity),
    gcTime: BODY_GC_MS,
    retry: false,
    networkMode: 'always',
    refetchOnReconnect: true,
  });

export const useMessageBody = (message: Message) => {
  const client = useClient();
  return useQuery({ ...messageBodyQuery(client, message.id), enabled: !isBodyLocal(message) });
};
