import { createContext, type ReactNode, useContext } from 'react';
import { type ComposeCommands, useComposeCommands } from './use-compose-commands';
import { type SelectionModel, useSelection } from './use-selection';
import { type ThreadCommands, useThreadCommands } from './use-thread-commands';

export interface MailActions extends SelectionModel {
  readonly thread: ThreadCommands;
  readonly compose: ComposeCommands;
}

const MailActionsContext = createContext<MailActions | null>(null);

export function MailActionsProvider({ children }: { readonly children: ReactNode }) {
  const selection = useSelection();
  const thread = useThreadCommands(selection.items);
  const compose = useComposeCommands(selection.items);
  return (
    <MailActionsContext.Provider value={{ ...selection, thread, compose }}>
      {children}
    </MailActionsContext.Provider>
  );
}

export const useMailActions = (): MailActions => {
  const value = useContext(MailActionsContext);
  if (value === null) {
    throw new Error('MailActionsProvider chýba');
  }
  return value;
};
