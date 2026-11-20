import { useState } from 'react';
import { closeFolderEdit, useFolderEdit } from './folder-edit-store';

export const useOwnEditClose = (): (() => void) => {
  const [own] = useState(() => useFolderEdit.getState().seq);
  return () => {
    closeFolderEdit(own);
  };
};
