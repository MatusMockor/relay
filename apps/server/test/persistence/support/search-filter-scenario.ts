import type {
  AttachmentMeta,
  Message,
  ThreadId,
  ThreadState,
  ThreadSummary,
} from '@relay/shared/domain';
import type { ServerRepositories } from '../../../src/core/ports/server-unit-of-work';
import { at, buildMessage, newId, seedThread, type SeededAccount } from './fixtures';

const attachment = (inline: boolean): AttachmentMeta => ({
  id: newId('attachment'),
  filename: inline ? 'logo.png' : 'faktura.pdf',
  contentType: inline ? 'image/png' : 'application/pdf',
  size: 2048,
  contentId: inline ? '<logo@klient.sk>' : null,
  inline,
});

const JANA = { name: 'Jana Nováková', email: 'jana@klient.sk' };
const CONTRACTOR = { name: 'Marek Horváth', email: 'marek@stavby.sk' };

interface ScenarioThread {
  readonly key: string;
  readonly state: ThreadState;
  readonly unread: boolean;
  readonly minute: number;
  readonly message: Partial<Message>;
}

const SCENARIO: readonly ScenarioThread[] = [
  {
    key: 't-invoice',
    state: 'inbox',
    unread: true,
    minute: 1,
    message: {
      subject: 'Faktúra za október',
      from: JANA,
      snippet: 'Dobrý deň',
      textBody: 'Posielam doklad na úhradu.',
      attachments: [attachment(false)],
    },
  },
  {
    key: 't-meeting',
    state: 'inbox',
    unread: false,
    minute: 2,
    message: {
      subject: 'Stretnutie v piatok',
      from: { name: 'Peter Šťastný', email: 'peter@partner.sk' },
      snippet: 'Jana pošle faktúru',
      textBody: 'Jana pošle faktúru zajtra.',
      attachments: [attachment(true)],
    },
  },
  {
    key: 't-archived',
    state: 'done',
    unread: false,
    minute: 3,
    message: { subject: 'Faktúra archív', from: JANA, snippet: 'Archív', textBody: 'Uhradené.' },
  },
  {
    key: 't-trash',
    state: 'trash',
    unread: true,
    minute: 4,
    message: {
      subject: 'Faktúra zmazaná',
      from: JANA,
      snippet: 'Zmazané',
      textBody: 'Zmazaný doklad.',
      attachments: [attachment(false)],
    },
  },
  {
    key: 't-spam',
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
  {
    key: 't-contract',
    state: 'inbox',
    unread: false,
    minute: 6,
    message: {
      subject: 'Zmluva o dielo',
      from: CONTRACTOR,
      to: [{ name: 'Zuzana Bieliková', email: 'zuzana@firma.sk' }],
      snippet: 'Návrh zmluvy',
      textBody: 'Návrh zmluvy v texte.',
    },
  },
];

const addScan = async (
  repositories: ServerRepositories,
  seeded: SeededAccount,
  contract: ThreadSummary,
): Promise<void> => {
  await repositories.messages.upsert(
    buildMessage(contract, seeded.mailboxes.inbox, {
      subject: 'Sken',
      from: CONTRACTOR,
      snippet: 'Podpísaný sken',
      textBody: 'Podpísaný sken v prílohe.',
      attachments: [attachment(false)],
    }),
    new Map(),
  );
};

export const seedSearchFilterScenario = async (
  repositories: ServerRepositories,
  seeded: SeededAccount,
): Promise<ReadonlyMap<ThreadId, string>> => {
  const keys = new Map<ThreadId, string>();
  for (const item of SCENARIO) {
    const { thread } = await seedThread(
      repositories,
      seeded,
      { state: item.state, unread: item.unread, lastMessageAt: at(item.minute) },
      { date: at(item.minute), to: [{ name: null, email: 'jan@firma.sk' }], ...item.message },
    );
    keys.set(thread.id, item.key);
    if (item.key === 't-contract') {
      await addScan(repositories, seeded, thread);
    }
  }
  return keys;
};
