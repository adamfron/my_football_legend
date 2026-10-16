import { z } from 'zod';
import { deriveNpcPlayStyles } from './npcFootballIdentity';
import type {
  FootballerProfile,
  ProfessionalClub,
  WorldDatabase,
  WorldFootballer,
  PlayStyleId,
} from '../types/domain';
import type { MatchInjury } from './matchSimulation/matchInjuries';
import {
  FORMATIONS,
  getCurrentXIStrength,
  selectBestXI,
  selectMatchBench,
  type SquadSelectionWorld,
} from './footballerWorld';
import { getEffectivePositionOverall, getPlayerOverall } from './playerOverall';
import { RandomGenerator } from './random/RandomGenerator';
import { toCanonicalFootballProfile, type MatchVisualContext } from './visualIdentity';

export const singleMatchSetupSchema = z
  .object({
    homeClubId: z.string().min(1),
    awayClubId: z.string().min(1),
    control: z.discriminatedUnion('mode', [
      z.object({ mode: z.literal('spectator') }),
      z.object({
        mode: z.literal('player'),
        clubId: z.string().min(1),
        footballerId: z.string().min(1),
        forceIntoXI: z.boolean(),
      }),
    ]),
    seed: z.string().min(1),
  })
  .superRefine((setup, context) => {
    if (setup.homeClubId === setup.awayClubId)
      context.addIssue({ code: 'custom', path: ['awayClubId'], message: 'Kluby muszą być różne.' });
    if (
      setup.control.mode === 'player' &&
      ![setup.homeClubId, setup.awayClubId].includes(setup.control.clubId)
    )
      context.addIssue({
        code: 'custom',
        path: ['controlledClubId'],
        message: 'Kontrolowany klub musi grać w meczu.',
      });
  });

export type SingleMatchSetup = z.infer<typeof singleMatchSetupSchema>;
export interface SingleMatchPlayer {
  playStyles?: PlayStyleId[] | undefined;
  footballerId: string;
  profile: FootballerProfile;
  /** Temporary condition, separate from permanent football attributes. */
  condition?: number | undefined;
  injury?: MatchInjury | undefined;
  slotIndex: number;
  slot: (typeof FORMATIONS)[keyof typeof FORMATIONS][number];
  x: number;
  y: number;
}
export interface SingleMatchTeam {
  club: ProfessionalClub;
  formation: keyof typeof FORMATIONS;
  strength: number;
  players: SingleMatchPlayer[];
  bench?: {
    playStyles?: PlayStyleId[] | undefined;
    footballerId: string;
    profile: FootballerProfile;
    condition: number;
    injury?: MatchInjury | undefined;
  }[];
}
export interface SingleMatchSession {
  setup: SingleMatchSetup;
  home: SingleMatchTeam;
  away: SingleMatchTeam;
  presentation?: MatchVisualContext | undefined;
}

const preMatchInjury = (player: WorldFootballer): MatchInjury | undefined => {
  const condition = player.condition;
  if (!condition?.injuryStatus || !condition.injuryUntilDate) return;
  const recoveryDays = Math.max(
    0,
    Math.min(
      28,
      Math.ceil(
        (Date.parse(condition.injuryUntilDate) - Date.parse(condition.lastUpdatedDate)) /
          86_400_000,
      ),
    ),
  );
  return {
    id: `${player.profile.id}:pre-existing:${condition.injuryUntilDate}`,
    playerId: player.profile.id,
    at: 0,
    status: condition.injuryStatus,
    mechanism: 'movement',
    injuryType: 'muscle',
    recoveryDays,
    assessmentRequired: false,
  };
};
const buildTeam = (
  world: WorldDatabase,
  club: ProfessionalClub,
  seed: string,
  selection?: Pick<SquadSelectionWorld, 'player' | 'selectionStanding'>,
): SingleMatchTeam => {
  const squad = (club.squadPlayerIds ?? [])
    .map((id) => world.footballers[id])
    .filter(
      (player) =>
        player &&
        player.careerStatus === 'active' &&
        player.currentClubId === club.id &&
        !['unable', 'absence'].includes(player.condition?.injuryStatus ?? ''),
    );
  if (!squad[0]) throw new Error(`Klub ${club.name} nie ma kadry.`);
  const context = { ...selection, footballerWorld: world.footballers };
  const eligibleClub = { ...club, squadPlayerIds: squad.map((player) => player!.profile.id) };
  const selected = selectBestXI(context, eligibleClub);
  if (selected.assignments.length !== 11) throw new Error(`Nie udało się wybrać XI: ${club.name}.`);
  const rng = RandomGenerator.fromSeed(`${seed}:${club.id}:kickoff`);
  const players = selected.assignments.map((assignment) => {
    const profile = world.footballers[assignment.footballerId]!.profile;
    const slot = FORMATIONS[selected.formation][assignment.slotIndex]!;
    const injury = preMatchInjury(world.footballers[profile.id]!);
    return {
      footballerId: profile.id,
      playStyles: deriveNpcPlayStyles(world.footballers[profile.id]!).map((value) => value.style),
      profile,
      condition: world.footballers[profile.id]?.fitness ?? 100,
      ...(injury ? { injury } : {}),
      slotIndex: assignment.slotIndex,
      slot,
      x: (1 - slot.y / 100) * 105 + rng.int(-2, 2) / 2,
      y: (slot.x / 100) * 68 + rng.int(-2, 2) / 2,
    };
  });
  return {
    club,
    formation: selected.formation,
    strength: getCurrentXIStrength(selected.assignments)!,
    players,
    bench: selectMatchBench(context, eligibleClub, selected.assignments, 9).map((assignment) => {
      const player = world.footballers[assignment.footballerId]!;
      const injury = preMatchInjury(player);
      return {
        footballerId: player.profile.id,
        playStyles: deriveNpcPlayStyles(player).map((value) => value.style),
        profile: player.profile,
        condition: player.fitness ?? 100,
        ...(injury ? { injury } : {}),
      };
    }),
  };
};

const forcePlayer = (
  team: SingleMatchTeam,
  profile: FootballerProfile,
  condition = 100,
  injury?: MatchInjury,
) => {
  if (team.players.some((player) => player.footballerId === profile.id)) return team;
  const slots = FORMATIONS[team.formation];
  const replacement = team.players.reduce((best, player) =>
    getEffectivePositionOverall(profile, slots[player.slotIndex]!.position) -
      getEffectivePositionOverall(player.profile, slots[player.slotIndex]!.position) >
    getEffectivePositionOverall(profile, slots[best.slotIndex]!.position) -
      getEffectivePositionOverall(best.profile, slots[best.slotIndex]!.position)
      ? player
      : best,
  );
  const players = team.players.map((player) => {
    if (player !== replacement) return player;
    const { injury: _displacedInjury, ...slot } = player;
    void _displacedInjury;
    return { ...slot, footballerId: profile.id, profile, condition, ...(injury ? { injury } : {}) };
  });
  return {
    ...team,
    players,
    bench: [
      ...(team.bench ?? []).filter((player) => player.footballerId !== profile.id),
      {
        footballerId: replacement.footballerId,
        profile: replacement.profile,
        condition: replacement.condition ?? 100,
        ...(replacement.injury ? { injury: replacement.injury } : {}),
      },
    ].slice(0, 9),
    strength: getCurrentXIStrength(
      players.map((player) => ({
        effectiveOverall: getEffectivePositionOverall(player.profile, player.slot.position),
      })),
    )!,
  };
};

export const createSingleMatchSession = (
  world: WorldDatabase,
  input: SingleMatchSetup,
  date = '2026-07-01',
  selection?: Pick<SquadSelectionWorld, 'player' | 'selectionStanding'>,
): SingleMatchSession => {
  const setup = singleMatchSetupSchema.parse(input);
  const homeClub = world.clubs.find((club) => club.id === setup.homeClubId);
  const awayClub = world.clubs.find((club) => club.id === setup.awayClubId);
  if (!homeClub || !awayClub) throw new Error('Nie znaleziono wybranego klubu.');
  const controlled =
    setup.control.mode === 'player' ? world.footballers[setup.control.footballerId] : undefined;
  const controlledClubId = setup.control.mode === 'player' ? setup.control.clubId : undefined;
  if (
    setup.control.mode === 'player' &&
    (!controlled ||
      controlled.careerStatus !== 'active' ||
      ['unable', 'absence'].includes(controlled.condition?.injuryStatus ?? '') ||
      controlled.currentClubId !== controlledClubId ||
      !(world.clubs.find((c) => c.id === controlledClubId)?.squadPlayerIds ?? []).includes(
        controlled.profile.id,
      ))
  )
    throw new Error('Wybrany piłkarz nie należy do kontrolowanego klubu.');
  let home = buildTeam(world, homeClub, setup.seed, selection);
  let away = buildTeam(world, awayClub, setup.seed, selection);
  if (setup.control.mode === 'player' && setup.control.forceIntoXI && controlled) {
    if (setup.control.clubId === home.club.id)
      home = forcePlayer(home, controlled.profile, controlled.fitness, preMatchInjury(controlled));
    else
      away = forcePlayer(away, controlled.profile, controlled.fitness, preMatchInjury(controlled));
  }
  const presentation: MatchVisualContext = {
    date,
    visualIdentities: Object.fromEntries(
      [...home.players, ...away.players, ...(home.bench ?? []), ...(away.bench ?? [])]
        .filter((player) => player.profile.visualIdentity)
        .map((player) => [player.footballerId, player.profile.visualIdentity!]),
    ),
  };
  const footballTeam = (team: SingleMatchTeam): SingleMatchTeam => ({
    ...team,
    players: team.players.map((player) => ({
      ...player,
      profile: toCanonicalFootballProfile(player.profile),
    })),
    ...(team.bench
      ? {
          bench: team.bench.map((player) => ({
            ...player,
            profile: toCanonicalFootballProfile(player.profile),
          })),
        }
      : {}),
  });
  return { setup, home: footballTeam(home), away: footballTeam(away), presentation };
};

export const getSingleMatchPlayerOverall = (profile: FootballerProfile) =>
  getPlayerOverall(profile, profile.primaryPosition);
