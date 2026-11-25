const isInside = (container: HTMLElement | null, element: Element | null): boolean =>
  container !== null && element !== null && container.contains(element);

export const handleFocusedIn = (list: HTMLElement | null): boolean => {
  const active = document.activeElement;
  return isInside(list, active) && active?.classList.contains('au-grip') === true;
};

export const focusStayedIn = (list: HTMLElement | null): boolean => {
  const active = document.activeElement;
  return active === null || active === document.body || isInside(list, active);
};
