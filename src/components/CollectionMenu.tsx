import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { SavedCollection } from "../utils/collections";
import { ToggleChip } from "./ToggleChip";

interface CollectionMenuProps {
  collections: SavedCollection[];
  collectionIds: string[];
  onToggleCollection: (collectionId: string) => void;
}

/** A compact trigger beside Save; the collection choices only appear when asked for. */
export function CollectionMenu({ collections, collectionIds, onToggleCollection }: CollectionMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ placement: "below" | "above"; maxHeight?: number }>({
    placement: "below",
  });
  const popoverId = useId();
  const statuses = collections.filter((collection) => collection.builtIn);
  const custom = collections.filter((collection) => !collection.builtIn);
  const count = collections.filter((collection) => collectionIds.includes(collection.id)).length;

  // Open toward whichever side of the trigger has more room, and cap the height to that room,
  // so a short detail panel or a short window never cuts the popover off.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !popoverRef.current) return;
    const gap = 8;
    const trigger = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - trigger.bottom - gap * 2;
    const spaceAbove = trigger.top - gap * 2;
    const height = popoverRef.current.scrollHeight;
    const placement = height > spaceBelow && spaceAbove > spaceBelow ? "above" : "below";
    const room = placement === "above" ? spaceAbove : spaceBelow;
    setPosition({ placement, maxHeight: height > room ? Math.max(room, 160) : undefined });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);

  // Escape closes only the popover, not the surrounding detail dialog.
  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key !== "Escape" || !open) return;
    event.stopPropagation();
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div className="collection-menu" ref={rootRef} onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        className={`btn btn-ghost collection-trigger${count > 0 ? " active" : ""}`}
        aria-expanded={open}
        aria-controls={popoverId}
        onClick={() => setOpen((current) => !current)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 6h16M4 12h10M4 18h7M18 15v6M15 18h6" />
        </svg>
        <span className="collection-trigger-label">Collections</span>
        {count > 0 && (
          <span className="count-badge">
            {count}
            <span className="visually-hidden"> selected</span>
          </span>
        )}
      </button>

      {open && (
        <div
          ref={popoverRef}
          id={popoverId}
          className="collection-popover"
          data-placement={position.placement}
          style={{ maxHeight: position.maxHeight }}
          role="group"
          aria-label="Collections for this title"
        >
          {statuses.length > 0 && (
            <fieldset className="toggle-group">
              <legend>
                Status <span className="toggle-group-hint">· pick one</span>
              </legend>
              <div className="chip-row">
                {statuses.map((collection) => (
                  <ToggleChip
                    key={collection.id}
                    label={collection.name}
                    checked={collectionIds.includes(collection.id)}
                    onChange={() => onToggleCollection(collection.id)}
                  />
                ))}
              </div>
            </fieldset>
          )}
          <fieldset className="toggle-group">
            <legend>Your collections</legend>
            {custom.length > 0 ? (
              <div className="chip-row">
                {custom.map((collection) => (
                  <ToggleChip
                    key={collection.id}
                    label={collection.name}
                    checked={collectionIds.includes(collection.id)}
                    onChange={() => onToggleCollection(collection.id)}
                  />
                ))}
              </div>
            ) : (
              <p className="toggle-group-empty">None cover this format yet.</p>
            )}
          </fieldset>
          <a className="collection-popover-link" href="/saved">
            Manage collections in Saved
          </a>
        </div>
      )}
    </div>
  );
}
