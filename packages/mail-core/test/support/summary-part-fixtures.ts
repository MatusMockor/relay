import {
  binaryPart,
  fixture,
  htmlPart,
  message,
  multipart,
  nested,
  textPart,
  utf8,
  type SummaryFixture,
} from './summary-mime';

const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(30_000, 0x41)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(2_000, 0x01)]);
const ICS = [
  'BEGIN:VCALENDAR',
  'METHOD:REQUEST',
  'BEGIN:VEVENT',
  'UID:evt-1@partner.test',
  'DTSTART:20261120T090000Z',
  'SUMMARY:Plánovanie',
  'END:VEVENT',
  'END:VCALENDAR',
  '',
].join('\r\n');

const inner = [
  'From: Eva <eva@partner.test>',
  'Subject: Povodna sprava',
  'Message-ID: <inner-1@partner.test>',
  'MIME-Version: 1.0',
  'Content-Type: multipart/mixed; boundary="inner"',
  '',
  ...multipart('inner', [
    textPart('Vnorený text správy.'),
    binaryPart(['Content-Type: application/pdf; name="vnorene.pdf"'], PDF.subarray(0, 600)),
  ]),
].join('\r\n');

export const partFixtures = (): SummaryFixture[] => [
  fixture(
    'pdf-attachment',
    message(
      { id: 'pdf', subject: 'Faktúra', contentType: 'multipart/mixed; boundary="mix"' },
      multipart('mix', [
        textPart('Faktúra je v prílohe.'),
        binaryPart(
          [
            'Content-Type: application/pdf; name="=?UTF-8?B?RmFrdMO6cmEgxI0uIDUucGRm?="',
            'Content-Disposition: attachment; filename="=?UTF-8?B?RmFrdMO6cmEgxI0uIDUucGRm?="',
          ],
          PDF,
        ),
        binaryPart(
          [
            'Content-Type: application/octet-stream',
            "Content-Disposition: attachment; filename*=utf-8''tabu%C4%BEka.xlsx",
          ],
          PDF.subarray(0, 900),
        ),
        {
          headers: [
            'Content-Type: text/plain; charset=utf-8; name="poznamky.txt"',
            'Content-Disposition: attachment; filename="poznamky.txt"',
          ],
          body: 'Poznamky',
        },
      ]),
    ),
  ),
  fixture(
    'inline-cid-image',
    message(
      { id: 'cid', subject: 'Obrázok', contentType: 'multipart/related; boundary="rel"' },
      multipart('rel', [
        htmlPart('<p>Logo: <img src="cid:logo@relay"></p>'),
        binaryPart(
          [
            'Content-Type: image/png; name="logo.png"',
            'Content-ID: <logo@relay>',
            'Content-Disposition: inline; filename="logo.png"',
          ],
          PNG,
        ),
        binaryPart(['Content-Type: image/png', 'Content-ID: <banner@relay>'], PNG.subarray(0, 500)),
      ]),
    ),
  ),
  fixture(
    'calendar',
    message(
      { id: 'ics', subject: 'Pozvánka', contentType: 'multipart/mixed; boundary="cal"' },
      multipart('cal', [
        nested('multipart/alternative', 'calalt', [
          textPart('Pozývam ťa na stretnutie.'),
          {
            headers: ['Content-Type: text/calendar; charset=utf-8; method=REQUEST'],
            body: utf8(ICS),
          },
        ]),
        binaryPart(
          [
            'Content-Type: application/ics; name="invite.ics"',
            'Content-Disposition: attachment; filename="invite.ics"',
          ],
          Buffer.from(ICS),
        ),
      ]),
    ),
  ),
  fixture(
    'nested-rfc822',
    message(
      { id: 'fwd', subject: 'Fwd', contentType: 'multipart/mixed; boundary="fwd"' },
      multipart('fwd', [
        textPart('Preposielam pôvodné správy.'),
        {
          headers: [
            'Content-Type: message/rfc822',
            'Content-Disposition: attachment; filename="povodna.eml"',
          ],
          body: inner,
        },
        { headers: ['Content-Type: message/rfc822', 'Content-Disposition: inline'], body: inner },
      ]),
    ),
    { snippetPrefix: true },
  ),
];
