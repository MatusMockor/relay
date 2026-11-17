import type { ThreadId } from '@relay/shared';
import { Button, ConfirmDialog, Icon } from '@relay/ui';
import { NO_UNSUBSCRIBE_HINT } from './unsubscribe-plan';
import { type ConfirmablePlan, useUnsubscribe } from './use-unsubscribe';

const dialogCopy = (plan: ConfirmablePlan, sender: string) =>
  plan.kind === 'oneClick'
    ? {
        title: `Odhlásiť sa z odberu od ${sender}?`,
        text: 'Relay pošle odosielateľovi štandardnú požiadavku na odhlásenie. Nič iné sa neodošle.',
        confirmLabel: 'Odhlásiť sa',
      }
    : {
        title: `Otvoriť odhlasovaciu stránku od ${sender}?`,
        text: `Stránka sa otvorí v prehliadači: ${new URL(plan.url).hostname}`,
        confirmLabel: 'Otvoriť',
      };

export function UnsubscribeButton({
  threadId,
  sender,
}: {
  readonly threadId: ThreadId;
  readonly sender: string;
}) {
  const unsubscribe = useUnsubscribe(threadId, sender);
  const { plan, pending } = unsubscribe;
  const unavailable = plan.kind === 'none';
  const hint = unavailable ? NO_UNSUBSCRIBE_HINT : undefined;
  return (
    <>
      <span className="a-hint" title={hint}>
        <Button
          title={hint}
          disabled={unavailable || plan.kind === 'loading' || unsubscribe.busy}
          onClick={unsubscribe.start}
        >
          <Icon name="x" />
          Odhlásiť sa
        </Button>
      </span>
      {pending === null ? null : (
        <ConfirmDialog
          {...dialogCopy(pending, sender)}
          onConfirm={unsubscribe.confirm}
          onCancel={unsubscribe.cancel}
        />
      )}
    </>
  );
}
