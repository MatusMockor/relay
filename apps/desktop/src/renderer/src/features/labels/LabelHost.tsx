import type { Label, ThreadSummary } from '@relay/shared';
import { describeError } from '../../data/errors';
import { useCreateLabel } from '../../data/hooks/use-label-mutations';
import { useLabels } from '../../data/hooks/use-mail-queries';
import { showToast } from '../../state/toast-store';
import { setUi, useUiStore } from '../../state/ui-store';
import { useCachedThread } from '../mail/use-cached-thread';
import { LabelPicker } from './LabelPicker';
import { useLabelColor } from './use-label-color';
import { useLabelToggle } from './use-label-toggle';

function ThreadLabelPicker({ thread }: { readonly thread: ThreadSummary }) {
  const labels = useLabels();
  const colorOf = useLabelColor();
  const toggle = useLabelToggle();
  const create = useCreateLabel();
  const own = (labels.data ?? []).filter((label) => label.accountId === thread.accountId);
  const onCreate = (name: string): Promise<boolean> =>
    create
      .mutateAsync({ accountId: thread.accountId, name })
      .then((label: Label) => {
        toggle(thread, label.id, true);
        return true;
      })
      .catch((error: unknown) => {
        showToast(describeError(error));
        return false;
      });
  return (
    <LabelPicker
      labels={own}
      checked={new Set(thread.labelIds)}
      loading={labels.isPending}
      colorOf={colorOf}
      onToggle={(label, on) => {
        toggle(thread, label.id, on);
      }}
      onCreate={onCreate}
      onClose={() => {
        setUi({ overlay: null });
      }}
    />
  );
}

export function LabelHost() {
  const overlay = useUiStore((state) => state.overlay);
  const thread = useCachedThread(overlay?.kind === 'labels' ? overlay.threadId : null);
  if (thread === null) {
    return null;
  }
  return <ThreadLabelPicker key={thread.id} thread={thread} />;
}
