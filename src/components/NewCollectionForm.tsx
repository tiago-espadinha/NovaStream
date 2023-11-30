import { useId, useState } from "react";
import type { FormEvent } from "react";
import type { ContentType } from "../types";
import { CONTENT_TYPE_LABELS } from "../types";
import {
  MAX_COLLECTION_NAME,
  MAX_CUSTOM_COLLECTIONS,
  newCollectionProblem,
  type SavedCollection,
} from "../utils/collections";
import { CONTENT_TYPES, FormatChips } from "./FormatChips";
import { StatusIcon } from "./StatusIcon";

interface NewCollectionFormProps {
  /** The format of the title being organized; the new collection has to cover it. */
  itemType: ContentType;
  /** Every collection, not only this format's: names are unique across all of them. */
  allCollections: SavedCollection[];
  onCreate: (name: string, contentTypes: ContentType[]) => SavedCollection | null;
  onCancel: () => void;
  onCreated: (collection: SavedCollection) => void;
}

function formatProblem(selected: ContentType[], itemType: ContentType) {
  return selected.length > 0 && !selected.includes(itemType)
    ? { field: "formats" as const, message: `Include ${CONTENT_TYPE_LABELS[itemType]} so this title can be added.` }
    : null;
}

/** The Saved page's new-collection form, condensed for the collections popover. */
export function NewCollectionForm({ itemType, allCollections, onCreate, onCancel, onCreated }: NewCollectionFormProps) {
  const [name, setName] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<ContentType[]>(CONTENT_TYPES);
  const [failed, setFailed] = useState(false);
  const id = useId();
  const atLimit = allCollections.filter((collection) => !collection.builtIn).length >= MAX_CUSTOM_COLLECTIONS;
  const problem = atLimit
    ? { field: "name" as const, message: `You can have up to ${MAX_CUSTOM_COLLECTIONS} collections. Delete one in Saved to add another.` }
    : newCollectionProblem(name, selectedTypes, allCollections) ?? formatProblem(selectedTypes, itemType);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const collection = onCreate(name, selectedTypes);
    if (collection) onCreated(collection);
    else setFailed(true);
  };

  // Past the checks above, creating only fails when the account's collections aren't available.
  const status = problem ?? (failed ? { message: "Your collections aren’t available right now." } : null);

  return (
    <form className="popover-create" onSubmit={submit} aria-label="New collection">
      <label className="field-label" htmlFor={`${id}-name`}>
        Name
      </label>
      <input
        id={`${id}-name`}
        value={name}
        onChange={(event) => {
          setName(event.target.value);
          setFailed(false);
        }}
        placeholder="e.g. Rainy Sundays"
        maxLength={MAX_COLLECTION_NAME}
        autoFocus
        aria-invalid={problem?.field === "name"}
        aria-describedby={`${id}-status`}
      />
      <p id={`${id}-status`} className={status ? "field-error" : "field-hint"} aria-live="polite">
        {status && <StatusIcon tone="warning" />}
        {status?.message ?? `Up to ${MAX_COLLECTION_NAME} characters.`}
      </p>
      <fieldset className="toggle-group">
        <legend>For</legend>
        <FormatChips selected={selectedTypes} onChange={setSelectedTypes} />
      </fieldset>
      <div className="popover-create-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={!name.trim() || Boolean(problem)}>
          Create and add
        </button>
      </div>
    </form>
  );
}
