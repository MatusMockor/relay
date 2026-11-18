const MIN_ZOOM = 0.5;
const MAX_PASSES = 3;

const currentZoom = (body: HTMLElement): number => {
  const value = Number.parseFloat(body.style.getPropertyValue('zoom'));
  return Number.isFinite(value) && value > 0 ? value : 1;
};

const overflows = (root: HTMLElement): boolean =>
  root.clientWidth > 0 && root.scrollWidth > root.clientWidth;

export const fitMailWidth = (document: Document): void => {
  const root = document.documentElement;
  const body = document.body;
  body.style.removeProperty('zoom');
  for (let pass = 0; pass < MAX_PASSES && overflows(root); pass += 1) {
    const zoom = currentZoom(body);
    if (zoom <= MIN_ZOOM) {
      return;
    }
    const next = Math.max(MIN_ZOOM, (zoom * root.clientWidth) / root.scrollWidth);
    body.style.setProperty('zoom', next.toFixed(3));
  }
  if (overflows(root)) {
    body.style.setProperty('zoom', String(MIN_ZOOM));
  }
};
