import type { Label } from '@relay/shared';
import { type AnchorRect, Icon, IconButton } from '@relay/ui';
import { useState } from 'react';
import { rectOf } from '../../../folders/rect';
import type { LabelColorOf } from '../../../labels/use-label-color';
import { LabelColorPopover } from './LabelColorPopover';
import { LabelNameInput } from './LabelNameInput';
import type { LabelSettings } from './use-label-settings';

export interface LabelSettingRowProps {
  readonly label: Label;
  readonly colorOf: LabelColorOf;
  readonly settings: LabelSettings;
  readonly onDelete: (label: Label) => void;
}

const KIND_TEXT = { gmail: 'Gmail štítok', keyword: 'IMAP štítok' } as const;

export function LabelSettingRow({ label, colorOf, settings, onDelete }: LabelSettingRowProps) {
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  return (
    <div className="srow lbl-row">
      <div className="lbl-row-l">
        <button
          type="button"
          className="lbl-swatch on"
          style={{ ['--c' as string]: colorOf(label) }}
          title="Zmeniť farbu"
          aria-label={`Zmeniť farbu štítka ${label.name}`}
          onClick={(event) => {
            setAnchor(rectOf(event.currentTarget));
          }}
        />
        <LabelNameInput
          label={`Názov štítka ${label.name}`}
          value={label.name}
          onCommit={(name) => settings.update(label, { name })}
        />
      </div>
      <div className="r">
        <span className="lbl-kind">{KIND_TEXT[label.kind]}</span>
        <IconButton
          label={`Zmazať štítok ${label.name}`}
          onClick={() => {
            onDelete(label);
          }}
        >
          <Icon name="trash" />
        </IconButton>
      </div>
      {anchor === null ? null : (
        <LabelColorPopover
          anchor={anchor}
          name={label.name}
          color={label.color}
          onPick={(color) => {
            void settings.update(label, { color });
          }}
          onClose={() => {
            setAnchor(null);
          }}
        />
      )}
    </div>
  );
}
