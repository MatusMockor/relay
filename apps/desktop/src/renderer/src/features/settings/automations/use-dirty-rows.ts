import { useCallback, useState } from 'react';

export interface DirtyRows {
  readonly dirty: boolean;
  readonly signature: string;
  readonly mark: (id: string, raw: string | null) => void;
}

export const useDirtyRows = (): DirtyRows => {
  const [rows, setRows] = useState<ReadonlyMap<string, string>>(new Map());
  const mark = useCallback((id: string, raw: string | null) => {
    setRows((current) => {
      if ((current.get(id) ?? null) === raw) {
        return current;
      }
      const next = new Map(current);
      next.delete(id);
      if (raw !== null) {
        next.set(id, raw);
      }
      return next;
    });
  }, []);
  const signature = [...rows.entries()]
    .map(([id, raw]) => `${id}=${raw}`)
    .sort()
    .join('\n');
  return { dirty: rows.size > 0, signature, mark };
};
