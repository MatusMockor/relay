// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fitMailWidth } from '../src/features/thread/fit-mail-width';

const withCssZoom = (style: CSSStyleDeclaration): void => {
  const values = new Map<string, string>();
  const set = style.setProperty.bind(style);
  const get = style.getPropertyValue.bind(style);
  const remove = style.removeProperty.bind(style);
  style.setProperty = (name, value, priority) => {
    if (name === 'zoom') {
      values.set(name, value ?? '');
      return;
    }
    set(name, value, priority);
  };
  style.getPropertyValue = (name) => (name === 'zoom' ? (values.get(name) ?? '') : get(name));
  style.removeProperty = (name) => {
    if (name === 'zoom') {
      values.delete(name);
      return '';
    }
    return remove(name);
  };
};

const layoutOf = (viewport: number, content: number): Document => {
  const document = new DOMParser().parseFromString('<p>mail</p>', 'text/html');
  const root = document.documentElement;
  const body = document.body;
  withCssZoom(body.style);
  const zoom = (): number => Number.parseFloat(body.style.getPropertyValue('zoom')) || 1;
  Object.defineProperty(root, 'clientWidth', { get: () => viewport });
  Object.defineProperty(root, 'scrollWidth', {
    get: () => Math.max(viewport, Math.ceil(content * zoom())),
  });
  return document;
};

describe('fitMailWidth', () => {
  it('hides the frame scrollbars when the mail fits', () => {
    const document = layoutOf(640, 600);

    fitMailWidth(document);

    expect(document.documentElement.style.getPropertyValue('overflow')).toBe('hidden');
    expect(document.documentElement.style.getPropertyPriority('overflow')).toBe('important');
    expect(document.body.style.getPropertyValue('overflow')).toBe('visible');
    expect(document.body.style.getPropertyValue('zoom')).toBe('');
  });

  it('ignores a sub-pixel overflow instead of showing a scrollbar', () => {
    const document = layoutOf(640, 641);

    fitMailWidth(document);

    expect(document.body.style.getPropertyValue('zoom')).toBe('');
    expect(document.documentElement.style.getPropertyValue('overflow-x')).not.toBe('auto');
  });

  it('zooms a wide mail down until it fits without a horizontal scrollbar', () => {
    const document = layoutOf(600, 688);

    fitMailWidth(document);

    const zoom = Number.parseFloat(document.body.style.getPropertyValue('zoom'));
    expect(zoom).toBeLessThan(1);
    expect(Math.ceil(688 * zoom)).toBeLessThanOrEqual(601);
    expect(document.documentElement.style.getPropertyValue('overflow-x')).not.toBe('auto');
  });

  it('allows horizontal scrolling only when the mail overflows even at the minimum zoom', () => {
    const document = layoutOf(300, 1200);

    fitMailWidth(document);

    expect(document.body.style.getPropertyValue('zoom')).toBe('0.5');
    expect(document.documentElement.style.getPropertyValue('overflow-x')).toBe('auto');
  });
});
