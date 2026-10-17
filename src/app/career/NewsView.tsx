import { useMemo } from 'react';
import { buildCareerNews } from '../../core/narrative/careerStories';
import type { CareerState } from '../../types/domain';
const categories = {
  achievement: 'Osiągnięcia',
  club: 'Klub',
  transfer: 'Kontrakty i transfery',
  development: 'Rozwój',
  health: 'Zdrowie',
  season: 'Sezon',
};
export const NewsView = ({ career }: { career: CareerState }) => {
  const news = useMemo(() => buildCareerNews(career), [career]);
  return (
    <section className="career-news">
      <h2>Wiadomości piłkarskie</h2>
      <p>Wydarzenia z symulowanego świata i twojej kariery.</p>
      {news.length ? (
        news.map((n) => (
          <details key={n.id}>
            <summary>
              <time>{n.date.split('-').reverse().join('.')}</time> · <strong>{n.headline}</strong>
            </summary>
            <p>{n.summary}</p>
            <small>
              {categories[n.category]}
              {n.clubName ? ` · ${n.clubName}` : ''}
            </small>
          </details>
        ))
      ) : (
        <p>Brak istotnych wiadomości.</p>
      )}
    </section>
  );
};
