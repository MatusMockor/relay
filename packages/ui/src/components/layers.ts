export type LayerKeyHandler = (event: KeyboardEvent) => void;

interface LayerEntry {
  readonly onKey: LayerKeyHandler;
}

const stack: LayerEntry[] = [];
let installedOn: Document | null = null;

const dispatch = (event: KeyboardEvent): void => {
  const top = stack.at(-1);
  if (top === undefined) {
    return;
  }
  top.onKey(event);
};

const install = (): void => {
  if (installedOn === document) {
    return;
  }
  document.addEventListener('keydown', dispatch, true);
  installedOn = document;
};

export const pushLayer = (onKey: LayerKeyHandler): (() => void) => {
  install();
  const entry: LayerEntry = { onKey };
  stack.push(entry);
  return () => {
    const index = stack.indexOf(entry);
    if (index >= 0) {
      stack.splice(index, 1);
    }
  };
};

export const hasOpenLayer = (): boolean => stack.length > 0;

export const resetLayers = (): void => {
  stack.length = 0;
};
