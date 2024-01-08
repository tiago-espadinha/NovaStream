// @vitest-environment jsdom
import '../helpers/dom';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Shelf } from '../../src/components/Shelf/Shelf';
import { media } from '../helpers/fixtures';

const items = [media('movie-1', { title: 'Heat' }), media('movie-2', { title: 'Ronin' })];

function shelf(overrides: Partial<ComponentProps<typeof Shelf>> = {}) {
  return render(
    <Shelf
      id="shelf-test"
      title="Picks"
      items={items}
      isFavorite={() => false}
      onToggleFavorite={() => {}}
      onSelect={() => {}}
      {...overrides}
    />,
  );
}

/** Gives the track a measured size, which jsdom doesn't do. */
function measure(track: HTMLElement, { scrollLeft = 0, clientWidth = 100, scrollWidth = 500 } = {}) {
  Object.defineProperties(track, {
    clientWidth: { configurable: true, value: clientWidth },
    scrollWidth: { configurable: true, value: scrollWidth },
  });
  track.scrollLeft = scrollLeft;
  fireEvent.scroll(track);
}

const track = (container: HTMLElement) => container.querySelector<HTMLElement>('#shelf-test-track')!;
// By label: roles aren't computed for an arrow while it is hidden, which is the point of these tests.
const arrow = (name: string) => screen.getByLabelText(name);

describe('Shelf', () => {
  it('is a section named by its heading, at the level it is told', () => {
    shelf({ level: 2 });
    expect(screen.getByRole('region', { name: 'Picks' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Picks' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: 'Heat' })).toBeTruthy();
  });

  it('sits below a section heading by default, moving its cards down too', () => {
    shelf();
    expect(screen.getByRole('heading', { level: 3, name: 'Picks' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 4, name: 'Heat' })).toBeTruthy();
  });

  it('counts its titles and passes actions through to the cards', () => {
    const onSelect = vi.fn();
    shelf({ onSelect });
    expect(screen.getByText('2 titles')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ronin' }));
    expect(onSelect).toHaveBeenCalledWith('movie-2');
  });

  it('with no titles shows only its notice: no count, no list, no arrows', () => {
    const { container } = shelf({ items: [], notice: <p>Loading…</p> });
    expect(screen.getByText('Loading…')).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
    expect(container.querySelector('.shelf-count')).toBeNull();
    expect(container.querySelector('.shelf-arrow')).toBeNull();
  });

  it('adds a final tile after the cards', () => {
    shelf({ endAction: <a href="/saved">See all</a> });
    expect(screen.getAllByRole('listitem').at(-1)?.textContent).toBe('See all');
  });

  it('shows only the arrows that can move, with fades to match', () => {
    const { container } = shelf();
    const list = track(container);
    expect(arrow('Scroll Picks forward').hidden).toBe(true);
    expect(arrow('Scroll Picks back').hidden).toBe(true);

    measure(list);
    expect(arrow('Scroll Picks forward').hidden).toBe(false);
    expect(arrow('Scroll Picks back').hidden).toBe(true);
    expect(list.className).toContain('fade-end');
    expect(list.className).not.toContain('fade-start');

    measure(list, { scrollLeft: 400 });
    expect(arrow('Scroll Picks forward').hidden).toBe(true);
    expect(arrow('Scroll Picks back').hidden).toBe(false);
    expect(list.className).toContain('fade-start');
  });

  it('hands focus to the other arrow when the focused one disappears', () => {
    const { container } = shelf();
    const list = track(container);
    measure(list, { scrollLeft: 200 });
    arrow('Scroll Picks forward').focus();

    measure(list, { scrollLeft: 400 });
    expect(document.activeElement).toBe(arrow('Scroll Picks back'));
  });

  it('scrolls most of a page per click, smoothly unless motion is reduced', () => {
    const { container } = shelf();
    const list = track(container);
    measure(list, { scrollLeft: 100 });
    const scrollBy = vi.fn();
    list.scrollBy = scrollBy;

    fireEvent.click(arrow('Scroll Picks forward'));
    expect(scrollBy).toHaveBeenLastCalledWith({ left: 85, behavior: 'smooth' });

    Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: true }) });
    fireEvent.click(arrow('Scroll Picks back'));
    expect(scrollBy).toHaveBeenLastCalledWith({ left: -85, behavior: 'auto' });
  });

  it('turns Shift + wheel into a sideways scroll, and leaves a plain wheel alone', () => {
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: true }) });
    const { container } = shelf();
    const list = track(container);
    measure(list);

    expect(fireEvent.wheel(list, { deltaY: 120 })).toBe(true);
    expect(list.scrollLeft).toBe(0);

    expect(fireEvent.wheel(list, { deltaY: 120, shiftKey: true })).toBe(false);
    expect(list.scrollLeft).toBe(120);

    fireEvent.wheel(list, { deltaY: 9999, shiftKey: true });
    expect(list.scrollLeft).toBe(400);
  });
});
