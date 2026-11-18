import type { ApplyAutomationResponse } from '@relay/shared';
import { plural } from '../../../lib/text';

export const applyResultMessage = ({ matched, applied }: ApplyAutomationResponse): string => {
  if (matched === 0) {
    return 'V doručenej pošte nie je žiadny mail, ktorý spĺňa podmienky';
  }
  if (applied === 0) {
    return 'Pravidlo už bolo použité na všetky zodpovedajúce konverzácie';
  }
  return `Pravidlo sa použilo na ${String(applied)} ${plural(applied, 'konverzáciu', 'konverzácie', 'konverzácií')}`;
};
