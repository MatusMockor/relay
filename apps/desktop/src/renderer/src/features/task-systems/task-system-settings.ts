import { setUi, type TaskSystemConnectDraft } from '../../state/ui-store';

export const EMPTY_CONNECT_DRAFT: TaskSystemConnectDraft = { siteUrl: '', label: '' };

export const openTaskSystemSettings = (connect: TaskSystemConnectDraft = EMPTY_CONNECT_DRAFT) => {
  setUi({ overlay: { kind: 'settings', section: 'taskSystems', adding: false, connect } });
};
