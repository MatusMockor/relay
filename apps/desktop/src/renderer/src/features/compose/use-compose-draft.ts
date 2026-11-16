import type { Draft, DraftContent, DraftId } from '@relay/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { queryKeys } from '../../data/hooks/query-keys';
import { useClient } from '../../data/hooks/services-context';
import { withoutAttachments } from './compose-start';

export const AUTOSAVE_DELAY_MS = 1_200;

export const useComposeDraft = (initialId: DraftId | null) => {
  const client = useClient();
  const queryClient = useQueryClient();
  const id = useRef<DraftId | null>(initialId);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(0);
  const remember = (draft: Draft): DraftId => {
    id.current = draft.id;
    queryClient.setQueryData<Draft[]>(queryKeys.drafts(), (list) =>
      list === undefined ? list : [draft, ...list.filter((item) => item.id !== draft.id)],
    );
    return draft.id;
  };
  const enqueue = <T>(work: () => Promise<T>): Promise<T> => {
    inFlight.current += 1;
    const next = queue.current.then(work, work).finally(() => {
      inFlight.current -= 1;
    });
    queue.current = next.catch(() => undefined);
    return next;
  };
  const cancelScheduled = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };
  const save = (content: DraftContent): Promise<DraftId> => {
    cancelScheduled();
    return enqueue(async () => {
      const current = id.current;
      if (current === null) {
        return remember(await client.createDraft({ ...content, attachments: [] }));
      }
      return remember(await client.updateDraft(current, withoutAttachments(content)));
    });
  };
  const ensure = (content: () => DraftContent | null): Promise<DraftId> =>
    enqueue(async () => {
      if (id.current !== null) {
        return id.current;
      }
      const ready = content();
      if (ready === null) {
        throw new Error('Najprv pridaj e-mailový účet');
      }
      return remember(await client.createDraft({ ...ready, attachments: [] }));
    });
  const schedule = (content: DraftContent) => {
    cancelScheduled();
    timer.current = setTimeout(() => {
      timer.current = null;
      void save(content).catch(() => undefined);
    }, AUTOSAVE_DELAY_MS);
  };
  const discard = (): Promise<void> => {
    cancelScheduled();
    return enqueue(async () => {
      const current = id.current;
      if (current === null) {
        return;
      }
      await client.deleteDraft(current);
      id.current = null;
      queryClient.setQueryData<Draft[]>(queryKeys.drafts(), (list) =>
        list?.filter((item) => item.id !== current),
      );
    });
  };
  const whenSettled = (run: (draftId: DraftId | null) => void): void => {
    cancelScheduled();
    if (inFlight.current === 0) {
      run(id.current);
      return;
    }
    void enqueue(() => Promise.resolve(id.current)).then(run);
  };
  useEffect(() => cancelScheduled, []);
  return {
    current: () => id.current,
    save,
    ensure,
    schedule,
    discard,
    cancelScheduled,
    whenSettled,
  };
};

export type ComposeDraft = ReturnType<typeof useComposeDraft>;
