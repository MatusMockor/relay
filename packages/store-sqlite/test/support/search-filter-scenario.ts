import {
  type AttachmentMeta,
  AttachmentIdSchema,
  type Message,
  type ThreadState,
} from '@relay/shared/domain';
import { buildMessage, messageId, NO_HEADERS, threadId } from './fixtures';
import { addThread } from './folder-scenario';
import type { SeededAccount } from './seed';
import type { TestStore } from './test-database';

const attachment = (id: string, inline: boolean): AttachmentMeta => ({
  id: AttachmentIdSchema.parse(id),
  filename: inline ? 'logo.png' : 'faktura.pdf',
  contentType: inline ? 'image/png' : 'application/pdf',
  size: 2048,
  contentId: inline ? '<logo@klient.sk>' : null,
  inline,
});

interface ScenarioThread {
  readonly id: string;
  readonly state: ThreadState;
  readonly unread: boolean;
  readonly minute: number;
  readonly message: Partial<Message>;
}

const SCENARIO: readonly ScenarioThread[] = [
  {
    id: 't-invoice',
    state: 'inbox',
    unread: true,
    minute: 1,
    message: {
      subject: 'Faktúra za október',
      from: { name: 'Jana Nováková', email: 'jana@klient.sk' },
      snippet: 'Dobrý deň',
      textBody: 'Posielam doklad na úhradu.',
      attachments: [attachment('att-invoice', false)],
    },
  },
  {
    id: 't-meeting',
    state: 'inbox',
    unread: false,
    minute: 2,
    message: {
      subject: 'Stretnutie v piatok',
      from: { name: 'Peter Šťastný', email: 'peter@partner.sk' },
      snippet: 'Jana pošle faktúru',
      textBody: 'Jana pošle faktúru zajtra.',
      attachments: [attachment('att-logo', true)],
    },
  },
  {
    id: 't-archived',
    state: 'done',
    unread: false,
    minute: 3,
    message: {
      subject: 'Faktúra archív',
      from: { name: 'Jana Nováková', email: 'jana@klient.sk' },
      snippet: 'Archív',
      textBody: 'Uhradené.',
    },
  },
  {
    id: 't-trash',
    state: 'trash',
    unread: true,
    minute: 4,
    message: {
      subject: 'Faktúra zmazaná',
      from: { name: 'Jana Nováková', email: 'jana@klient.sk' },
      snippet: 'Zmazané',
      textBody: 'Zmazaný doklad.',
      attachments: [attachment('att-trash', false)],
    },
  },
  {
    id: 't-spam',
    state: 'spam',
    unread: true,
    minute: 5,
    message: {
      subject: 'Faktúra výhra',
      from: { name: 'Jana Podvodná', email: 'jana@spam.sk' },
      snippet: 'Výhra',
      textBody: 'Vyhrali ste.',
    },
  },
];

const CONTRACTOR = { name: 'Marek Horváth', email: 'marek@stavby.sk' };

const at = (minute: number): string => new Date(Date.UTC(2026, 10, 10, 10, minute)).toISOString();

export const seedSearchFilterScenario = async (
  store: TestStore,
  seeded: SeededAccount,
): Promise<void> => {
  for (const item of SCENARIO) {
    await addThread(
      store,
      seeded,
      item.id,
      { state: item.state, unread: item.unread, lastMessageAt: at(item.minute) },
      { date: at(item.minute), ...item.message },
    );
  }
  await addThread(
    store,
    seeded,
    't-contract',
    { unread: false, lastMessageAt: at(6) },
    {
      subject: 'Zmluva o dielo',
      from: CONTRACTOR,
      to: [{ name: 'Zuzana Bieliková', email: 'zuzana@firma.sk' }],
      date: at(6),
      snippet: 'Návrh zmluvy',
      textBody: 'Návrh zmluvy v texte.',
    },
  );
  await store.repositories.messages.upsert(
    buildMessage({
      id: messageId('t-contract-scan'),
      threadId: threadId('t-contract'),
      accountId: seeded.account.id,
      mailboxId: seeded.inbox.id,
      uid: 9_001,
      subject: 'Sken',
      from: CONTRACTOR,
      snippet: 'Podpísaný sken',
      textBody: 'Podpísaný sken v prílohe.',
      date: at(6),
      attachments: [attachment('att-scan', false)],
    }),
    NO_HEADERS,
  );
};
