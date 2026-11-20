import iconv from 'iconv-lite';
import { fixture, message, utf8, type SummaryFixture } from './summary-mime';

const WIN_1250_ALIAS = [
  'Ahoj, zmluva je v pr=EDlohe. =8Eaneta =EFakuje za r=FDchlu odpove=EF a pos=',
  'iela pozdrav.',
].join('\r\n');

const UTF_7 = iconv.encode('Dobrý deň, Žaneta ďakuje za rýchlu odpoveď. Šťastný Ľubo.', 'utf-7');

const FLOWED_DELSP = ['Spojené slo ', 'vo pokračuje v ďal', 'šom riadku.', '', '> citát', ''];

const FLOWED = ['Prvý riadok ', 'pokračuje bez ', 'zalomenia.', '-- ', 'Podpis', ''];

export const charsetFixtures = (): SummaryFixture[] => [
  fixture(
    'qp-win-1250-alias',
    message(
      {
        id: 'win1250',
        subject: 'Win1250',
        contentType: 'text/plain; charset=win-1250',
        encoding: 'quoted-printable',
      },
      [WIN_1250_ALIAS, ''],
    ),
  ),
  fixture(
    'utf-7',
    message(
      { id: 'utf7', subject: 'UTF7', contentType: 'text/plain; charset=UTF-7', encoding: '7bit' },
      [UTF_7.toString('latin1'), ''],
    ),
  ),
  fixture(
    'flowed-delsp',
    message(
      {
        id: 'delsp',
        subject: 'Delsp',
        contentType: 'text/plain; charset=utf-8; format=flowed; delsp=yes',
        encoding: '8bit',
      },
      FLOWED_DELSP.map(utf8),
    ),
  ),
  fixture(
    'flowed-base64',
    message(
      {
        id: 'flowed',
        subject: 'Flowed',
        contentType: 'text/plain; charset=utf-8; format="Flowed"',
        encoding: 'base64',
      },
      [Buffer.from(FLOWED.join('\r\n'), 'utf8').toString('base64'), ''],
    ),
  ),
];
