import type { DraftAttachment, DraftId, MessageId } from '@relay/shared';
import { useRef, useState } from 'react';
import { describeError } from '../../../data/errors';
import { useClient } from '../../../data/hooks/services-context';
import type { AttachmentUploadInput } from '../../../data/MailClient';
import { showToast } from '../../../state/toast-store';
import { admit } from './attachment-limits';
import { type ComposeAttachment, nextAttachmentKey, readyOf, usage } from './compose-attachment';

export interface ComposeAttachmentsOptions {
  readonly initial: readonly DraftAttachment[];
  readonly ensureDraft: () => Promise<DraftId>;
}

const failedOf = (
  key: string,
  input: AttachmentUploadInput,
  error: unknown,
): ComposeAttachment => ({
  key,
  kind: 'failed',
  filename: input.filename,
  size: input.blob.size,
  error: describeError(error),
});

export const useComposeAttachments = ({ initial, ensureDraft }: ComposeAttachmentsOptions) => {
  const client = useClient();
  const [items, setItems] = useState<ComposeAttachment[]>(() => initial.map(readyOf));
  const latest = useRef(items);
  latest.current = items;
  const cancelled = useRef(new Set<string>());
  const [settling, setSettling] = useState(0);
  const patch = (key: string, next: readonly ComposeAttachment[]) => {
    setItems((current) => current.flatMap((item) => (item.key === key ? [...next] : [item])));
  };
  const settle = async (work: () => Promise<void>) => {
    try {
      await work();
    } finally {
      setSettling((count) => count - 1);
    }
  };
  const discard = async (draftId: DraftId, added: readonly DraftAttachment[]) => {
    const kept: DraftAttachment[] = [];
    for (const attachment of added) {
      await client.removeDraftAttachment(draftId, attachment.id).catch((error: unknown) => {
        kept.push(attachment);
        showToast(
          `Prílohu ${attachment.filename} sa nepodarilo odstrániť: ${describeError(error)}`,
        );
      });
    }
    setItems((current) => [...current, ...kept.map(readyOf)]);
  };
  const abandon = (key: string, fallback: () => void) => {
    if (cancelled.current.delete(key)) {
      setSettling((count) => count - 1);
      return;
    }
    fallback();
  };
  const finish = async (
    draftId: DraftId,
    key: string,
    work: () => Promise<readonly DraftAttachment[]>,
    onError: (error: unknown) => void,
  ) => {
    const outcome = await work().then(
      (added) => ({ added }),
      (error: unknown) => ({ error }),
    );
    if (cancelled.current.delete(key)) {
      await settle(() =>
        'added' in outcome ? discard(draftId, outcome.added) : Promise.resolve(),
      );
      return;
    }
    if ('error' in outcome) {
      onError(outcome.error);
      return;
    }
    patch(key, outcome.added.map(readyOf));
  };
  const add = (inputs: readonly AttachmentUploadInput[], problems: readonly string[] = []) => {
    const admission = admit(inputs, usage(latest.current));
    [...problems, ...admission.problems].forEach((problem) => {
      showToast(problem);
    });
    const pending = admission.accepted.map((input) => ({ key: nextAttachmentKey(), input }));
    setItems((current) => [
      ...current,
      ...pending.map(
        ({ key, input }): ComposeAttachment => ({
          key,
          kind: 'uploading',
          filename: input.filename,
          size: input.blob.size,
        }),
      ),
    ]);
    pending.forEach(({ key, input }) => {
      void ensureDraft().then(
        (draftId) =>
          finish(
            draftId,
            key,
            async () => [(await client.addDraftAttachment(draftId, input)).attachment],
            (error) => {
              patch(key, [failedOf(key, input, error)]);
            },
          ),
        (error: unknown) => {
          abandon(key, () => {
            patch(key, [failedOf(key, input, error)]);
          });
        },
      );
    });
  };
  const forward = (messageId: MessageId, count: number) => {
    const key = nextAttachmentKey();
    const label = `Prílohy pôvodnej správy (${String(count)})`;
    setItems((current) => [...current, { key, kind: 'uploading', filename: label, size: 0 }]);
    void ensureDraft().then(
      (draftId) =>
        finish(
          draftId,
          key,
          async () => (await client.forwardAttachments(draftId, messageId)).attachments,
          (error) => {
            patch(key, []);
            showToast(`Prílohy pôvodnej správy sa nepodarilo priložiť: ${describeError(error)}`);
          },
        ),
      (error: unknown) => {
        abandon(key, () => {
          patch(key, []);
          showToast(`Prílohy pôvodnej správy sa nepodarilo priložiť: ${describeError(error)}`);
        });
      },
    );
  };
  const remove = (key: string) => {
    const item = latest.current.find((entry) => entry.key === key);
    if (item === undefined) {
      return;
    }
    patch(key, []);
    if (item.kind === 'uploading') {
      setSettling((count) => count + 1);
      cancelled.current.add(key);
      return;
    }
    if (item.kind !== 'ready') {
      return;
    }
    const { attachment } = item;
    setSettling((count) => count + 1);
    void settle(async () => {
      const removed = await ensureDraft()
        .then((draftId) => client.removeDraftAttachment(draftId, attachment.id))
        .then(
          () => true,
          (error: unknown) => {
            showToast(
              `Prílohu ${attachment.filename} sa nepodarilo odstrániť: ${describeError(error)}`,
            );
            return false;
          },
        );
      if (!removed) {
        setItems((current) => [...current, item]);
      }
    });
  };
  return { items, removing: settling > 0, add, remove, forward };
};

export type ComposeAttachments = ReturnType<typeof useComposeAttachments>;
