import { calendarTexts } from '../parser/calendar-part-rules';
import { calendarSections } from './calendar-sections';
import type { ImapConnection } from './imap-connection';
import { decodeSection } from './section-decoding';

export const fetchCalendarParts = (
  connection: ImapConnection,
  path: string,
  uid: number,
): Promise<string[] | null> =>
  connection.withMailbox(
    path,
    { operation: 'fetch calendar parts', retryOnDisconnect: true },
    async (client, mailbox) => {
      if (mailbox.exists === 0) {
        return null;
      }
      const range = String(uid);
      const structure = await client.fetchOne(range, { bodyStructure: true }, { uid: true });
      if (structure === false || structure.uid !== uid || structure.bodyStructure === undefined) {
        return null;
      }
      const sections = calendarSections(structure.bodyStructure);
      if (sections.length === 0) {
        return [];
      }
      const bodyParts = sections.map((section) => section.part);
      const fetched = await client.fetchOne(range, { bodyParts }, { uid: true });
      if (fetched === false) {
        return null;
      }
      const texts = sections.map((section) => {
        const raw = fetched.bodyParts?.get(section.part.toLowerCase());
        return raw === undefined ? null : decodeSection(raw, section);
      });
      return calendarTexts(texts.filter((text) => text !== null));
    },
  );
