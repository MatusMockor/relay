import type {
  AiJobInput,
  AiOutput,
  AutomationActivityAction,
  MessageId,
  MoveOriginRef,
} from '@relay/shared/domain';

export type MessageIdRemap = (id: MessageId) => MessageId;

export const messageIdRemapOf =
  (keeperOf: ReadonlyMap<MessageId, MessageId>): MessageIdRemap =>
  (id) =>
    keeperOf.get(id) ?? id;

const uniqueBy = <Item>(items: readonly Item[], keyOf: (item: Item) => string): Item[] => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyOf(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const remapIds = (ids: readonly MessageId[], remap: MessageIdRemap): MessageId[] =>
  uniqueBy(ids.map(remap), (id) => id);

const remapOrigins = (origins: readonly MoveOriginRef[], remap: MessageIdRemap): MoveOriginRef[] =>
  uniqueBy(
    origins.map((origin) => ({ ...origin, messageId: remap(origin.messageId) })),
    (origin) => JSON.stringify([origin.messageId, origin.revision]),
  );

export const remapAiJobInput = (input: AiJobInput, remap: MessageIdRemap): AiJobInput => {
  if (input.kind === 'automationTask' || input.kind === 'automationDraft') {
    return { ...input, messageId: remap(input.messageId) };
  }
  if (input.kind !== 'oneLiner' && input.kind !== 'summary' && input.kind !== 'replySuggestions') {
    return input;
  }
  const source = input.sourceMessageId;
  return source === null || source === undefined
    ? input
    : { ...input, sourceMessageId: remap(source) };
};

export const remapAiOutput = (output: AiOutput, remap: MessageIdRemap): AiOutput =>
  output.kind === 'automationDraft' ? { ...output, messageId: remap(output.messageId) } : output;

export const remapActivityActions = (
  actions: readonly AutomationActivityAction[],
  remap: MessageIdRemap,
): AutomationActivityAction[] =>
  actions.map((action) => ({
    ...action,
    changed: remapIds(action.changed, remap),
    labelled: remapIds(action.labelled, remap),
    origins: remapOrigins(action.origins, remap),
  }));
