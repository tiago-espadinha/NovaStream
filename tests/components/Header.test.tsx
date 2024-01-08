// @vitest-environment jsdom
import '../helpers/dom';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Header } from '../../src/components/Header/Header';
import { isDialogOpen, useDialog } from '../../src/hooks/useDialog';
import { user } from '../helpers/fixtures';

function header(overrides: Partial<ComponentProps<typeof Header>> = {}) {
  return render(
    <Header
      activeType="all"
      onTypeChange={() => {}}
      query=""
      onQueryChange={() => {}}
      user={null}
      sessionStatus="signedOut"
      onOpenAuth={() => {}}
      onOpenAccount={() => {}}
      {...overrides}
    />,
  );
}

const search = () => screen.getByRole<HTMLInputElement>('searchbox', { name: 'Search titles, genres, or tags' });

describe('Header search', () => {
  it('reports typing, and shows the shortcut hint only while empty', () => {
    const onQueryChange = vi.fn();
    const { container, rerender } = header({ onQueryChange });
    expect(container.querySelector('.search-hint')).not.toBeNull();

    fireEvent.change(search(), { target: { value: 'heat' } });
    expect(onQueryChange).toHaveBeenCalledWith('heat');

    rerender(
      <Header
        activeType="all"
        onTypeChange={() => {}}
        query="heat"
        onQueryChange={onQueryChange}
        user={null}
        sessionStatus="signedOut"
        onOpenAuth={() => {}}
        onOpenAccount={() => {}}
      />,
    );
    expect(container.querySelector('.search-hint')).toBeNull();
  });

  it('clears the query and keeps focus in the search box', () => {
    const onQueryChange = vi.fn();
    header({ query: 'heat', onQueryChange });
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(onQueryChange).toHaveBeenCalledWith('');
    expect(document.activeElement).toBe(search());
  });

  it('describes a keyword search to screen readers', () => {
    header({ query: 'genre: Drama' });
    expect(search().getAttribute('aria-describedby')).toBe('search-keyword');
    expect(screen.getByText('Searching by genre')).toBeTruthy();
  });

  it('does not reload the page on Enter', () => {
    header();
    expect(fireEvent.submit(screen.getByRole('search'))).toBe(false);
  });

  it('focuses the search box from the keyboard shortcut', () => {
    header();
    expect(fireEvent.keyDown(document, { key: 'k', ctrlKey: true })).toBe(false);
    expect(document.activeElement).toBe(search());
  });

  it('leaves the shortcut alone while a dialog is open', () => {
    expect(isDialogOpen()).toBe(false);
    function Dialog() {
      const ref = useDialog<HTMLDivElement>(() => {});
      return <div ref={ref} tabIndex={-1} />;
    }
    render(<Dialog />);
    header();
    expect(fireEvent.keyDown(document, { key: 'k', ctrlKey: true })).toBe(true);
    expect(document.activeElement).not.toBe(search());
  });

  it('has no search or type tabs on the Saved page, and marks Saved as current', () => {
    header({ savedPage: true });
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Media type' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Saved' }).getAttribute('aria-current')).toBe('page');
    expect(fireEvent.keyDown(document, { key: 'k', ctrlKey: true })).toBe(true);
  });
});

describe('Header account button', () => {
  it('offers sign-in when signed out', () => {
    const onOpenAuth = vi.fn();
    header({ onOpenAuth });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(onOpenAuth).toHaveBeenCalled();
  });

  it('is busy and disabled while a stored session is checked', () => {
    header({ sessionStatus: 'checking' });
    const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Signing in…' });
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
  });

  it('opens settings when signed in, naming the account', () => {
    const onOpenAccount = vi.fn();
    header({ sessionStatus: 'signedIn', user, onOpenAccount });
    fireEvent.click(screen.getByRole('button', { name: 'Account settings (Ana)' }));
    expect(onOpenAccount).toHaveBeenCalled();
  });

  it('still opens settings when the server is unreachable and the name is unknown', () => {
    header({ sessionStatus: 'unreachable' });
    expect(screen.getByRole('button', { name: 'Account settings' })).toBeTruthy();
    expect(screen.getByText('Account')).toBeTruthy();
  });
});

describe('Header type tabs', () => {
  it('reports a chosen type and marks the active one', () => {
    const onTypeChange = vi.fn();
    header({ activeType: 'movie', onTypeChange });
    expect(screen.getByRole('button', { name: 'Movies' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Books' }));
    expect(onTypeChange).toHaveBeenCalledWith('book');
  });
});
