import type { FolderKind } from './folder-edit-store';

interface FolderCopy {
  readonly newChild: string;
  readonly newTop: string;
  readonly placeholder: string;
  readonly deleteTitle: (name: string) => string;
  readonly deleteText: string;
  readonly deleted: (name: string) => string;
}

export const FOLDER_COPY: Readonly<Record<FolderKind, FolderCopy>> = {
  folder: {
    newChild: 'Nový podpriečinok',
    newTop: 'Nový priečinok',
    placeholder: 'Názov priečinka',
    deleteTitle: (name) => `Zmazať priečinok „${name}“?`,
    deleteText: 'Správy sa presunú do Koša.',
    deleted: (name) => `Priečinok „${name}“ je zmazaný`,
  },
  label: {
    newChild: 'Nový podštítok',
    newTop: 'Nový štítok',
    placeholder: 'Názov štítka',
    deleteTitle: (name) => `Zmazať štítok „${name}“?`,
    deleteText: 'Správy ostanú v Archíve.',
    deleted: (name) => `Štítok „${name}“ je zmazaný`,
  },
};
