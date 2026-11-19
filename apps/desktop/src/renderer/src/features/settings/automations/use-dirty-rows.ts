import { useCallback, useState } from 'react';

export interface DirtyRows {
  readonly dirty: boolean;
  readonly mark: (id: string, dirty: boolean) => void;
}

export const useDirtyRows = (): DirtyRows => {
  const [rows, setRows] = useState<ReadonlySet<string>>(new Set());
  const mark = useCallback((id: string, dirty: boolean) => {
    setRows((current) => {
      if (current.has(id) === dirty) {
        return current;
      }
      const next = new Set(current);
      next.delete(id);
      if (dirty) {
        next.add(id);
      }
      return next;
    });
  }, []);
  return { dirty: rows.size > 0, mark };
};
