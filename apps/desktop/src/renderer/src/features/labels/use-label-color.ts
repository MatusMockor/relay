import type { Label } from '@relay/shared';
import { useNameColors } from '../colors/use-name-colors';

export type LabelColorOf = (label: Label) => string;

export const useLabelColor = (): LabelColorOf => {
  const colors = useNameColors();
  return (label) => label.color ?? colors.of(label.name);
};
