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

const open = (edit: FolderEdit): number => {
  setFolderEdit(edit);
  return useFolderEdit.getState().seq;
};

describe('closing a folder edit', () => {
  it('closes the edit it was opened for', () => {
    const own = open(labelEdit('efa'));

    closeFolderEdit(own);

    expect(useFolderEdit.getState().edit).toBeNull();
  });

  it('keeps an edit for another account opened while the old one was finishing', () => {
    const own = open(labelEdit('efa'));
    const newer = labelEdit('os');
    setFolderEdit(newer);

    closeFolderEdit(own);

    expect(useFolderEdit.getState().edit).toBe(newer);
  });

  it('keeps the same edit opened again while the old one was finishing', () => {
    const own = open(labelEdit('efa'));
    const reopened = labelEdit('efa');
    const seq = open(reopened);

    closeFolderEdit(own);

    expect(useFolderEdit.getState().edit).toBe(reopened);
    closeFolderEdit(seq);
    expect(useFolderEdit.getState().edit).toBeNull();
  });
});
