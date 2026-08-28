import type { CareerState, HistoryFact } from '../../types/domain';

export interface FactPresentation {
  title: string;
  summary: string;
  toneLabel: string;
  participantNames: string[];
  clubName?: string;
}
const tones: Record<HistoryFact['emotionalTone'], string> = {
  positive: 'Pozytywny',
  negative: 'Trudny',
  neutral: 'Neutralny',
  bittersweet: 'Słodko-gorzki',
};
const labels: Record<string, string> = {
  career_started: 'Początek kariery',
  first_professional_contract: 'Pierwszy profesjonalny kontrakt',
  season_completed: 'Sezon zakończony',
  attribute_changed: 'Rozwój zawodnika',
  play_style_unlocked: 'Nowy styl gry',
  retired: 'Zakończenie kariery',
};
export const getFactPresentation = (career: CareerState, fact: HistoryFact): FactPresentation => {
  const participantNames = [...fact.actors, ...fact.targets].map((id) => {
    if (id === career.player.id) return `${career.player.firstName} ${career.player.lastName}`;
    const person = career.significantPeople.find((item) => item.id === id);
    return person ? `${person.firstName} ${person.lastName}` : id;
  });
  const clubName = fact.clubs.includes(career.currentClub.id) ? career.currentClub.name : undefined;
  const title = labels[fact.factType] ?? 'Wydarzenie kariery';
  const summary =
    fact.factType === 'career_started'
      ? `Rozpocząłeś pierwszy sezon w ${career.currentClub.name}.`
      : fact.factType === 'first_professional_contract'
        ? `Podpisałeś pierwszy profesjonalny kontrakt z ${String(fact.data.clubName ?? clubName ?? 'klubem')}.`
        : `Kanoniczny zapis wydarzenia: ${fact.factType.replaceAll('_', ' ')}.`;
  return {
    title,
    summary,
    toneLabel: tones[fact.emotionalTone],
    participantNames,
    ...(clubName ? { clubName } : {}),
  };
};
