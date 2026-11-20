import { Kbd, Sheet } from '@relay/ui';
import { ALT, MOD } from '../../lib/platform-keys';
import { setUi } from '../../state/ui-store';

export const SHORTCUT_GROUPS: readonly (readonly [
  string,
  readonly (readonly [string, readonly string[]])[],
])[] = [
  [
    'Zoznam',
    [
      ['Ďalšia / predchádzajúca', ['J', 'K']],
      ['Otvoriť konverzáciu', ['↵']],
      ['Ďalší split', ['Tab']],
      ['Predchádzajúci split', ['⇧', 'Tab']],
      ['Hľadať v pošte', [`${MOD}F`, '/']],
      ['Všetky výsledky v zozname', [`${MOD}↵`]],
    ],
  ],
  [
    'Akcie',
    [
      ['Hotovo', ['E']],
      ['Vrátiť z Hotovo, Spamu alebo Koša', ['E']],
      ['Pripomenúť', ['H']],
      ['Presunúť do priečinka alebo štítka', ['V']],
      ['Štítok', ['L']],
      ['Odpovedať', ['R']],
      ['Odpovedať všetkým', ['⇧', 'R']],
      ['Preposlať', ['F']],
      ['Do koša', ['#']],
      ['Nahlásiť spam / Nie je spam', ['!']],
      ['Vrátiť poslednú akciu', ['Z']],
    ],
  ],
  [
    'Vlákno',
    [
      ['Späť do zoznamu', ['Esc']],
      ['Ďalšia / predchádzajúca', ['J', 'K']],
      ['Navrhnutá odpoveď', ['1', '2', '3']],
      ['Hotovo a ďalšia', ['E']],
    ],
  ],
  [
    'Písanie',
    [
      ['Nová správa', ['C']],
      ['Odoslať', [`${MOD}↵`]],
      ['Naplánovať odoslanie', [`${MOD}⇧↵`]],
      ['Napísať alebo upraviť s AI', [`${MOD}J`]],
      ['Kópia / Skrytá kópia', [`${MOD}⇧C`, `${MOD}⇧B`]],
      ['Priložiť súbory', [`${MOD}⇧A`]],
      ['Uložiť do Konceptov', ['Esc']],
    ],
  ],
  [
    'Účty',
    [
      ['Účty v poradí', [`${MOD}1`, '…', `${MOD}9`]],
      ['Všetky účty', [`${MOD}0`]],
      ['Prepínač účtov', ['klik vľavo hore']],
    ],
  ],
  [
    'Prejsť na',
    [
      ['Dôležité', ['G', 'I']],
      ['Úlohy', ['G', 'U']],
      ['Pripomenuté', ['G', 'H']],
      ['Hotovo', ['G', 'E']],
      ['Odoslané', ['G', 'T']],
      ['Koncepty', ['G', 'D']],
      ['Naplánované', ['G', 'N']],
      ['Spam', ['G', 'P']],
      ['Kôš', ['G', 'K']],
    ],
  ],
  [
    'Panely a AI',
    [
      ['Priečinky vľavo', ['[']],
      ['Pravý panel', ['I']],
      ['Šírka panela na úchyte', ['←', '→']],
      ['Pôvodná šírka', ['dvojklik']],
      ['Kontakt / AI / Kalendár', [`${ALT}1`, `${ALT}2`, `${ALT}3`]],
      ['Spýtať sa AI v paneli', ['A']],
    ],
  ],
  [
    'Všeobecné',
    [
      ['Príkazy', [`${MOD}K`]],
      ['Nastavenia', [`${MOD},`]],
      ['Späť', [`${MOD}[`]],
      ['Dopredu', [`${MOD}]`]],
      ['Klávesové skratky', ['?']],
    ],
  ],
];

export function ShortcutsSheet() {
  const close = () => {
    setUi({ overlay: null });
  };
  return (
    <Sheet
      label="Klávesové skratky"
      className="keys"
      onClose={close}
      onKey={(event) => {
        if (event.key !== '?') {
          return false;
        }
        event.preventDefault();
        close();
        return true;
      }}
    >
      <h2>
        Klávesové skratky <span>Kedykoľvek otvoríš cez ?</span>
      </h2>
      <div className="kgrid">
        {SHORTCUT_GROUPS.map(([title, rows]) => (
          <div className="kg" key={title}>
            <h4>{title}</h4>
            {rows.map(([label, keys]) => (
              <div className="kr" key={label}>
                <span>{label}</span>
                <span className="kk">
                  <Kbd keys={keys} />
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Sheet>
  );
}
