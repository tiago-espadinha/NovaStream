import type { MediaSummary } from '../types';
import { ContentCard } from './ContentCard';

interface ContentGridProps {
  items: MediaSummary[];
  onSelect: (id: string) => void;
}

export function ContentGrid({ items, onSelect }: ContentGridProps) {
  if (items.length === 0) {
    return <div className="empty-state">No matches. Try a different search or category.</div>;
  }

  return (
    <ul className="grid">
      {items.map((item) => (
        <li key={item.id}>
          <ContentCard item={item} onSelect={onSelect} />
        </li>
      ))}
    </ul>
  );
}
