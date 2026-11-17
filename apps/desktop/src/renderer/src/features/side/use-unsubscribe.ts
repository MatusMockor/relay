import { NO_UNSUBSCRIBE, type ThreadId } from '@relay/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { describeError } from '../../data/errors';
import { queryKeys } from '../../data/hooks/query-keys';
import { useAppContext, useClient } from '../../data/hooks/services-context';
import { showToast } from '../../state/toast-store';
import { setUi } from '../../state/ui-store';
import { planUnsubscribe, type UnsubscribePlan } from './unsubscribe-plan';

export type ConfirmablePlan = Extract<UnsubscribePlan, { kind: 'oneClick' | 'link' }>;

export const useUnsubscribe = (threadId: ThreadId, sender: string) => {
  const client = useClient();
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
  const sendOneClick = async () => {
    setBusy(true);
    try {
      await client.unsubscribe(threadId);
      showToast(`Odhlásené z odberu od ${sender}`);
    } catch (error) {
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
      void sendOneClick();
    }
  };
  const cancel = () => {
    setPending(null);
  };
  return { plan, pending, busy, start, confirm, cancel };
};
