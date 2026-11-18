import type { ApplyAutomationResponse } from '@relay/shared';
import { plural } from '../../../lib/text';

const threads = (count: number): string =>
  `${String(count)} ${plural(count, 'konverzáciu', 'konverzácie', 'konverzácií')}`;

export const applyResultMessage = ({
  matched,
  applied,
  failed,
}: ApplyAutomationResponse): string => {
  if (matched === 0) {
    return 'V doručenej pošte nie je žiadny mail, ktorý spĺňa podmienky';
  }
  if (failed > 0) {
    return `Pravidlo sa použilo na ${threads(applied)}. Nepodarilo sa spracovať: ${String(failed)}, skús to znova neskôr`;
  }
  if (applied === 0) {
    return 'Pravidlo už bolo použité na všetky zodpovedajúce konverzácie';
  }
  return `Pravidlo sa použilo na ${threads(applied)}`;
};
