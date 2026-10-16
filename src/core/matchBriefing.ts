import { z } from 'zod';
import type { CareerState } from '../types/domain';
import { getCurrentFixture } from './careerWeeks';
import { deriveCanonicalCoachProfile } from './coachProfiles';
import { deriveSquadHierarchy } from './footballerWorld';
import { getCurrentSquadSelectionContext, getYouthSquadSelectionContext } from './youthWorld';
import { resolveEffectiveProfessionalClub } from './worldDatabase';

export const matchBriefingSchema = z.object({
  managerId: z.string(),
  formation: z.string(),
  assignedPosition: z.string().optional(),
  standing: z.enum(['starting_xi', 'bench', 'deep_reserve']),
  opponentStrength: z.string().optional(),
  instructions: z.array(z.string()).max(3),
  source: z.literal('current_canonical_squad'),
});
export const deriveCareerMatchBriefing = (career: CareerState) => {
  const club = getCurrentSquadSelectionContext(career);
  if (!club) return undefined;
  const hierarchy = deriveSquadHierarchy(career, club);
  const assignment = hierarchy.preferredXI.find((p) => p.footballerId === career.player.id);
  const substitute = hierarchy.bench.find((p) => p.footballerId === career.player.id);
  const coach = deriveCanonicalCoachProfile(club.managerId ?? 'manager');
  const fixture = getCurrentFixture(career);
  const opponent =
    fixture &&
    (career.currentProfessionalClub
      ? resolveEffectiveProfessionalClub(career, fixture.opponent.id)
      : getYouthSquadSelectionContext(career, fixture.opponent.id, career.currentSeason));
  const opponentXI = opponent ? deriveSquadHierarchy(career, opponent).preferredXI : [];
  const groups = [
    { label: 'obrona', test: (p: string) => p.includes('back') },
    { label: 'środek pola', test: (p: string) => p.includes('midfielder') },
    { label: 'atak', test: (p: string) => p.includes('winger') || p === 'striker' },
  ]
    .map((group) => {
      const players = opponentXI.filter((p) => group.test(p.position));
      return {
        label: group.label,
        quality: players.length
          ? players.reduce((sum, p) => sum + p.effectiveOverall, 0) / players.length
          : -1,
      };
    })
    .sort((a, b) => b.quality - a.quality);
  const position = assignment?.position ?? substitute?.position;
  const instructions = [
    coach.tacticalStyle === 'possession'
      ? 'Szukaj krótkiego wsparcia i wolnego adresata przed podaniem.'
      : coach.tacticalStyle === 'pressing'
        ? 'Doskok podejmuj przy realnej szansie odbioru; nie odsłaniaj środka.'
        : coach.tacticalStyle === 'counter_attacking' || coach.tacticalStyle === 'direct'
          ? 'Po odzyskaniu piłki szukaj osiągalnej przestrzeni do przodu.'
          : 'Wybieraj progresję, gdy masz wsparcie; pod presją zachowaj piłkę.',
    position?.includes('back')
      ? 'Przy wyjściu z linii sprawdzaj osłonę partnerów.'
      : position?.includes('winger')
        ? 'Szukaj przestrzeni w bocznym sektorze i podania do wspierającego partnera.'
        : position === 'goalkeeper'
          ? 'Rozpoczynaj grę do dostępnego partnera; uwzględnij nadbiegającego rywala.'
          : 'Utrzymuj opcję krótkiego podania i reaguj na wolną przestrzeń między liniami.',
  ];
  return matchBriefingSchema.parse({
    managerId: coach.personId,
    formation: hierarchy.formation,
    ...(position ? { assignedPosition: position } : {}),
    standing: assignment ? 'starting_xi' : substitute ? 'bench' : 'deep_reserve',
    ...(groups[0] && groups[0].quality >= 0
      ? {
          opponentStrength: `Najsilniejsza formacja rywala według obecnego składu: ${groups[0].label}.`,
        }
      : {}),
    instructions,
    source: 'current_canonical_squad',
  });
};
