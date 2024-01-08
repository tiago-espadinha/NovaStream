// @vitest-environment jsdom
import '../helpers/dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { isDialogOpen, useDialog } from '../../src/hooks/useDialog';

function Panel({ label, onClose, autofocus = false }: { label: string; onClose: () => void; autofocus?: boolean }) {
  const ref = useDialog<HTMLDivElement>(onClose);
  return (
    <div ref={ref} role="dialog" aria-label={label} tabIndex={-1}>
      <button type="button">{label} first</button>
      <button type="button" data-autofocus={autofocus || undefined}>
        {label} middle
      </button>
      <button type="button">{label} last</button>
    </div>
  );
}

function Opener({ onClose = () => {} }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen((current) => !current)}>
        opener
      </button>
      {open && <Panel label="panel" onClose={onClose} />}
    </>
  );
}

const button = (name: string) => screen.getByRole('button', { name });

function openPanel() {
  button('opener').focus();
  fireEvent.click(button('opener'));
}

describe('useDialog', () => {
  it('moves focus to the first control, or to one marked for autofocus', () => {
    const first = render(<Panel label="a" onClose={() => {}} />);
    expect(document.activeElement).toBe(button('a first'));
    first.unmount();

    render(<Panel label="b" onClose={() => {}} autofocus />);
    expect(document.activeElement).toBe(button('b middle'));
  });

  it('focuses the panel itself when it has no controls', () => {
    function Empty() {
      const ref = useDialog<HTMLDivElement>(() => {});
      return <div ref={ref} role="dialog" tabIndex={-1} />;
    }
    render(<Empty />);
    expect(document.activeElement).toBe(screen.getByRole('dialog'));
  });

  it('wraps Tab and Shift+Tab inside the panel', () => {
    render(<Panel label="a" onClose={() => {}} />);

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(button('a last'));

    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(button('a first'));
  });

  it('leaves Tab alone between the first and last controls', () => {
    render(<Panel label="a" onClose={() => {}} autofocus />);
    expect(fireEvent.keyDown(document, { key: 'Tab' })).toBe(true);
  });

  it('pulls focus back in when the focused control is gone', () => {
    render(
      <>
        <button type="button">outside</button>
        <Panel label="a" onClose={() => {}} />
      </>,
    );
    button('outside').focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(button('a first'));
  });

  it('closes on Escape, using the newest callback', () => {
    const stale = vi.fn();
    const current = vi.fn();
    const { rerender } = render(<Panel label="a" onClose={stale} />);
    rerender(<Panel label="a" onClose={current} />);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(current).toHaveBeenCalledTimes(1);
    expect(stale).not.toHaveBeenCalled();
  });

  it('answers only in the top panel when dialogs are stacked', () => {
    const lower = vi.fn();
    const top = vi.fn();
    render(
      <>
        <Panel label="lower" onClose={lower} />
        <Panel label="top" onClose={top} />
      </>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(top).toHaveBeenCalledTimes(1);
    expect(lower).not.toHaveBeenCalled();
  });

  it('locks page scroll while open and tells others a dialog is open', () => {
    document.body.style.overflow = 'scroll';
    render(<Opener />);
    expect(isDialogOpen()).toBe(false);

    openPanel();
    expect(document.body.style.overflow).toBe('hidden');
    expect(isDialogOpen()).toBe(true);

    fireEvent.click(button('opener'));
    expect(document.body.style.overflow).toBe('scroll');
    expect(isDialogOpen()).toBe(false);
    document.body.style.overflow = '';
  });

  it('returns focus to the opener on close', () => {
    render(<Opener />);
    openPanel();
    expect(document.activeElement).toBe(button('panel first'));

    fireEvent.click(button('opener'));
    expect(document.activeElement).toBe(button('opener'));
  });

  it('falls back to the marked element when the opener has gone', () => {
    function Page() {
      // As when a genre search re-renders the results: the opener goes while the dialog closes.
      const [state, setState] = useState<'closed' | 'open' | 'done'>('closed');
      return (
        <>
          <h2 tabIndex={-1} data-focus-fallback>
            fallback
          </h2>
          {state !== 'done' && (
            <button type="button" onClick={() => setState('open')}>
              opener
            </button>
          )}
          {state === 'open' && <Panel label="panel" onClose={() => setState('done')} />}
        </>
      );
    }
    render(<Page />);
    openPanel();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'fallback' }));
  });
});
