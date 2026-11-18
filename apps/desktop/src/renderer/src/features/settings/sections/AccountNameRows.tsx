import type { MailAccount, UpdateAccountBody } from '@relay/shared';
import { SettingRow } from '../SettingRow';
import { AccountNameInput } from './AccountNameInput';

export interface AccountNameRowsProps {
  readonly account: MailAccount;
  readonly onPatch: (body: UpdateAccountBody) => void;
}

export function AccountNameRows({ account, onPatch }: AccountNameRowsProps) {
  return (
    <>
      <SettingRow title="Meno odosielateľa" description="Príjemcovia ho uvidia v poli Od">
        <AccountNameInput
          label={`Meno odosielateľa pre ${account.email}`}
          value={account.senderName ?? ''}
          placeholder="napr. Ján Novák"
          onCommit={(value) => {
            onPatch({ senderName: value === '' ? null : value });
          }}
        />
      </SettingRow>
      <SettingRow title="Názov účtu" description="Len pre teba v aplikácii">
        <AccountNameInput
          label={`Názov účtu ${account.email}`}
          value={account.displayName}
          placeholder={account.email}
          onCommit={(value) => {
            onPatch({ displayName: value === '' ? account.email : value });
          }}
        />
      </SettingRow>
    </>
  );
}
