import type {
  CareerState,
  HistoryFact,
  Id,
  ProfessionalClub,
  WorldManagerMoveRecord,
} from '../types/domain';
import { getClubStrength } from './clubStrength';
import type { ClubSeasonProjection } from './clubWorld';
import {
  coachProfileToPerson,
  deriveCanonicalCoachProfile,
  resolveClubManagerId,
} from './coachProfiles';
import { RandomGenerator } from './random/RandomGenerator';
import { emptyWorldDelta } from './worldDatabase';

const styleFit = (club: ProfessionalClub, style: string) => {
  const identity = `${club.playingStyle} ${(club.philosophyTags ?? []).join(' ')}`.toLowerCase();
  return identity.includes(style.split('_')[0]!) ? 10 : 0;
};

export const getManagerDismissalPressure = (
  club: ProfessionalClub,
  result: ClubSeasonProjection,
  expectedFinish: number,
  seed: string,
  managerId = club.managerId ?? 'manager',
) => {
  const coach = deriveCanonicalCoachProfile(managerId);
  return (
    (result.finish - expectedFinish) * 7 +
    (result.relegated ? 45 : 0) -
    (result.promoted ? 45 : 0) +
    (club.pressureLevel - 50) * 0.45 -
    (coach.reputation - 50) * 0.18 +
    RandomGenerator.fromSeed(`${seed}:manager-evaluation:${club.id}:${managerId}`).int(-12, 12)
  );
};

/** Annual, idempotent manager movement. It consumes the same table projection as club rollover. */
export const processManagerLifecycle = (
  career: CareerState,
  boundaryDate: string,
  projections: readonly ClubSeasonProjection[],
): CareerState => {
  const season = Number(boundaryDate.slice(0, 4)) - 1;
  const delta = career.worldDelta ?? emptyWorldDelta();
  if ((delta.managerLifecycleProcessedThroughSeason ?? -1) >= season) return career;
  const clubs = career.clubWorld ?? [];
  const projectionByClub = new Map(projections.map((item) => [item.clubId, item]));
  const expected = new Map<Id, number>();
  for (let tier = 1; tier <= 4; tier++)
    [...clubs]
      .filter((club) => club.leagueTier === tier)
      .sort((a, b) => getClubStrength(b) - getClubStrength(a) || a.id.localeCompare(b.id))
      .forEach((club, index) => expected.set(club.id, index + 1));

  const dismissed: { managerId: Id; club: ProfessionalClub }[] = [];
  for (const club of clubs) {
    const managerId = resolveClubManagerId(career, club.id);
    const result = projectionByClub.get(club.id);
    if (
      managerId &&
      result &&
      getManagerDismissalPressure(
        club,
        result,
        expected.get(club.id) ?? 8,
        career.seed,
        managerId,
      ) >= 30
    )
      dismissed.push({ managerId, club });
  }
  const managerOverrides = { ...delta.managerOverrides };
  const records: WorldManagerMoveRecord[] = [...(delta.managerMoveRecords ?? [])];
  const occupied = new Set(
    clubs.map((club) => resolveClubManagerId(career, club.id)).filter(Boolean) as Id[],
  );
  for (const item of dismissed) occupied.delete(item.managerId);
  const available = [
    ...dismissed.map((item) => item.managerId),
    ...Array.from({ length: 16 }, (_, index) => `manager_unattached_${index}`),
  ].filter((id, index, all) => all.indexOf(id) === index && !occupied.has(id));
  let changedCurrent: { oldId: Id; newId: Id } | undefined;
  for (const { managerId: oldId, club } of dismissed.sort((a, b) =>
    a.club.id.localeCompare(b.club.id),
  )) {
    const rng = RandomGenerator.fromSeed(`${career.seed}:manager-appointment:${season}:${club.id}`);
    const inspected = available.slice(0, Math.min(6, available.length));
    const replacement = inspected
      .map((id) => {
        const profile = deriveCanonicalCoachProfile(id);
        const level = 92 - club.leagueTier * 12;
        const score =
          -Math.abs(profile.reputation - level) * 0.6 +
          styleFit(club, profile.tacticalStyle) +
          ((profile.youthTrust - 50) * (club.youthPolicy - 50)) / 250 +
          rng.int(-14, 14);
        return { id, score };
      })
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))[0]?.id;
    if (!replacement) continue;
    available.splice(available.indexOf(replacement), 1);
    managerOverrides[club.id] = replacement;
    occupied.add(replacement);
    records.push(
      {
        id: `manager-move:${season}:${club.id}:dismissed`,
        managerId: oldId,
        date: boundaryDate,
        fromClubId: club.id,
        reason: 'dismissed',
      },
      {
        id: `manager-move:${season}:${club.id}:appointed`,
        managerId: replacement,
        date: boundaryDate,
        toClubId: club.id,
        reason: 'appointed',
      },
    );
    if (club.id === career.currentProfessionalClub?.id)
      changedCurrent = { oldId, newId: replacement };
  }
  let next: CareerState = {
    ...career,
    worldDelta: {
      ...delta,
      managerOverrides,
      managerMoveRecords: records,
      managerLifecycleProcessedThroughSeason: season,
    },
  };
  if (changedCurrent) {
    const profile = deriveCanonicalCoachProfile(changedCurrent.newId);
    const person = coachProfileToPerson(profile, career.currentProfessionalClub!, boundaryDate);
    const fact: HistoryFact = {
      id: `fact_head_coach_changed_${season}_${career.currentProfessionalClub!.id}`,
      factType: 'head_coach_changed',
      season,
      date: boundaryDate,
      actors: [career.player.id, changedCurrent.newId],
      targets: [changedCurrent.oldId],
      clubs: [career.currentProfessionalClub!.id],
      competitions: [],
      data: { previousManagerId: changedCurrent.oldId, managerId: changedCurrent.newId },
      causes: [],
      tags: ['coach', 'career'],
      visibility: 'public',
      narrativeImportance: 70,
      emotionalTone: 'neutral',
    };
    next = {
      ...next,
      significantPeople: next.significantPeople.some((p) => p.id === person.id)
        ? next.significantPeople
        : [...next.significantPeople, person],
      relationships: {
        ...next.relationships,
        [person.id]: next.relationships[person.id] ?? person.relationshipParameters,
      },
      historyFacts: next.historyFacts.some((f) => f.id === fact.id)
        ? next.historyFacts
        : [...next.historyFacts, fact],
    };
  }
  return next;
};
