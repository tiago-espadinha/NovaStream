// @vitest-environment jsdom
import '../helpers/dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AccountNotices, type AccountNotice } from '../../src/components/AccountNotices/AccountNotices';

const notice = (overrides: Partial<AccountNotice> = {}): AccountNotice => ({
  id: 'n1',
  message: 'Something happened',
  tone: 'error',
  onDismiss: () => {},
  ...overrides,
});

describe('AccountNotices', () => {
  it('stays mounted as a polite live region when empty, so later messages are announced', () => {
    render(<AccountNotices notices={[]} />);
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.childElementCount).toBe(0);
  });

  it('shows each message in its tone', () => {
    render(<AccountNotices notices={[notice(), notice({ id: 'n2', message: 'All good', tone: 'success' })]} />);
    const region = screen.getByRole('status');
    expect(within(region).getByText('Something happened').closest('.notice-error')).not.toBeNull();
    expect(within(region).getByText('All good').closest('.notice-success')).not.toBeNull();
  });

  it('names what each Dismiss button dismisses, and calls back', () => {
    const onDismiss = vi.fn();
    render(<AccountNotices notices={[notice({ onDismiss })]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss: Something happened' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('runs the action only when a notice has one', () => {
    const onClick = vi.fn();
    const { rerender } = render(<AccountNotices notices={[notice({ action: { label: 'Try again', onClick } })]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(<AccountNotices notices={[notice()]} />);
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('removes the height it published when it goes away', () => {
    document.documentElement.style.setProperty('--notice-space', '40px');
    const { unmount } = render(<AccountNotices notices={[]} />);
    unmount();
    expect(document.documentElement.style.getPropertyValue('--notice-space')).toBe('');
  });
});
