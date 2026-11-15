import type { ReactNode } from 'react';

export interface MiniRow {
  readonly key: string;
  readonly left: ReactNode;
  readonly right: string;
  readonly onClick?: () => void;
}

export function MiniSection({
  title,
  rows,
}: {
  readonly title: string;
  readonly rows: readonly MiniRow[];
}) {
  if (rows.length === 0) {
    return null;
  }
  return (
    <div className="sec">
      <h4>{title}</h4>
      <div className="mini">
        {rows.map((row) =>
          row.onClick === undefined ? (
            <div key={row.key}>
              <span>{row.left}</span>
              <span>{row.right}</span>
            </div>
          ) : (
            <button key={row.key} type="button" onClick={row.onClick}>
              <span>{row.left}</span>
              <span>{row.right}</span>
            </button>
          ),
        )}
      </div>
    </div>
  );
}
