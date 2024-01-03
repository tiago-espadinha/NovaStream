import { useTranslation } from 'react-i18next';
import type { ContentType } from '../types';
import { CONTENT_TYPE_LABELS } from '../types';
import { ToggleChip } from './ToggleChip';

export const CONTENT_TYPES = Object.keys(CONTENT_TYPE_LABELS) as ContentType[];

interface FormatChipsProps {
  selected: ContentType[];
  onChange: (selected: ContentType[]) => void;
}

/** The formats a new collection covers: an "All formats" shortcut plus one chip per format. */
export function FormatChips({ selected, onChange }: FormatChipsProps) {
  const { t } = useTranslation();
  const all = selected.length === CONTENT_TYPES.length;
  return (
    <div className="chip-row">
      <ToggleChip label={t('common.allFormats')} checked={all} onChange={() => onChange(all ? [] : CONTENT_TYPES)} />
      {CONTENT_TYPES.map((type) => (
        <ToggleChip
          key={type}
          label={CONTENT_TYPE_LABELS[type]}
          checked={selected.includes(type)}
          onChange={() => onChange(selected.includes(type)
            ? selected.filter((current) => current !== type)
            : [...selected, type])}
        />
      ))}
    </div>
  );
}
