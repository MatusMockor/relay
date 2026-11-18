export interface KbdProps {
  readonly keys: readonly string[];
}

const SYMBOLS = new Set(['⇧', '⌘', '⌥', '⌃', '⌫']);

export function EnterGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-label="Enter" role="img">
      <path
        d="M8.5 1.5v4h-6M4.5 3.5l-2 2 2 2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Kbd({ keys }: KbdProps) {
  return (
    <>
      {keys.map((key) => (
        <span className={SYMBOLS.has(key) || key === '↵' ? 'kbd sym' : 'kbd'} key={key}>
          {key === '↵' ? <EnterGlyph /> : key}
        </span>
      ))}
    </>
  );
}
