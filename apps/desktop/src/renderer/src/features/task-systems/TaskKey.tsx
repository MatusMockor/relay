const SCOPED_KEY = /^(.+)(#\d+)$/;

export function TaskKey({ value }: { readonly value: string }) {
  const match = SCOPED_KEY.exec(value);
  if (match === null) {
    return (
      <span className="key ts-key" title={value}>
        <span className="ts-key-scope">{value}</span>
      </span>
    );
  }
  return (
    <span className="key ts-key" title={value}>
      <span className="ts-key-scope">{match[1]}</span>
      <span className="ts-key-id">{match[2]}</span>
    </span>
  );
}
