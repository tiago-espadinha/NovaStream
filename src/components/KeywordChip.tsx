import type { QueryKeyword } from '../utils/contentFilters';

interface KeywordChipProps {
  kind: QueryKeyword;
  value: string;
}

/** A recognised `genre:` or `tag:` search. The label is uppercased visually, so screen readers get plain text instead. */
export function KeywordChip({ kind, value }: KeywordChipProps) {
  return (
    <span className="keyword-chip">
      <span className="keyword-kind" aria-hidden="true">
        {kind}
      </span>
      <span className="visually-hidden">{kind}:</span> {value}
    </span>
  );
}
