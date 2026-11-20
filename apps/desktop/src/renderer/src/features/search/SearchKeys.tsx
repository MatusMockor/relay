import { Kbd } from '@relay/ui';
import { MOD } from '../../lib/platform-keys';

const MOD_KEY = MOD.replace('+', '');

export function SearchKeys() {
  return (
    <div className="pal-foot">
      <span>
        <Kbd keys={['↑', '↓']} /> vybrať
      </span>
      <span>
        <Kbd keys={['↵']} /> otvoriť
      </span>
      <span>
        <Kbd keys={[MOD_KEY, '↵']} /> všetky výsledky v zozname
      </span>
    </div>
  );
}
