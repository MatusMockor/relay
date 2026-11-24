import type { TaskSystemConnection } from '@relay/shared';
import { Button, ConfirmDialog } from '@relay/ui';
import { useState } from 'react';
import { describeError } from '../../../data/errors';
import { useDisconnectTaskSystem } from '../../../data/hooks/use-task-system-mutations';
import { useTaskSystemConnections } from '../../../data/hooks/use-task-systems';
import { showToast } from '../../../state/toast-store';
import { EMPTY_CONNECT_DRAFT } from '../../task-systems/task-system-settings';
import { SectionHeader } from '../SectionHeader';
import { SettingsGroup } from '../SettingsGroup';
import { ConnectTaskSystemForm } from '../task-systems/ConnectTaskSystemForm';
import { showConnectForm, useConnectDraft } from '../task-systems/connect-view';
import { TaskSystemConnectionRow } from '../task-systems/TaskSystemConnectionRow';

export function TaskSystemsSection() {
  const connections = useTaskSystemConnections();
  const disconnect = useDisconnectTaskSystem();
  const draft = useConnectDraft();
  const [removing, setRemoving] = useState<TaskSystemConnection | null>(null);
  const list = connections.data ?? [];
  const empty = connections.isSuccess && list.length === 0;
  const formDraft = draft ?? (empty ? EMPTY_CONNECT_DRAFT : null);
  const close = () => {
    showConnectForm(null);
  };
  const confirmRemove = (target: TaskSystemConnection) => {
    setRemoving(null);
    disconnect.mutate(target.id, {
      onSuccess: () => {
        showToast(`Systém ${target.label} je odpojený`);
      },
      onError: (error) => {
        showToast(describeError(error));
      },
    });
  };
  return (
    <>
      <SectionHeader title="Task systémy">
        Pripoj Jiru a tvoje otvorené úlohy uvidíš v bočnom paneli hneď pod poštou. Úlohy sa
        načítavajú priamo zo systému, Relay si ich neukladá.
      </SectionHeader>
      {list.length === 0 ? null : <SettingsGroup title="Pripojené systémy" />}
      {list.map((connection) => (
        <TaskSystemConnectionRow
          key={connection.id}
          connection={connection}
          onReconnect={(target) => {
            showConnectForm({ siteUrl: target.siteUrl, label: target.label });
          }}
          onDisconnect={setRemoving}
        />
      ))}
      <SettingsGroup title="Pripojiť systém" />
      {formDraft === null ? (
        <Button
          variant="primary"
          onClick={() => {
            showConnectForm(EMPTY_CONNECT_DRAFT);
          }}
        >
          Pripojiť systém
        </Button>
      ) : (
        <ConnectTaskSystemForm
          key={`${formDraft.siteUrl}|${formDraft.label}`}
          draft={formDraft}
          onDone={close}
          onCancel={empty ? undefined : close}
        />
      )}
      {removing === null ? null : (
        <ConfirmDialog
          title={`Odpojiť ${removing.label}?`}
          text="Úlohy z tohto systému zmiznú z bočného panela. Systém môžeš kedykoľvek pripojiť znova."
          confirmLabel="Odpojiť"
          onCancel={() => {
            setRemoving(null);
          }}
          onConfirm={() => {
            confirmRemove(removing);
          }}
        />
      )}
    </>
  );
}
