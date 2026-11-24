export type LayerKeyHandler = (event: KeyboardEvent) => void;

export interface LayerNode {
  readonly parent: LayerNode | null;
}

interface LayerEntry {
  readonly node: LayerNode;
  readonly onKey: LayerKeyHandler;
}

const stack: LayerEntry[] = [];
const listeners = new Set<() => void>();
let installedOn: Document | null = null;

const notify = (): void => {
  [...listeners].forEach((listener) => {
    listener();
  });
};

const latestChildOf = (node: LayerNode): LayerEntry | undefined =>
  [...stack].reverse().find((entry) => entry.node.parent === node);

const topEntry = (): LayerEntry | undefined => {
  let top = stack.at(-1);
  let child = top === undefined ? undefined : latestChildOf(top.node);
  while (child !== undefined) {
    top = child;
    child = latestChildOf(child.node);
  }
  return top;
};

const dispatch = (event: KeyboardEvent): void => {
  topEntry()?.onKey(event);
};

const install = (): void => {
  if (installedOn === document) {
    return;
  }
  document.addEventListener('keydown', dispatch, true);
  installedOn = document;
};

export const pushLayer = (
  onKey: LayerKeyHandler,
  node: LayerNode = { parent: null },
): (() => void) => {
  install();
  const entry: LayerEntry = { node, onKey };
  stack.push(entry);
  notify();
  return () => {
    const index = stack.indexOf(entry);
    if (index < 0) {
      return;
    }
    stack.splice(index, 1);
    notify();
  };
};

export const subscribeToLayers = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const hasOpenLayer = (): boolean => stack.length > 0;

export const openLayerCount = (): number => stack.length;

export const resetLayers = (): void => {
  stack.length = 0;
  notify();
};
