import type { AttachmentPicker } from '../files/attachment-picker';
import type { IpcInvokeHandlers } from '../ipc/invoke-router';

export const createAttachmentPickerHandlers = (picker: AttachmentPicker): IpcInvokeHandlers => ({
  'app.pickAttachments': ({ budgetBytes }) => picker.pick(budgetBytes),
});
