interface ToggleChipProps {
  label: string;
  checked: boolean;
  onChange: () => void;
}

/** A checkbox presented as a filter-style pill; selection shows as a doubled border and bold text, never color alone. */
export function ToggleChip({ label, checked, onChange }: ToggleChipProps) {
  return (
    <label className="choice-chip">
      <input type="checkbox" className="visually-hidden" checked={checked} onChange={onChange} />
      <ChipText label={label} />
    </label>
  );
}

/** The data-label copy reserves the bold width, so selecting a chip doesn't reflow its row. */
export function ChipText({ label }: { label: string }) {
  return (
    <span className="choice-chip-text" data-label={label}>
      {label}
    </span>
  );
}
