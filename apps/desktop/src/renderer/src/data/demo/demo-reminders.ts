import {
  type AutomationActivityReminder,
  type ReminderId,
  ReminderIdSchema,
  type ThreadAction,
  type ThreadId,
  type ThreadSummary,
} from '@relay/shared';

export class DemoReminders {
  private readonly active = new Map<ThreadId, ReminderId>();
  private sequence = 0;

  track(action: ThreadAction, thread: ThreadSummary): void {
    if (action.type === 'remind') {
      this.sequence += 1;
      this.active.set(thread.id, ReminderIdSchema.parse(`reminder-${String(this.sequence)}`));
      return;
    }
    if (thread.state !== 'reminder' || thread.remindAt === null) {
      this.active.delete(thread.id);
    }
  }

  current(thread: ThreadSummary): AutomationActivityReminder | null {
    const id = this.active.get(thread.id);
    if (id === undefined || thread.state !== 'reminder' || thread.remindAt === null) {
      return null;
    }
    return { id, remindAt: thread.remindAt };
  }
}
