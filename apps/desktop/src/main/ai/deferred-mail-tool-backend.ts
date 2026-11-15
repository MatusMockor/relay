import type { MailToolBackend } from '@relay/mcp-mail';

export class DeferredMailToolBackend implements MailToolBackend {
  private target: MailToolBackend | null = null;

  bind(target: MailToolBackend): void {
    this.target = target;
  }

  listFolder: MailToolBackend['listFolder'] = (query) => this.resolve().listFolder(query);
  getThread: MailToolBackend['getThread'] = (threadId) => this.resolve().getThread(threadId);
  listTasks: MailToolBackend['listTasks'] = (query) => this.resolve().listTasks(query);
  createTask: MailToolBackend['createTask'] = (task) => this.resolve().createTask(task);
  createDraft: MailToolBackend['createDraft'] = (content) => this.resolve().createDraft(content);

  private resolve(): MailToolBackend {
    if (this.target === null) {
      throw new Error('Mail tools are not ready yet');
    }
    return this.target;
  }
}
