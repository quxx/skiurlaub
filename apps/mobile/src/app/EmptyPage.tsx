import type { LucideIcon } from 'lucide-react';
import { Compass } from 'lucide-react';
import { Link } from 'react-router';

export function EmptyPage({
  title,
  description,
  icon: Icon = Compass,
}: {
  title: string;
  description: string;
  icon?: LucideIcon;
}) {
  const missing = title === 'Seite nicht gefunden';
  return (
    <section className="empty-page">
      <div className="empty-card">
        <span className="empty-icon" aria-hidden="true">
          <Icon size={36} strokeWidth={1.5} />
        </span>
        <h2>{missing ? 'Diese Seite gibt es nicht' : `Noch keine ${title}`}</h2>
        {!missing && <span className="empty-chip">Noch nicht verfügbar</span>}
        <p>{description}</p>
        <Link to="/">Zur Übersicht</Link>
      </div>
    </section>
  );
}
