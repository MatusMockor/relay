// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CollapsedMessage, MessageView } from '../src/features/thread/MessageView';
import { serverDetail, serverThread } from './support/thread-fixtures';

const sent = () => {
  const [message] = serverDetail(serverThread('Ponuka'), [], {
    message: { from: { name: 'Sam Doe', email: 'sam@firma.sk' } },
  }).messages;
  expect(message).toBeDefined();
  return message;
};

describe('avatar of a message the user sent', () => {
  afterEach(() => {
    cleanup();
  });

  it('uses the initials of the account that sent the message', () => {
    const message = sent();
    if (message === undefined) {
      return;
    }
    render(<MessageView message={message} mine recipientName="Peter" />);

    const article = screen.getByRole('article', { name: 'Správa od Ty' });
    expect(article.querySelector('.av')?.textContent).toBe('SD');
  });

  it('uses the same initials in the collapsed message', () => {
    const message = sent();
    if (message === undefined) {
      return;
    }
    const { container } = render(<CollapsedMessage message={message} mine onExpand={() => {}} />);

    expect(container.querySelector('.av')?.textContent).toBe('SD');
  });
});
