import type { PlacementIdentity } from '../../model/placement-ingest';
import type { RemoteMessageMeta } from '../../model/remote-mail';
import { labelsMessages } from '../shared/mail-copies';
import type { IngestTarget } from './ingest-target';

export const identityOf = (
  target: IngestTarget,
  remote: RemoteMessageMeta,
  messageIdHeader: string | null,
): PlacementIdentity => ({
  accountId: target.account.id,
  location: { mailboxId: target.mailbox.id, uid: remote.uid },
  role: target.mailbox.role,
  emailId: remote.emailId,
  labelBased: labelsMessages(target.account),
  messageIdHeader,
});
