const MIN_ZOOM = 0.5;

export const fitMailWidth = (document: Document): void => {
  const root = document.documentElement;
  const body = document.body;
  body.style.removeProperty('zoom');
  if (root.clientWidth === 0 || root.scrollWidth <= root.clientWidth) {
    return;
  }
  const zoom = Math.max(MIN_ZOOM, root.clientWidth / root.scrollWidth);
  body.style.setProperty('zoom', zoom.toFixed(3));
};
