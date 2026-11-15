import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  Avatar,
  ConfirmDialog,
  initialsOf,
  ResizeHandle,
  Segmented,
  Sheet,
  Switch,
  Tabs,
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

describe('ConfirmDialog keyboard', () => {
  it('lets Enter on the focused cancel button cancel instead of confirming', () => {
    const calls: string[] = [];
    render(
      <ConfirmDialog
        title="Zmazať?"
        text="Koncept sa zmaže"
        confirmLabel="Zmazať"
        onConfirm={() => calls.push('ok')}
        onCancel={() => calls.push('cancel')}
      />,
    );
    const cancel = screen.getByRole('button', { name: /Zrušiť/ });
    cancel.focus();
    fireEvent.keyDown(cancel, { key: 'Enter' });
    expect(calls).toEqual([]);
    const confirm = screen.getByRole('button', { name: /Zmazať/ });
    confirm.focus();
    fireEvent.keyDown(confirm, { key: 'Enter' });
    expect(calls).toEqual(['ok']);
  });
});

function SheetHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
      >
        Otvoriť
      </button>
      {open ? (
        <Sheet
          label="Nastavenia"
          onClose={() => {
            setOpen(false);
          }}
        >
          <button type="button">Prvé</button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
            }}
          >
            Posledné
          </button>
        </Sheet>
      ) : null}
    </>
  );
}

describe('Sheet focus', () => {
  it('moves focus inside, keeps Tab there and returns focus to the opener', () => {
    render(<SheetHarness />);
    const opener = screen.getByRole('button', { name: 'Otvoriť' });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Nastavenia' });
    expect(document.activeElement).toBe(dialog);
    const first = screen.getByRole('button', { name: 'Prvé' });
    const last = screen.getByRole('button', { name: 'Posledné' });
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
    fireEvent.click(last);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});

describe('Sheet Tab boundaries', () => {
  const TABS = [
    { key: 'contact', label: 'Kontakt' },
    { key: 'ai', label: 'AI' },
    { key: 'calendar', label: 'Kalendár' },
  ] as const;

  it('wraps from the selected tab past tabs that are not Tab stops', () => {
    render(
      <Sheet label="Panel" onClose={() => undefined}>
        <button type="button">Prvé</button>
        <Tabs label="Pravý panel" items={TABS} active="contact" onSelect={() => undefined} />
      </Sheet>,
    );
    const selected = screen.getByRole('tab', { name: 'Kontakt' });
    selected.focus();
    fireEvent.keyDown(selected, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Prvé' }));
  });

  it('wraps from the last visible control past controls in a hidden container', () => {
    render(
      <Sheet label="Panel" onClose={() => undefined}>
        <button type="button">Prvé</button>
        <button type="button">Posledné</button>
        <div hidden>
          <button type="button">Skryté</button>
        </div>
      </Sheet>,
    );
    const last = screen.getByRole('button', { name: 'Posledné' });
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Prvé' }));
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
