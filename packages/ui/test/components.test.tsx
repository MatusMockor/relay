import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  Avatar,
  ConfirmDialog,
  initialsOf,
  ResizeHandle,
  Segmented,
  Switch,
  hasOpenLayer,
} from '../src';

afterEach(() => {
  cleanup();
});

describe('Avatar', () => {
  it('derives Slovak-aware initials from names and addresses', () => {
    expect(initialsOf('Eva Šimková')).toBe('EŠ');
    expect(initialsOf('gitlab@firma.sk')).toBe('GF');
    expect(initialsOf('Katka')).toBe('K');
    const { container } = render(<Avatar name="Martin Hudec" size="lg" />);
    expect(container.querySelector('.av.lg')?.textContent).toBe('MH');
  });
});

function SwitchHarness() {
  const [on, setOn] = useState(false);
  return <Switch checked={on} label="Notifikácie" onChange={setOn} />;
}

describe('Switch and Segmented', () => {
  it('toggles aria-checked', () => {
    render(<SwitchHarness />);
    const toggle = screen.getByRole('switch', { name: 'Notifikácie' });
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-checked')).toBe('true');
  });

  it('reports the picked option', () => {
    const picked: string[] = [];
    render(
      <Segmented
        label="Hustota"
        value="normal"
        options={[
          { value: 'compact', label: 'Kompaktná' },
          { value: 'normal', label: 'Normálna' },
        ]}
        onChange={(value) => picked.push(value)}
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Kompaktná' }));
    expect(picked).toEqual(['compact']);
  });
});

describe('ConfirmDialog', () => {
  it('confirms with Enter and registers a key layer while open', () => {
    const calls: string[] = [];
    const { unmount } = render(
      <ConfirmDialog
        title="Odoslať?"
        text="Ahoj"
        confirmLabel="Odoslať"
        onConfirm={() => calls.push('ok')}
        onCancel={() => calls.push('cancel')}
      />,
    );
    expect(hasOpenLayer()).toBe(true);
    fireEvent.keyDown(document, { key: 'Enter' });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(calls).toEqual(['ok', 'cancel']);
    unmount();
    expect(hasOpenLayer()).toBe(false);
  });
});

describe('ResizeHandle', () => {
  it('resizes with arrow keys inside the limits', () => {
    const widths: number[] = [];
    render(
      <ResizeHandle
        edge="left"
        label="Šírka priečinkov"
        controls="fold"
        width={350}
        limits={{ min: 180, max: 360, initial: 214, cut: 120 }}
        onResize={(width) => widths.push(width)}
        onCollapse={() => widths.push(0)}
        onCommit={() => undefined}
      />,
    );
    const handle = screen.getByRole('separator', { name: 'Šírka priečinkov' });
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    fireEvent.keyDown(handle, { key: 'Enter' });
    expect(widths).toEqual([360, 334, 214]);
  });
});
