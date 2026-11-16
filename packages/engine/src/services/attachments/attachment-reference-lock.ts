import type { AttachmentBlobCatalog } from '../../ports/attachment-blob-catalog';

const settled = (): undefined => undefined;

const started = <Result>(work: () => Promise<Result>): Promise<Result> =>
  new Promise<Result>((resolve) => {
    resolve(work());
  });

export class AttachmentReferenceLock {
  private exclusiveTail: Promise<unknown> = Promise.resolve();
  private pendingExclusive = 0;
  private readonly sharedRunning = new Set<Promise<unknown>>();

  shared<Result>(work: () => Promise<Result>): Promise<Result> {
    if (this.pendingExclusive > 0) {
      return this.exclusiveTail.then(() => this.shared(work));
    }
    const running = started(work);
    const tracked = running.then(settled, settled);
    this.sharedRunning.add(tracked);
    void tracked.then(() => this.sharedRunning.delete(tracked));
    return running;
  }

  exclusive<Result>(work: () => Promise<Result>): Promise<Result> {
    this.pendingExclusive += 1;
    const before = [this.exclusiveTail, ...this.sharedRunning];
    const result = Promise.all(before)
      .then(work)
      .finally(() => {
        this.pendingExclusive -= 1;
      });
    this.exclusiveTail = result.then(settled, settled);
    return result;
  }
}

const locks = new WeakMap<AttachmentBlobCatalog, AttachmentReferenceLock>();

export const attachmentReferenceLockFor = (
  blobs: AttachmentBlobCatalog,
): AttachmentReferenceLock => {
  const existing = locks.get(blobs);
  if (existing !== undefined) {
    return existing;
  }
  const created = new AttachmentReferenceLock();
  locks.set(blobs, created);
  return created;
};
