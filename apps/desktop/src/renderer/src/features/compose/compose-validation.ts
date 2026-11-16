import type { ComposeAttachment } from './attachments/compose-attachment';
import {
  type ComposeRecipients,
  hasRecipient,
  invalidEntry,
} from './recipients/compose-recipients';

export interface ComposeCheck {
  readonly recipients: ComposeRecipients;
  readonly body: string;
  readonly attachments: readonly ComposeAttachment[];
  readonly removing: boolean;
}

export const composeProblem = ({
  recipients,
  body,
  attachments,
  removing,
}: ComposeCheck): string | null => {
  const invalid = invalidEntry(recipients);
  if (invalid !== undefined) {
    return `Oprav neplatnú adresu ${invalid.address.email}`;
  }
  if (!hasRecipient(recipients)) {
    return 'Doplň, komu správu posielaš';
  }
  if (body.trim() === '') {
    return 'Správa je prázdna';
  }
  if (removing || attachments.some((item) => item.kind === 'uploading')) {
    return 'Počkaj, kým sa dokončia zmeny príloh';
  }
  if (attachments.some((item) => item.kind === 'failed')) {
    return 'Odstráň prílohy, ktoré sa nepodarilo nahrať';
  }
  return null;
};
