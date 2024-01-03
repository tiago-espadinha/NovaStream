import { useTranslation } from 'react-i18next';
import type { ContentType } from '../types';
import { CONTENT_TYPE_LABELS } from '../types';

const TYPES: Array<ContentType | 'all'> = ['all', 'movie', 'tv', 'music', 'book', 'game'];

interface TypeNavProps {
  active: ContentType | 'all';
  onChange: (type: ContentType | 'all') => void;
}

export function TypeNav({ active, onChange }: TypeNavProps) {
  const { t } = useTranslation();
  return (
    <nav className="types" aria-label={t('typeNav.label')}>
      {TYPES.map((type) => (
        <button
          key={type}
          type="button"
          className={type === active ? 'active' : ''}
          aria-pressed={type === active}
          onClick={() => onChange(type)}
        >
          {type === 'all' ? t('common.all') : CONTENT_TYPE_LABELS[type]}
        </button>
      ))}
    </nav>
  );
}
