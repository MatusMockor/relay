import type { SuggestionNote } from './suggestion-note';

export function SuggestionExplanation({ note }: { readonly note: SuggestionNote }) {
  return (
    <div className="au-ai-note" role="status">
      {note.understood === '' ? null : (
        <p>
          <b>Rozumiem:</b> {note.understood}
        </p>
      )}
      {note.unmapped.length === 0 ? null : (
        <p>
          <b>Nepodarilo sa priradiť:</b> {note.unmapped.join(', ')}
        </p>
      )}
      {note.actionless ? (
        <p>
          <b>Akcie z vety som nerozpoznal.</b> Vyber ich v časti Potom, inak sa pravidlo neuloží.
        </p>
      ) : null}
      <p className="au-ai-hint">Návrh zatiaľ nie je uložený. Skontroluj ho a ulož pravidlo.</p>
    </div>
  );
}
