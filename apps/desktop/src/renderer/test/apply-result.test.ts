import { describe, expect, it } from 'vitest';
import { applyResultMessage } from '../src/features/settings/automations/apply-result';

describe('applyResultMessage', () => {
  it.each([
    [
      { matched: 0, applied: 0, failed: 0 },
      'V doručenej pošte nie je žiadny mail, ktorý spĺňa podmienky',
    ],
    [{ matched: 3, applied: 3, failed: 0 }, 'Pravidlo sa použilo na 3 konverzácie'],
    [
      { matched: 2, applied: 0, failed: 0 },
      'Pravidlo už bolo použité na všetky zodpovedajúce konverzácie',
    ],
    [
      { matched: 6, applied: 5, failed: 1 },
      'Pravidlo sa použilo na 5 konverzácií. Nepodarilo sa spracovať: 1, skús to znova neskôr',
    ],
  ])('describes %o', (result, message) => {
    expect(applyResultMessage(result)).toBe(message);
  });
});
