import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { MediaSummary } from '../types';
import { ContentCard } from './ContentCard';

interface ShelfProps {
  id: string;
  title: string;
  items: MediaSummary[];
  isFavorite: (id: string) => boolean;
  onToggleFavorite: (item: MediaSummary) => void;
  onSelect: (id: string) => void;
  /** 2 when the shelf stands alone on the page, 3 when it sits under a section heading. */
  level?: 2 | 3;
  /** A final tile after the cards, e.g. a link to the full list. */
  endAction?: ReactNode;
  /** Loading or problem message under the heading; with no items it replaces the cards. */
  notice?: ReactNode;
}

export function Shelf({
  id,
  title,
  items,
  isFavorite,
  onToggleFavorite,
  onSelect,
  level = 3,
  endAction,
  notice,
}: ShelfProps) {
  const Heading = level === 2 ? 'h2' : 'h3';
  const trackRef = useRef<HTMLUListElement>(null);
  const prevRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);
  const stopGlideRef = useRef<() => void>(() => {});

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const update = () => {
      const start = track.scrollLeft <= 1;
      const end = track.scrollLeft + track.clientWidth >= track.scrollWidth - 1;
      // An arrow disappears at its edge; hand focus to the other one instead of dropping it.
      if (end && document.activeElement === nextRef.current && !start) prevRef.current?.focus();
      if (start && document.activeElement === prevRef.current && !end) nextRef.current?.focus();
      setAtStart(start);
      setAtEnd(end);
    };
    // Shift + wheel scrolls sideways. Wheel steps add to a target that the track eases toward,
    // so a notched mouse glides instead of jumping.
    let target = track.scrollLeft;
    let frame = 0;
    const glide = () => {
      const distance = target - track.scrollLeft;
      // scrollLeft snaps to whole pixels, so steps under 1px would never arrive.
      if (Math.abs(distance) <= 1) {
        track.scrollLeft = target;
        frame = 0;
        return;
      }
      track.scrollLeft += Math.sign(distance) * Math.max(1, Math.abs(distance) * 0.2);
      frame = requestAnimationFrame(glide);
    };
    const stopGlide = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };
    stopGlideRef.current = stopGlide;
    const onWheel = (event: WheelEvent) => {
      if (!event.shiftKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      const max = track.scrollWidth - track.clientWidth;
      const delta = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * 40 : event.deltaY;
      target = Math.min(max, Math.max(0, (frame ? target : track.scrollLeft) + delta));
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        track.scrollLeft = target;
        return;
      }
      if (!frame) frame = requestAnimationFrame(glide);
    };
    update();
    track.addEventListener('scroll', update, { passive: true });
    track.addEventListener('wheel', onWheel, { passive: false });
    track.addEventListener('touchstart', stopGlide, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(track);
    return () => {
      track.removeEventListener('scroll', update);
      track.removeEventListener('wheel', onWheel);
      track.removeEventListener('touchstart', stopGlide);
      stopGlide();
      observer.disconnect();
    };
  }, [items]);

  const scrollByPage = (direction: -1 | 1) => {
    const track = trackRef.current;
    if (!track) return;
    stopGlideRef.current();
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    track.scrollBy({ left: direction * track.clientWidth * 0.85, behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  const titleId = `${id}-title`;
  const trackId = `${id}-track`;
  const edges = `${atStart ? '' : ' fade-start'}${atEnd ? '' : ' fade-end'}`;

  return (
    <section className="shelf" aria-labelledby={titleId}>
      <div className="shelf-head">
        {/* Focusable from code so a retry inside the shelf can keep focus here. */}
        <Heading id={titleId} tabIndex={-1}>{title}</Heading>
        {items.length > 0 && (
          <span className="shelf-count">
            {items.length} {items.length === 1 ? 'title' : 'titles'}
          </span>
        )}
      </div>
      {notice}
      {items.length > 0 && (
        <div className="shelf-viewport">
          <button
            ref={prevRef}
            type="button"
            className="shelf-arrow shelf-arrow-prev"
            aria-label={`Scroll ${title} back`}
            aria-controls={trackId}
            hidden={atStart}
            onClick={() => scrollByPage(-1)}
          >
            <span aria-hidden="true">‹</span>
          </button>
          <ul id={trackId} ref={trackRef} className={`shelf-track${edges}`}>
            {items.map((item) => (
              <li key={item.id}>
                <ContentCard
                  item={item}
                  favorite={isFavorite(item.id)}
                  onToggleFavorite={onToggleFavorite}
                  onSelect={onSelect}
                  headingLevel={level === 2 ? 3 : 4}
                />
              </li>
            ))}
            {endAction && <li className="shelf-end">{endAction}</li>}
          </ul>
          <button
            ref={nextRef}
            type="button"
            className="shelf-arrow shelf-arrow-next"
            aria-label={`Scroll ${title} forward`}
            aria-controls={trackId}
            hidden={atEnd}
            onClick={() => scrollByPage(1)}
          >
            <span aria-hidden="true">›</span>
          </button>
        </div>
      )}
    </section>
  );
}
