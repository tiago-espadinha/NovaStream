import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { Trans, useTranslation } from "react-i18next";
import type { ContentType } from "../types";
import type { SavedCollection } from "../utils/collections";
import { NewCollectionForm } from "./NewCollectionForm";
import { StatusIcon } from "./StatusIcon";
import { ToggleChip } from "./ToggleChip";

interface CollectionMenuProps {
  itemType: ContentType;
  /** The collections that can hold this title's format. */
  collections: SavedCollection[];
  allCollections: SavedCollection[];
  collectionIds: string[];
  ready: boolean;
  onToggleCollection: (collectionId: string) => void;
  onCreateCollection: (name: string, contentTypes: ContentType[]) => SavedCollection | null;
}

/** A compact trigger beside Save; the collection choices only appear when asked for. */
export function CollectionMenu({
  itemType,
  collections,
  allCollections,
  collectionIds,
  ready,
  onToggleCollection,
  onCreateCollection,
}: CollectionMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  // What the last creation did, kept as it happened rather than tracking later toggles.
  const [created, setCreated] = useState<{ name: string; added: boolean } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const createButtonRef = useRef<HTMLButtonElement>(null);
  const focusCreateButton = useRef(false);
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
  }, [open, creating]);

  useEffect(() => {
    if (open) return;
    setCreating(false);
    setCreated(null);
  }, [open]);

  // Leaving the form puts focus back where it was opened from.
  useEffect(() => {
    if (creating || !focusCreateButton.current) return;
    focusCreateButton.current = false;
    createButtonRef.current?.focus();
  }, [creating]);

  const closeForm = (collection: SavedCollection | null) => {
    focusCreateButton.current = true;
    setCreated(collection && { name: collection.name, added: collection.contentTypes.includes(itemType) });
    setCreating(false);
  };

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
        <span className="collection-trigger-label">{t("collections.menu.trigger")}</span>
        {count > 0 && (
          <span className="count-badge">
            <Trans
              i18nKey="collections.menu.selectedCount"
              count={count}
              components={{ hidden: <span className="visually-hidden" /> }}
            />
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
          aria-label={t("collections.menu.popover")}
        >
          {statuses.length > 0 && (
            <fieldset className="toggle-group">
              <legend>
                <Trans
                  i18nKey="collections.menu.status"
                  components={{ hint: <span className="toggle-group-hint" /> }}
                />
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
            <legend>{t("collections.menu.yours")}</legend>
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
              <p className="toggle-group-empty">{t("collections.menu.noneCover")}</p>
            )}
            <p className={`popover-created${created ? " field-success" : ""}`} role="status">
              {created && (
                <>
                  <StatusIcon tone="success" />
                  {created.added
                    ? t("collections.createdAndAdded", { name: created.name })
                    : t("collections.created", { name: created.name })}
                </>
              )}
            </p>
          </fieldset>
          {creating ? (
            <NewCollectionForm
              itemType={itemType}
              allCollections={allCollections}
              onCreate={onCreateCollection}
              onCancel={() => closeForm(null)}
              onCreated={closeForm}
            />
          ) : (
            <button
              ref={createButtonRef}
              type="button"
              className="btn btn-ghost popover-create-toggle"
              disabled={!ready}
              onClick={() => {
                setCreated(null);
                setCreating(true);
              }}
            >
              {t("collections.newCollection")}
            </button>
          )}
          <a className="collection-popover-link" href="/saved">
            {t("collections.menu.manage")}
          </a>
        </div>
      )}
    </div>
  );
}
