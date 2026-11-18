// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { HtmlMailFrame } from '../src/features/thread/HtmlMailFrame';

describe('remote image control in the mail frame', () => {
  afterEach(() => {
    cleanup();
  });

  it('offers to show images when an alt with a closing bracket precedes a remote src', () => {
    render(
      <HtmlMailFrame html={'<img alt="A > B" src="https://cdn.example.com/a.png">'} title="Mail" />,
    );

    expect(screen.getByRole('button', { name: 'Zobraziť obrázky' })).toBeDefined();
  });

  it('does not offer it for a mail with only attached images', () => {
    render(<HtmlMailFrame html={'<img alt="A > B" src="cid:logo@mail">'} title="Mail" />);

    expect(screen.queryByRole('button', { name: 'Zobraziť obrázky' })).toBeNull();
  });
});
