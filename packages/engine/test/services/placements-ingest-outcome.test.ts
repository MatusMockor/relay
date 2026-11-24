import { type MailboxId, placementIn } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { withAdoptedPlacement } from '../../src/services/sync/adopted-placement';
import { present } from '../support/fixtures';
import { gmailInboxAndAllMail } from '../support/placements';
import { createTestEngine, USER_ID } from '../support/test-engine';

describe('adopting a pending placement', () => {
  it('replaces only the uid of the adopted placement and keeps the others', async () => {
    const engine = createTestEngine();
    const { account, message, inbox } = await gmailInboxAndAllMail(engine);
    const sent = present(await engine.repositories.mailboxes.findByPath(account.id, 'Sent'));
    const pending = {
      ...message,
      placements: [...message.placements, { mailboxId: sent.id, uid: 0 }],
    };

    const adopted = withAdoptedPlacement(pending, { mailboxId: sent.id, uid: 7 });

    expect(adopted.placements).toEqual([...message.placements, { mailboxId: sent.id, uid: 7 }]);
    expect({ mailboxId: adopted.mailboxId, uid: adopted.uid }).toEqual(
      present(placementIn(message, inbox.id)),
    );
  });

  it('adopts the only pending placement of a message and keeps a null location unchanged', async () => {
    const engine = createTestEngine();
    const { message } = await gmailInboxAndAllMail(engine);
    const stored = present(await engine.repositories.messages.findById(USER_ID, message.id));
    const sent = 'mbx_sent' as MailboxId;
    const location = { mailboxId: sent, uid: 9 };
    const single = {
      ...stored,
      mailboxId: sent,
      uid: 0,
      placements: [{ mailboxId: sent, uid: 0 }],
    };

    expect(withAdoptedPlacement(single, location)).toEqual({
      ...single,
      ...location,
      placements: [location],
    });
    expect(withAdoptedPlacement(stored, null)).toBe(stored);
  });
});
