import type { MediaSummary } from '../types';
import { ContentCard } from './ContentCard';

interface ContentGridProps {
  items: MediaSummary[];
}

export function ContentGrid({ items }: ContentGridProps) {
  if (items.length === 0) {
    return <div className="empty-state">No matches. Try a different search or category.</div>;
  }

  return (
    <ul className="grid">
      {items.map((item) => (
        <li key={item.id}>
          <ContentCard item={item} />
        </li>
      ))}
    </ul>
  );
}
