// @vitest-environment jsdom
import '../helpers/dom';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DetailStatus } from '../../src/screens/detail/DetailStatus';

function status(overrides: Partial<ComponentProps<typeof DetailStatus>> = {}) {
  const handlers = { onRetry: vi.fn(), onBack: vi.fn(), onClose: vi.fn() };
  render(<DetailStatus error={null} {...handlers} {...overrides} />);
  return handlers;
}

const failed = { message: 'The source took too long to respond.', retryable: true };

describe('DetailStatus', () => {
  it('is a labelled dialog with a spinner while loading, and no retry', () => {
    status();
    expect(screen.getByRole('dialog', { name: 'Loading details' })).toBeTruthy();
    expect(screen.getByText('Loading details…')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('names the title and says what went wrong, as an alert', () => {
    status({ error: failed, title: 'Heat' });
    expect(screen.getByRole('dialog', { name: 'Couldn’t load details' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Couldn’t load “Heat”');
    expect(screen.getByRole('alert').textContent).toContain(failed.message);
  });

  it('still reads properly when the title is unknown', () => {
    status({ error: failed });
    expect(screen.getByRole('heading', { name: 'Couldn’t load details' })).toBeTruthy();
  });

  it('retries with focus kept inside while the button goes away', () => {
    const { onRetry } = status({ error: failed });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole('dialog'));
  });

  it('offers no retry when trying again cannot help', () => {
    status({ error: { message: 'Gone', retryable: false } });
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('offers Back only with a title to return to', () => {
    const { onBack } = status({ backTo: 'The Artist' });
    fireEvent.click(screen.getByRole('button', { name: 'Back to The Artist' }));
    expect(onBack).toHaveBeenCalled();
  });

  it('closes from the button, the backdrop and Escape', () => {
    const { onClose } = status();
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('dialog').parentElement!);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
