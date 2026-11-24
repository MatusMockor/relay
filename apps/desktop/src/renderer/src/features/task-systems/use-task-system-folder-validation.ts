import { useEffect } from 'react';
import { useTaskSystemConnections } from '../../data/hooks/use-task-systems';
import { INBOX } from '../../state/folders';
import { useUiStore } from '../../state/ui-store';
import { appHistory } from '../history/app-history';
import { selectFolder } from '../mail/navigation';

export const useTaskSystemFolderValidation = (): void => {
  const folder = useUiStore((state) => state.folder);
  const { data } = useTaskSystemConnections();
  useEffect(() => {
    if (folder.kind !== 'taskSystem' || data === undefined) {
      return;
    }
    if (data.some((connection) => connection.id === folder.connectionId)) {
      return;
    }
    appHistory.quietly(() => {
      selectFolder(INBOX);
    });
  }, [data, folder]);
};
