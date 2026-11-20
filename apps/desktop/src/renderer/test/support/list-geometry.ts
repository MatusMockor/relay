export const LIST_ROW_HEIGHT = 44;
export const LIST_HEADER_HEIGHT = 34;
export const DEFAULT_LIST_VIEWPORT = 4_000;

let viewport = DEFAULT_LIST_VIEWPORT;

export const setListViewport = (height: number): void => {
  viewport = height;
};

const blockSizeOf = (element: HTMLElement): number => {
  if (element.classList.contains('a-slot')) {
    return LIST_ROW_HEIGHT;
  }
  if (element.classList.contains('a-day')) {
    return LIST_HEADER_HEIGHT;
  }
  return 0;
};

const contentHeightOf = (element: HTMLElement): number => {
  const body = element.querySelector<HTMLElement>('.a-list-body');
  return body === null ? 0 : Number.parseFloat(body.style.height) || 0;
};

const scrollElementTo = (element: HTMLElement, options?: ScrollToOptions | number): void => {
  const top = typeof options === 'number' ? options : options?.top;
  if (top === undefined) {
    return;
  }
  element.scrollTop = top;
  element.dispatchEvent(new Event('scroll'));
};

export const installListGeometry = (): void => {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return blockSizeOf(this);
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains('a-list') ? viewport : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains('a-list') ? Math.max(contentHeightOf(this), viewport) : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    writable: true,
    value(this: HTMLElement, options?: ScrollToOptions | number) {
      scrollElementTo(this, options);
    },
  });
};
