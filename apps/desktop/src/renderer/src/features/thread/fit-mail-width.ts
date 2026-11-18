const MIN_ZOOM = 0.5;
const MAX_PASSES = 3;
const TOLERANCE_PX = 1;

const currentZoom = (body: HTMLElement): number => {
  const value = Number.parseFloat(body.style.getPropertyValue('zoom'));
  return Number.isFinite(value) && value > 0 ? value : 1;
};

const overflows = (root: HTMLElement): boolean =>
  root.clientWidth > 0 && root.scrollWidth - root.clientWidth > TOLERANCE_PX;

const fittedZoom = (zoom: number, root: HTMLElement): number =>
  Math.max(MIN_ZOOM, Math.floor(((zoom * root.clientWidth) / root.scrollWidth) * 1000) / 1000);

const shrinkToFit = (root: HTMLElement, body: HTMLElement): void => {
  for (let pass = 0; pass < MAX_PASSES && overflows(root); pass += 1) {
    const zoom = currentZoom(body);
    if (zoom <= MIN_ZOOM) {
      return;
    }
    body.style.setProperty('zoom', String(fittedZoom(zoom, root)));
  }
  if (overflows(root)) {
    body.style.setProperty('zoom', String(MIN_ZOOM));
  }
};

export const fitMailWidth = (document: Document): void => {
  const root = document.documentElement;
  const body = document.body;
  root.style.setProperty('overflow', 'hidden', 'important');
  body.style.setProperty('overflow', 'visible', 'important');
  body.style.removeProperty('zoom');
  shrinkToFit(root, body);
  if (overflows(root)) {
    root.style.setProperty('overflow-x', 'auto', 'important');
  }
};
