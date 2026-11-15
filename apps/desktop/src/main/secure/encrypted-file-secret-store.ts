import { z } from 'zod';
import type { SecretCipher } from '../platform/secret-cipher';
import { AtomicFile } from '../storage/atomic-file';
import { resolveWithin } from './resolve-within';
import type { SecretStore } from './secret-store';
import { SecureStorageUnavailableError } from './secure-storage-unavailable-error';

const SecretFileSchema = z.object({
  version: z.literal(1),
  entries: z.record(z.string(), z.string()),
});

type Entries = Map<string, string>;

const DEFAULT_AVAILABILITY_TIMEOUT_MS = 5_000;

export class EncryptedFileSecretStore implements SecretStore {
  private readonly file: AtomicFile;
  private entries: Entries | null = null;
  private pending: Promise<unknown> = Promise.resolve();

  constructor(
    path: string,
    private readonly cipher: SecretCipher,
    private readonly availabilityTimeoutMs = DEFAULT_AVAILABILITY_TIMEOUT_MS,
  ) {
    this.file = new AtomicFile(path);
  }

  async get(key: string): Promise<string | null> {
    const entries = await this.load();
    return entries.get(key) ?? null;
  }

  set(key: string, value: string): Promise<void> {
    return this.mutate((entries) => entries.set(key, value));
  }

  delete(key: string): Promise<void> {
    return this.mutate((entries) => entries.delete(key));
  }

  private mutate(change: (entries: Entries) => unknown): Promise<void> {
    const next = this.pending.then(async () => {
      const entries = new Map(await this.load());
      change(entries);
      await this.persist(entries);
      this.entries = entries;
    });
    this.pending = next.catch(() => undefined);
    return next;
  }

  private async load(): Promise<Entries> {
    if (this.entries !== null) {
      return this.entries;
    }
    await this.assertAvailable();
    const content = await this.file.read();
    if (content === null) {
      this.entries = new Map();
      return this.entries;
    }
    const parsed = SecretFileSchema.parse(JSON.parse(await this.cipher.decrypt(content)));
    this.entries = new Map(Object.entries(parsed.entries));
    return this.entries;
  }

  private async persist(entries: Entries): Promise<void> {
    await this.assertAvailable();
    const payload = JSON.stringify({ version: 1, entries: Object.fromEntries(entries) });
    await this.file.write(await this.cipher.encrypt(payload));
  }

  private async assertAvailable(): Promise<void> {
    if (await resolveWithin(this.cipher.isAvailable(), this.availabilityTimeoutMs, false)) {
      return;
    }
    throw new SecureStorageUnavailableError();
  }
}
