export interface KbdProps {
  readonly keys: readonly string[];
}

export function Kbd({ keys }: KbdProps) {
  return (
    <>
      {keys.map((key) => (
        <span className="kbd" key={key}>
          {key}
        </span>
      ))}
    </>
  );
}
