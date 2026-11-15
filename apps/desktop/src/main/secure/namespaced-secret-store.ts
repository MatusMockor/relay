import type { SecretStore } from './secret-store';

export class NamespacedSecretStore implements SecretStore {
  constructor(
    private readonly inner: SecretStore,
    private readonly namespace: string,
  ) {}

  get(key: string): Promise<string | null> {
    return this.inner.get(this.qualify(key));
  }

  set(key: string, value: string): Promise<void> {
    return this.inner.set(this.qualify(key), value);
  }

  delete(key: string): Promise<void> {
    return this.inner.delete(this.qualify(key));
  }

  private qualify(key: string): string {
    return `${this.namespace}/${key}`;
  }
}
