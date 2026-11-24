import type { UndoAutomationActivityResponse, UndoAutomationSinceResponse } from '@relay/shared';

export const undoEntryMessage = ({
  entry,
  alreadyUndone,
  results,
}: UndoAutomationActivityResponse): string => {
  if (alreadyUndone) {
    return 'Toto spustenie už bolo vrátené';
  }
  if (results.some((result) => result.outcome === 'failed')) {
    return 'Niektoré akcie sa nepodarilo vrátiť, skús to znova neskôr';
  }
  if (entry.undoneAt === null) {
    return 'Toto spustenie sa nedá vrátiť';
  }
  if (results.some((result) => result.outcome === 'skipped')) {
    return 'Vrátené. Niektoré akcie sa preskočili, lebo konverzácia sa medzitým zmenila';
  }
  return 'Vrátené';
};

export const undoSinceMessage = ({ entries, undone, failed }: UndoAutomationSinceResponse) => {
  if (entries === 0) {
    return 'Dnes nie je čo vrátiť';
  }
  if (failed > 0) {
    return `Vrátené spustenia: ${String(undone)}. Nepodarilo sa vrátiť: ${String(failed)}`;
  }
  return `Vrátené spustenia: ${String(undone)}`;
};

export const startOfToday = (now: Date): string => {
  const copy = new Date(now);
  copy.setHours(0, 0, 0, 0);
  return copy.toISOString();
};
