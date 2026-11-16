import { describe, expect, it } from 'vitest';
import { collectKnownContacts } from '../src/features/compose/known-contacts';
import { serverThread } from './support/thread-fixtures';

const page = (participants: { name: string | null; email: string }[][]) => ({
  items: participants.map((list, index) =>
    serverThread(`Vlákno ${String(index)}`, { participants: list }),
  ),
  nextCursor: null,
});

describe('known contacts', () => {
  it('keeps the named address when another thread lists the same person without a name', () => {
    const contacts = collectKnownContacts(
      [
        page([
          [{ name: 'Organizátor Tím', email: 'organizer@relay.test' }],
          [
            { name: 'Peter Novák', email: 'peter@relay.test' },
            { name: null, email: 'Organizer@Relay.test' },
            { name: null, email: 'JANA@relay.test' },
          ],
        ]),
      ],
      ['jana@relay.test'],
    );

    expect(contacts).toEqual([
      { name: 'Organizátor Tím', email: 'organizer@relay.test' },
      { name: 'Peter Novák', email: 'peter@relay.test' },
    ]);
  });

  it('names a contact first seen without a name once a named occurrence appears', () => {
    const contacts = collectKnownContacts(
      [
        page([
          [{ name: null, email: 'eva@firma.sk' }],
          [{ name: 'Eva Malá', email: 'eva@firma.sk' }],
        ]),
      ],
      [],
    );

    expect(contacts).toEqual([{ name: 'Eva Malá', email: 'eva@firma.sk' }]);
  });
});
