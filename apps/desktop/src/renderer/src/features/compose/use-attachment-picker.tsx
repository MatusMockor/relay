import { useRef } from 'react';
import { describeError } from '../../data/errors';
import { useAppContext } from '../../data/hooks/services-context';
import { showToast } from '../../state/toast-store';
import { filesOf, inputsFromFiles, inputsFromPicked } from './attachments/attachment-inputs';
import { rejectedMessage, remainingBudget } from './attachments/attachment-limits';
import { usage } from './attachments/compose-attachment';
import { pickNativeAttachments } from './attachments/pick-attachments';
import type { ComposeAttachments } from './attachments/use-compose-attachments';

export const useAttachmentPicker = (attachments: ComposeAttachments) => {
  const { platform } = useAppContext();
  const input = useRef<HTMLInputElement>(null);
  const pick = () => {
    const budget = remainingBudget(usage(attachments.items).bytes);
    const native = pickNativeAttachments(platform.bridge, budget);
    if (native === null) {
      input.current?.click();
      return;
    }
    native.then(
      (picked) => {
        attachments.add(inputsFromPicked(picked), picked.rejected.map(rejectedMessage));
      },
      (error: unknown) => {
        showToast(`Súbory sa nepodarilo vybrať: ${describeError(error)}`);
      },
    );
  };
  const fallback = (
    <input
      ref={input}
      type="file"
      multiple
      hidden
      aria-hidden="true"
      tabIndex={-1}
      onChange={(event) => {
        attachments.add(inputsFromFiles(filesOf(event.target.files)));
        event.target.value = '';
      }}
    />
  );
  return { pick, fallback };
};
