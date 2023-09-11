import type { ContentType } from '../types';
import { CONTENT_TYPE_LABELS } from '../types';

const TYPES: Array<ContentType | 'all'> = ['all', 'movie', 'tv', 'music', 'book', 'game'];

interface TypeNavProps {
  active: ContentType | 'all';
  onChange: (type: ContentType | 'all') => void;
}

export function TypeNav({ active, onChange }: TypeNavProps) {
  return (
    <nav className="types" aria-label="Media type">
      {TYPES.map((t) => (
        <button
          key={t}
          type="button"
          className={t === active ? 'active' : ''}
          aria-pressed={t === active}
          onClick={() => onChange(t)}
        >
          {t === 'all' ? 'All' : CONTENT_TYPE_LABELS[t]}
        </button>
      ))}
    </nav>
  );
}
