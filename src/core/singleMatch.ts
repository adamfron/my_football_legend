import { z } from 'zod';
import type { FootballerProfile, ProfessionalClub, WorldDatabase } from '../types/domain';
import {
  FORMATIONS,
  getCurrentXIStrength,
  getManagerPreferredFormation,
  selectBestXI,
} from './footballerWorld';
import { getEffectivePositionOverall, getPlayerOverall } from './playerOverall';
import { RandomGenerator } from './random/RandomGenerator';

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
  footballerId: string;
  profile: FootballerProfile;
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
}
export interface SingleMatchSession {
  setup: SingleMatchSetup;
  home: SingleMatchTeam;
  away: SingleMatchTeam;
}

const buildTeam = (world: WorldDatabase, club: ProfessionalClub, seed: string) => {
  const squad = (club.squadPlayerIds ?? []).map((id) => world.footballers[id]).filter(Boolean);
  if (!squad[0]) throw new Error(`Klub ${club.name} nie ma kadry.`);
  const context = { footballerWorld: world.footballers };
  const preferred = getManagerPreferredFormation(club.managerId);
  const selected = selectBestXI(context, club, preferred);
  if (selected.assignments.length !== 11) throw new Error(`Nie udało się wybrać XI: ${club.name}.`);
  const rng = RandomGenerator.fromSeed(`${seed}:${club.id}:kickoff`);
  const players = selected.assignments.map((assignment) => {
    const profile = world.footballers[assignment.footballerId]!.profile;
    const slot = FORMATIONS[selected.formation][assignment.slotIndex]!;
    return {
      footballerId: profile.id,
      profile,
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
  };
};

const forcePlayer = (team: SingleMatchTeam, profile: FootballerProfile) => {
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
  const players = team.players.map((player) =>
    player === replacement ? { ...player, footballerId: profile.id, profile } : player,
  );
  return {
    ...team,
    players,
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
      controlled.currentClubId !== controlledClubId ||
      !(world.clubs.find((c) => c.id === controlledClubId)?.squadPlayerIds ?? []).includes(
        controlled.profile.id,
      ))
  )
    throw new Error('Wybrany piłkarz nie należy do kontrolowanego klubu.');
  let home = buildTeam(world, homeClub, setup.seed);
  let away = buildTeam(world, awayClub, setup.seed);
  if (setup.control.mode === 'player' && setup.control.forceIntoXI && controlled) {
    if (setup.control.clubId === home.club.id) home = forcePlayer(home, controlled.profile);
    else away = forcePlayer(away, controlled.profile);
  }
  return { setup, home, away };
};

export const getSingleMatchPlayerOverall = (profile: FootballerProfile) =>
  getPlayerOverall(profile, profile.primaryPosition);
