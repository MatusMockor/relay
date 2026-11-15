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
  private loading: Promise<Entries> | null = null;
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

  async set(key: string, value: string): Promise<void> {
    await this.mutate((entries) => {
      entries.set(key, value);
      return true;
    });
  }

  async delete(key: string): Promise<void> {
    await this.mutate((entries) => entries.delete(key));
  }

  replace(key: string, expected: string, next: string): Promise<boolean> {
    return this.mutate((entries) => {
      if (entries.get(key) !== expected) {
        return false;
      }
      entries.set(key, next);
      return true;
    });
  }

  private mutate(change: (entries: Entries) => boolean): Promise<boolean> {
    const next = this.pending.then(async () => {
      const entries = new Map(await this.load());
      if (!change(entries)) {
        return false;
      }
      await this.persist(entries);
      this.entries = entries;
      return true;
    });
    this.pending = next.catch(() => undefined);
    return next;
  }

  private load(): Promise<Entries> {
    if (this.entries !== null) {
      return Promise.resolve(this.entries);
    }
    this.loading ??= this.readEntries()
      .then((entries) => {
        this.entries ??= entries;
        return this.entries;
      })
      .finally(() => {
        this.loading = null;
      });
    return this.loading;
  }

  private async readEntries(): Promise<Entries> {
    await this.assertAvailable();
    const content = await this.file.read();
    if (content === null) {
      return new Map();
    }
    const parsed = SecretFileSchema.parse(JSON.parse(await this.cipher.decrypt(content)));
    return new Map(Object.entries(parsed.entries));
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
