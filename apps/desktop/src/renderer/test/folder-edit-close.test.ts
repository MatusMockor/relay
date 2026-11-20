import { describe, expect, it } from 'vitest';
import { demoIds } from '../src/data/demo/seed/ids';
import {
  closeFolderEdit,
  type FolderEdit,
  setFolderEdit,
  useFolderEdit,
} from '../src/features/folders/edit/folder-edit-store';

const labelEdit = (key: 'efa' | 'os'): FolderEdit => ({
  kind: 'create-label',
  accountId: demoIds.account(key),
});

describe('closing a folder edit', () => {
  it('closes the edit it was opened for', () => {
    const own = labelEdit('efa');
    setFolderEdit(own);

    closeFolderEdit(own);

    expect(useFolderEdit.getState().edit).toBeNull();
  });

  it('keeps a newer edit opened while the old one was finishing', () => {
    const own = labelEdit('efa');
    const newer = labelEdit('os');
    setFolderEdit(own);
    setFolderEdit(newer);

    closeFolderEdit(own);

    expect(useFolderEdit.getState().edit).toBe(newer);
  });

  it('closes the same edit when it was opened again while the old one was finishing', () => {
    const own = labelEdit('efa');
    setFolderEdit(own);
    setFolderEdit(labelEdit('efa'));

    closeFolderEdit(own);

    expect(useFolderEdit.getState().edit).toBeNull();
  });
});
