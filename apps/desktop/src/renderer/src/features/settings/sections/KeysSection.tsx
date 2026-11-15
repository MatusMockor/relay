import { Button, Kbd } from '@relay/ui';
import { MOD } from '../../../lib/platform-keys';
import { setUi } from '../../../state/ui-store';
import { SettingRow } from '../SettingRow';

const ROWS: readonly (readonly [string, readonly string[]])[] = [
  ['Príkazy a hľadanie konverzácií', [`${MOD}K`]],
  ['Napísať novú správu', ['C']],
  ['Spýtať sa AI v pravom paneli', ['A']],
  ['Hotovo / Pripomenúť / Odpovedať', ['E', 'H', 'R']],
  ['Prepnúť účet', [`${MOD}1`, '…', `${MOD}9`]],
  ['Prejsť na Doručenú poštu', ['G', 'I']],
  ['Prejsť na Hotovo', ['G', 'E']],
  ['Skryť priečinky / pravý panel', ['[', 'I']],
];

export function KeysSection() {
  return (
    <>
      <h2>Klávesové skratky</h2>
      <p className="lead">
        Celá pošta sa dá ovládať z klávesnice. Prehľad otvoríš kedykoľvek cez ?
      </p>
      <SettingRow
        title="Prehľad všetkých skratiek"
        description="Zoznam, vlákno, písanie, priečinky a panely"
      >
        <Button
          onClick={() => {
            setUi({ overlay: { kind: 'shortcuts' } });
          }}
        >
          Otvoriť <Kbd keys={['?']} />
        </Button>
      </SettingRow>
      {ROWS.map(([label, keys]) => (
        <SettingRow key={label} title={label}>
          <span className="kk">
            <Kbd keys={keys} />
          </span>
        </SettingRow>
      ))}
    </>
  );
}
