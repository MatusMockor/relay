import type { MessageId } from '@relay/shared/domain';
import type { MergeMapping } from '../../model/message-merge';
import type { PendingWork, PendingWorkPayloads, ProviderOpWork } from '../../model/pending-work';
import { providerOpRef } from '../../services/shared/provider-ops';

export const MESSAGE_PENDING_KINDS = [
  'provider-op',
  'message-effects',
  'jira-event',
  'calendar-invite',
  'calendar-rebuild-part',
  'calendar-reply',
  'trash-origin',
  'spam-origin',
  'move-origin',
] as const;

export type MessagePendingKind = (typeof MESSAGE_PENDING_KINDS)[number];

export interface Rekeying<Kind extends MessagePendingKind> {
  readonly ownerOf: (work: PendingWork<Kind>) => string;
  readonly rekey: (
    work: PendingWork<Kind>,
    keeper: MessageId,
    mapping: MergeMapping,
  ) => PendingWork<Kind>;
}

type KeyedByMessage = {
  readonly [Kind in MessagePendingKind]: PendingWorkPayloads[Kind] extends {
    readonly messageId: MessageId;
  }
    ? Kind
    : never;
}[MessagePendingKind];

type RekeyedByMessage = Exclude<KeyedByMessage, 'provider-op' | 'calendar-reply'>;

const payloadOwner = <Kind extends KeyedByMessage>(work: PendingWork<Kind>): string =>
  work.payload.messageId;

const sourceOf = (payload: ProviderOpWork, mapping: MergeMapping) =>
  payload.change.kind === 'move'
    ? (payload.source ?? mapping.primaryOf.get(payload.messageId))
    : payload.source;

const providerOp: Rekeying<'provider-op'> = {
  ownerOf: payloadOwner,
  rekey: (work, keeper, mapping) => {
    const source = sourceOf(work.payload, mapping);
    const payload: ProviderOpWork = {
      ...work.payload,
      messageId: keeper,
      ...(source === undefined ? {} : { source }),
    };
    return { ...work, ref: providerOpRef(keeper, payload.change, source?.mailboxId), payload };
  },
};

const byMessage = <Kind extends RekeyedByMessage>(): Rekeying<Kind> => ({
  ownerOf: payloadOwner,
  rekey: (work, keeper) => ({
    ...work,
    ref: keeper,
    payload: { ...work.payload, messageId: keeper },
  }),
});

export const REKEYINGS: { readonly [Kind in MessagePendingKind]: Rekeying<Kind> } = {
  'provider-op': providerOp,
  'message-effects': byMessage(),
  'jira-event': {
    ownerOf: (work) => work.ref,
    rekey: (work, keeper) => ({ ...work, ref: keeper }),
  },
  'calendar-invite': byMessage(),
  'calendar-rebuild-part': byMessage(),
  'calendar-reply': {
    ownerOf: payloadOwner,
    rekey: (work, keeper) => ({ ...work, payload: { ...work.payload, messageId: keeper } }),
  },
  'trash-origin': byMessage(),
  'spam-origin': byMessage(),
  'move-origin': byMessage(),
};
