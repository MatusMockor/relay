import type { TaskSystemConnection } from '@relay/shared';
import { setUi, type TaskSystemConnectDraft } from '../../state/ui-store';

export const EMPTY_CONNECT_DRAFT: TaskSystemConnectDraft = {
  provider: 'jira',
  siteUrl: '',
  label: '',
};

export const reconnectDraftOf = (connection: TaskSystemConnection): TaskSystemConnectDraft => ({
  provider: connection.provider,
  siteUrl: connection.provider === 'jira' ? connection.siteUrl : '',
  label: connection.label,
});

export const openTaskSystemSettings = (connect: TaskSystemConnectDraft = EMPTY_CONNECT_DRAFT) => {
  setUi({ overlay: { kind: 'settings', section: 'taskSystems', adding: false, connect } });
};
