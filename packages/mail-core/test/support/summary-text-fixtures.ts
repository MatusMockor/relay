import {
  base64Lines,
  fixture,
  htmlPart,
  message,
  multipart,
  textPart,
  utf8,
  type SummaryFixture,
} from './summary-mime';

const SLOVAK = 'Dobrý deň, posielam podklady k projektu. Ďakujem za rýchlu odpoveď. Šťastný Ľubo. ';
const ISO_8859_2 =
  'RG9icv0gZGXyLCBwb3NpZWxhbSBmYWt0+nJ1IHphIG9rdPNiZXIuIM9ha3VqZW0gYSBwZWtu/SB2ZehlciwgpXVib23tciCpu2FzdG79';
const WINDOWS_1250 = [
  'Ahoj, v pr=EDlohe je zmluva. Pros=EDm o podpis do piatku. =CFakujem, =8Eane=',
  'ta =C8=ED=9Eov=E1',
].join('\r\n');

export const textFixtures = (): SummaryFixture[] => [
  fixture(
    'plain',
    message(
      {
        id: 'plain',
        subject: 'Plán projektu',
        contentType: 'text/plain; charset=utf-8',
        encoding: '8bit',
      },
      [utf8(`${SLOVAK}\r\n\r\n> citovaný text\r\n`)],
    ),
    { flags: ['\\Seen', '\\Flagged', 'Projekt'] },
  ),
  fixture(
    'alternative',
    message(
      { id: 'alt', subject: 'Alternative', contentType: 'multipart/alternative; boundary="alt"' },
      multipart('alt', [
        textPart('Textová verzia správy pre klientov bez HTML.'),
        htmlPart('<html><body><p>HTML <b>verzia</b> správy.</p></body></html>'),
      ]),
    ),
  ),
  fixture(
    'html-only',
    message(
      { id: 'html', subject: 'HTML', contentType: 'text/html; charset=utf-8', encoding: '8bit' },
      [
        utf8(
          '<html><head><style>p{color:red}</style></head><body><p>Iba HTML obsah, žiadny text.</p></body></html>',
        ),
      ],
    ),
  ),
  fixture(
    'base64-iso-8859-2',
    message(
      {
        id: 'iso',
        subject: 'ISO',
        contentType: 'text/plain; charset=ISO-8859-2',
        encoding: 'base64',
      },
      [ISO_8859_2, ''],
    ),
  ),
  fixture(
    'qp-windows-1250',
    message(
      {
        id: 'cp1250',
        subject: 'CP1250',
        contentType: 'text/plain; charset=windows-1250',
        encoding: 'quoted-printable',
      },
      [WINDOWS_1250, ''],
    ),
  ),
  fixture(
    'large-body',
    message(
      {
        id: 'large',
        subject: 'Large',
        contentType: 'text/plain; charset=utf-8',
        encoding: 'base64',
      },
      [
        base64Lines(Buffer.from(SLOVAK.repeat(Math.ceil((600 * 1024) / SLOVAK.length)), 'utf8')),
        '',
      ],
    ),
    { snippetPrefix: true },
  ),
  fixture(
    'no-body',
    message({ id: 'empty', subject: 'Prázdna', contentType: 'text/plain; charset=utf-8' }, ['']),
  ),
];
