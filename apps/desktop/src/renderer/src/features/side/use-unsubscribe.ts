import { NO_UNSUBSCRIBE, type ThreadId, type UnsubscribeUrl } from '@relay/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { describeError, MailClientError } from '../../data/errors';
import { queryKeys } from '../../data/hooks/query-keys';
import { useAppContext, useClient } from '../../data/hooks/services-context';
import { showToast } from '../../state/toast-store';
import { setUi } from '../../state/ui-store';
import { planUnsubscribe, type UnsubscribePlan } from './unsubscribe-plan';

export type ConfirmablePlan = Extract<UnsubscribePlan, { kind: 'oneClick' | 'link' }>;

export const useUnsubscribe = (threadId: ThreadId, sender: string) => {
  const client = useClient();
  const queryClient = useQueryClient();
  const { platform } = useAppContext();
  const [pending, setPending] = useState<ConfirmablePlan | null>(null);
  const [busy, setBusy] = useState(false);
  const options = useQuery({
    queryKey: queryKeys.unsubscribe(threadId),
    queryFn: () => client.getUnsubscribeOptions(threadId),
  });
  const plan = planUnsubscribe(options.isError ? NO_UNSUBSCRIBE : options.data);
  const start = () => {
    if (plan.kind === 'oneClick' || plan.kind === 'link') {
      setPending(plan);
      return;
    }
    if (plan.kind !== 'mailto') {
      return;
    }
    setUi({
      overlay: {
        kind: 'compose',
        init: {
          toEmail: plan.mailto.to,
          subject: plan.mailto.subject ?? 'Odhlásiť',
          body: plan.mailto.body ?? '',
        },
      },
    });
  };
  const sendOneClick = async (url: UnsubscribeUrl) => {
    setBusy(true);
    try {
      await client.unsubscribe(threadId, url);
      showToast(`Odhlásené z odberu od ${sender}`);
    } catch (error) {
      if (error instanceof MailClientError && error.code === 'conflict') {
        showToast('Odkaz na odhlásenie sa medzitým zmenil. Skontroluj ho a skús znova.');
        void queryClient.invalidateQueries({ queryKey: queryKeys.unsubscribe(threadId) });
        return;
      }
      showToast(`Odhlásenie zlyhalo: ${describeError(error)}`);
    } finally {
      setBusy(false);
    }
  };
  const confirm = () => {
    const chosen = pending;
    setPending(null);
    if (chosen?.kind === 'link') {
      platform.openExternal(chosen.url);
      return;
    }
    if (chosen?.kind === 'oneClick') {
      void sendOneClick(chosen.url);
    }
  };
  const cancel = () => {
    setPending(null);
  };
  return { plan, pending, busy, start, confirm, cancel };
};
