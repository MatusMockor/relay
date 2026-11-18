import { useSessionStore } from '../../session/session-store';

const NOTES = {
  demo: 'Ukážkové dáta, zmeny sa neukladajú.',
  local: 'Nastavenia sú uložené na tomto zariadení.',
  synced: 'Nastavenia sa synchronizujú na všetky tvoje zariadenia.',
} as const;

export function StorageNote() {
  const mode = useSessionStore((state) => state.services?.mode);
  if (mode === undefined) {
    return null;
  }
  return <p className="proto">{NOTES[mode]}</p>;
}
