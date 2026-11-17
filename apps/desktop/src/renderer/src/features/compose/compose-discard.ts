import type { AccountId } from '@relay/shared';
import { showToast } from '../../state/toast-store';
import { type ComposeInit, setUi } from '../../state/ui-store';
import { validAddresses } from './recipients/address-parsing';
import type { ComposeRecipients } from './recipients/compose-recipients';
import type { ComposeDraft } from './use-compose-draft';

export interface ComposeSnapshot {
  readonly accountId: AccountId | undefined;
  readonly recipients: ComposeRecipients;
  readonly subject: string;
  readonly body: string;
  readonly hasAttachments: boolean;
}

export interface ComposeDiscard {
  readonly init: ComposeInit;
  readonly draft: ComposeDraft;
  readonly snapshot: ComposeSnapshot;
  readonly close: () => void;
}

const blank = ({ recipients, subject, body, hasAttachments }: ComposeSnapshot): boolean =>
  !hasAttachments &&
  body.trim() === '' &&
  subject.trim() === '' &&
  recipients.to.length + recipients.cc.length + recipients.bcc.length === 0;

const restoredInit = (init: ComposeInit, snapshot: ComposeSnapshot): ComposeInit => ({
  ...init,
  ...(snapshot.accountId === undefined ? {} : { accountId: snapshot.accountId }),
  to: validAddresses(snapshot.recipients.to),
  cc: validAddresses(snapshot.recipients.cc),
  bcc: validAddresses(snapshot.recipients.bcc),
  subject: snapshot.subject,
  body: snapshot.body,
});

export const discardCompose = ({ init, draft, snapshot, close }: ComposeDiscard): void => {
  draft.cancelScheduled();
  const fresh = init.draftId === undefined;
  if (fresh) {
    void draft.discard().catch(() => undefined);
  }
  close();
  if (blank(snapshot)) {
    return;
  }
  showToast(fresh ? 'Správa zahodená' : 'Zatvorené bez uloženia zmien', {
    undo: () => {
      setUi({ overlay: { kind: 'compose', init: restoredInit(init, snapshot) } });
    },
  });
};
