import { type AnchorRect, Popover } from '@relay/ui';
import { NAME_HUES } from '../../../colors/name-colors';

export interface LabelColorPopoverProps {
  readonly anchor: AnchorRect;
  readonly name: string;
  readonly color: string | null;
  readonly onPick: (color: string | null) => void;
  readonly onClose: () => void;
}

const SWATCHES: readonly (string | null)[] = [null, ...NAME_HUES];

export function LabelColorPopover({
  anchor,
  name,
  color,
  onPick,
  onClose,
}: LabelColorPopoverProps) {
  return (
    <Popover anchor={anchor} label={`Farba štítka ${name}`} width={208} onClose={onClose}>
      <div className="grp">Farba</div>
      <div className="lbl-swatches" role="radiogroup" aria-label={`Farba štítka ${name}`}>
        {SWATCHES.map((swatch) => {
          const on = swatch === null ? color === null : swatch === color?.toLowerCase();
          return (
            <button
              key={swatch ?? 'auto'}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={swatch === null ? 'Automatická farba' : `Farba ${swatch}`}
              title={swatch === null ? 'Automaticky podľa názvu' : swatch}
              className={`lbl-swatch${swatch === null ? ' auto' : ''}${on ? ' on' : ''}`}
              style={swatch === null ? undefined : { ['--c' as string]: swatch }}
              onClick={() => {
                onClose();
                onPick(swatch);
              }}
            />
          );
        })}
      </div>
    </Popover>
  );
}
