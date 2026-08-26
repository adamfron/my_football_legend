import type { CareerState } from '../../types/domain';
import { getFactPresentation } from './factPresentation';
export const buildFirstWeekSummary = (career: CareerState): string[] => {
  const facts = career.historyFacts;
  const impression = facts.find((f) => f.factType === 'academy_first_impression');
  const training = facts.find((f) => f.factType === 'academy_training_result');
  const relation = facts.find((f) => f.factType === 'academy_relationship_turn');
  const paragraphs = [impression, training, relation]
    .filter(Boolean)
    .map((f) => getFactPresentation(career, f!).summary);
  paragraphs.push(
    `Teraz najważniejsze będzie utrzymać kierunek i wywalczyć regularne minuty dla ${career.currentClub.name} w Polskiej Lidze U-17.`,
  );
  return paragraphs.slice(0, 4);
};
