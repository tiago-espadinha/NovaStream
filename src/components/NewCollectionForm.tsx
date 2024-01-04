import { useId, useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
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
    ? { field: "formats" as const, message: i18n.t("collections.includeFormat", { format: CONTENT_TYPE_LABELS[itemType] }) }
    : null;
}

/** The Saved page's new-collection form, condensed for the collections popover. */
export function NewCollectionForm({ itemType, allCollections, onCreate, onCancel, onCreated }: NewCollectionFormProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<ContentType[]>(CONTENT_TYPES);
  const [failed, setFailed] = useState(false);
  const id = useId();
  const atLimit = allCollections.filter((collection) => !collection.builtIn).length >= MAX_CUSTOM_COLLECTIONS;
  const problem = atLimit
    ? { field: "name" as const, message: t("collections.collectionLimitInSaved", { max: MAX_CUSTOM_COLLECTIONS }) }
    : newCollectionProblem(name, selectedTypes, allCollections) ?? formatProblem(selectedTypes, itemType);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const collection = onCreate(name, selectedTypes);
    if (collection) onCreated(collection);
    else setFailed(true);
  };

  // Past the checks above, creating only fails when the account's collections aren't available.
  const status = problem ?? (failed ? { message: t("collections.unavailable") } : null);

  return (
    <form className="popover-create" onSubmit={submit} aria-label={t("collections.newCollection")}>
      <label className="field-label" htmlFor={`${id}-name`}>
        {t("common.name")}
      </label>
      <input
        id={`${id}-name`}
        value={name}
        onChange={(event) => {
          setName(event.target.value);
          setFailed(false);
        }}
        placeholder={t("collections.namePlaceholder")}
        maxLength={MAX_COLLECTION_NAME}
        autoFocus
        aria-invalid={problem?.field === "name"}
        aria-describedby={`${id}-status`}
      />
      <p id={`${id}-status`} className={status ? "field-error" : "field-hint"} aria-live="polite">
        {status && <StatusIcon tone="warning" />}
        {status?.message ?? t("collections.nameHint", { max: MAX_COLLECTION_NAME })}
      </p>
      <fieldset className="toggle-group">
        <legend>{t("collections.formats")}</legend>
        <FormatChips selected={selectedTypes} onChange={setSelectedTypes} />
      </fieldset>
      <div className="popover-create-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          {t("common.cancel")}
        </button>
        <button type="submit" className="btn btn-primary" disabled={!name.trim() || Boolean(problem)}>
          {t("collections.createAndAdd")}
        </button>
      </div>
    </form>
  );
}
