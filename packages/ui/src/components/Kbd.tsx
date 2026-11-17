export interface KbdProps {
  readonly keys: readonly string[];
}

const SYMBOLS = new Set(['⇧', '⌘', '⌥', '⌃', '↵', '⌫']);

export function Kbd({ keys }: KbdProps) {
  return (
    <>
      {keys.map((key) => (
        <span className={SYMBOLS.has(key) ? 'kbd sym' : 'kbd'} key={key}>
          {key}
        </span>
      ))}
    </>
  );
}
