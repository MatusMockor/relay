import { type Label, LabelSchema } from '@relay/shared/domain';

export const isValidLabel = (label: Label): boolean => LabelSchema.safeParse(label).success;
