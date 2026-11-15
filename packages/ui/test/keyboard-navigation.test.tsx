import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { Segmented, Tabs } from '../src';

afterEach(() => {
  cleanup();
});

const DENSITY = [
  { value: 'compact', label: 'Kompaktná' },
  { value: 'normal', label: 'Normálna' },
  { value: 'roomy', label: 'Vzdušná' },
] as const;

type Density = (typeof DENSITY)[number]['value'];

function SegmentedHarness() {
  const [value, setValue] = useState<Density>('compact');
  return <Segmented<Density> label="Hustota" value={value} options={DENSITY} onChange={setValue} />;
}

const TABS = [
  { key: 'contact', label: 'Kontakt' },
  { key: 'ai', label: 'AI' },
  { key: 'calendar', label: 'Kalendár' },
] as const;

type Tab = (typeof TABS)[number]['key'];

function TabsHarness() {
  const [active, setActive] = useState<Tab>('contact');
  return <Tabs<Tab> label="Pravý panel" items={TABS} active={active} onSelect={setActive} />;
}

describe('Segmented keyboard', () => {
  it('moves the selection with arrow keys, wraps and keeps one tab stop', () => {
    render(<SegmentedHarness />);
    const compact = screen.getByRole('radio', { name: 'Kompaktná' });
    const roomy = screen.getByRole('radio', { name: 'Vzdušná' });
    expect(screen.getAllByRole('radio').map((radio) => radio.tabIndex)).toEqual([0, -1, -1]);
    compact.focus();

    fireEvent.keyDown(compact, { key: 'ArrowLeft' });

    expect(roomy.getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(roomy);
    expect(screen.getAllByRole('radio').map((radio) => radio.tabIndex)).toEqual([-1, -1, 0]);

    fireEvent.keyDown(roomy, { key: 'ArrowDown' });

    expect(compact.getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(compact);
  });
});

describe('Segmented keyboard with a pending selection', () => {
  it('moves from the focused option while the selected value has not updated yet', () => {
    const picked: string[] = [];
    render(
      <Segmented<Density>
        label="Hustota"
        value="compact"
        options={DENSITY}
        onChange={(value) => picked.push(value)}
      />,
    );
    const compact = screen.getByRole('radio', { name: 'Kompaktná' });
    compact.focus();

    fireEvent.keyDown(compact, { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Normálna' }), { key: 'ArrowRight' });

    expect(picked).toEqual(['normal', 'roomy']);
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Vzdušná' }));
  });
});

describe('Tabs keyboard', () => {
  it('moves between tabs with Left, Right, Home and End and uses a roving tab index', () => {
    render(<TabsHarness />);
    const contact = screen.getByRole('tab', { name: 'Kontakt' });
    const ai = screen.getByRole('tab', { name: 'AI' });
    const calendar = screen.getByRole('tab', { name: 'Kalendár' });
    expect([contact.tabIndex, ai.tabIndex, calendar.tabIndex]).toEqual([0, -1, -1]);
    contact.focus();

    fireEvent.keyDown(contact, { key: 'ArrowRight' });

    expect(ai.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(ai);
    expect([contact.tabIndex, ai.tabIndex, calendar.tabIndex]).toEqual([-1, 0, -1]);

    fireEvent.keyDown(ai, { key: 'End' });
    expect(document.activeElement).toBe(calendar);
    fireEvent.keyDown(calendar, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(contact);
    expect(contact.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(contact, { key: 'ArrowDown' });
    expect(contact.getAttribute('aria-selected')).toBe('true');
  });
});
