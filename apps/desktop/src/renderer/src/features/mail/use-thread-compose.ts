import { composeOverlay } from '../../state/compose-overlay';
import type { MessageId, ThreadDetail, ThreadId } from '@relay/shared';
import { useQueryClient } from '@tanstack/react-query';
import { describeError } from '../../data/errors';
import { queryKeys } from '../../data/hooks/query-keys';
import { useClient } from '../../data/hooks/services-context';
import { messageBodyQuery } from '../../data/hooks/use-message-body';
import { showToast } from '../../state/toast-store';
import { type ComposeInit, setUi } from '../../state/ui-store';
import { withForwardBody } from './forward-body';
import { forwardInit } from './forward-draft';
import { replyAllInit } from './reply-all-draft';
import { useAccountsModel } from './use-accounts-model';

export const useThreadCompose = () => {
  const client = useClient();
  const queryClient = useQueryClient();
  const model = useAccountsModel();
  const loadBody = (messageId: MessageId) =>
    queryClient.fetchQuery(messageBodyQuery(client, messageId));
  const open = (
    threadId: ThreadId,
    build: (detail: ThreadDetail) => ComposeInit | null | Promise<ComposeInit | null>,
  ) => {
    queryClient
      .fetchQuery({
        queryKey: queryKeys.thread(threadId),
        queryFn: () => client.getThread(threadId),
        staleTime: 30_000,
      })
      .then(build)
      .then((init) => {
        if (init !== null) {
          setUi({ reply: null, overlay: composeOverlay(init) });
        }
      })
      .catch((error: unknown) => {
        showToast(`Konverzáciu sa nepodarilo načítať: ${describeError(error)}`);
      });
  };
  return {
    replyAll: (threadId: ThreadId) => {
      open(threadId, (detail) => replyAllInit(detail, model.accounts));
    },
    forward: (threadId: ThreadId, messageId?: MessageId) => {
      open(threadId, async (detail) =>
        forwardInit(await withForwardBody(detail, messageId, loadBody), messageId),
      );
    },
  };
};

export type ThreadComposeCommands = ReturnType<typeof useThreadCompose>;
