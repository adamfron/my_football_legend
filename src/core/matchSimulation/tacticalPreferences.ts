import { isRestartSetup } from './restartPhase';
import { z } from 'zod';
import {
  clampPitchPoint,
  distance,
  distanceToSegment,
  pitchPointSchema,
  type PitchPoint,
  type TeamSide,
} from './matchSpace';
import type { MatchPlayerState, TacticalMatchState, TacticalStyle } from './matchState';
import { angleForVector, normalizeAngle } from './playerOrientation';

const unit = z.number().min(0).max(1).finite();
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const mean = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0.5;

/** Coach intent, independent of formation and physical execution. Every axis has one job. */
export const tacticalPreferencesSchema = z.object({
  blockHeight: unit,
  organisedPress: unit,
  counterpress: unit,
  compactness: unit,
  possessionPatience: unit,
  verticality: unit,
});
export type TacticalPreferences = z.infer<typeof tacticalPreferencesSchema>;

export const TACTICAL_PREFERENCE_DEFAULTS: Record<TacticalStyle, TacticalPreferences> = {
  balanced: {
    blockHeight: 0.5,
    organisedPress: 0.5,
    counterpress: 0.5,
    compactness: 0.5,
    possessionPatience: 0.5,
    verticality: 0.5,
  },
  possession: {
    blockHeight: 0.58,
    organisedPress: 0.58,
    counterpress: 0.62,
    compactness: 0.7,
    possessionPatience: 0.85,
    verticality: 0.32,
  },
  direct: {
    blockHeight: 0.54,
    organisedPress: 0.45,
    counterpress: 0.48,
    compactness: 0.36,
    possessionPatience: 0.25,
    verticality: 0.85,
  },
  counter_attacking: {
    blockHeight: 0.32,
    organisedPress: 0.28,
    counterpress: 0.25,
    compactness: 0.8,
    possessionPatience: 0.35,
    verticality: 0.9,
  },
  pressing: {
    blockHeight: 0.72,
    organisedPress: 0.92,
    counterpress: 0.9,
    compactness: 0.82,
    possessionPatience: 0.4,
    verticality: 0.7,
  },
};

export const tacticalSuitabilitySchema = z.object({
  centralCirculation: unit,
  channelTransition: unit,
  pressingCapacity: unit,
  recoveryCover: unit,
  preferredPressCost: unit,
  preferredLineRisk: unit,
});
export type TacticalSuitability = z.infer<typeof tacticalSuitabilitySchema>;

/** Continuous capability costs are exposed, not eligibility gates or stamina depletion. */
export const deriveTacticalSuitability = (
  state: TacticalMatchState,
  side: TeamSide,
): TacticalSuitability => {
  const roster = state.players.filter(
    (player) =>
      player.team === side &&
      player.profile.primaryPosition !== 'goalkeeper' &&
      !state.discipline?.[player.id]?.sentOff,
  );
  const central = roster.filter(
    (player) =>
      player.slot.position.includes('midfielder') &&
      !player.slot.position.startsWith('left') &&
      !player.slot.position.startsWith('right'),
  );
  const channels = roster.filter((player) =>
    ['left_winger', 'right_winger', 'left_midfielder', 'right_midfielder', 'striker'].includes(
      player.slot.position,
    ),
  );
  const cover = roster.filter(
    (player) => player.duty === 'defend' || player.slot.position === 'center_back',
  );
  const centralCirculation = mean(
    (central.length ? central : roster).map(
      ({ profile: { attributes: a } }) =>
        (a.passing + a.technique + a.firstTouch + a.gameReading + a.positioning) / 500,
    ),
  );
  const channelTransition = mean(
    (channels.length ? channels : roster).map(
      ({ profile: { attributes: a } }) =>
        (a.pace * 2 + a.agility + a.dribbling + a.positioning) / 500,
    ),
  );
  const pressingCapacity = mean(
    roster
      .filter((player) => player.duty !== 'defend')
      .map(
        ({ profile: { attributes: a } }) =>
          (a.pace + a.agility + a.stamina + a.aggression + a.gameReading + a.concentration) / 600,
      ),
  );
  const recoveryCover = mean(
    (cover.length ? cover : roster).map(
      ({ profile: { attributes: a } }) =>
        (a.pace + a.agility + a.positioning + a.gameReading) / 400,
    ),
  );
  const preferences =
    state.teams[side].tacticalPreferences ?? TACTICAL_PREFERENCE_DEFAULTS[state.teams[side].style];
  return {
    centralCirculation,
    channelTransition,
    pressingCapacity,
    recoveryCover,
    preferredPressCost: preferences.organisedPress * (1 - pressingCapacity),
    preferredLineRisk: preferences.blockHeight * (1 - recoveryCover),
  };
};

/** Small adaptation preserves philosophy while accounting for the actual XI's relative abilities. */
export const deriveTeamTacticalPreferences = (
  state: TacticalMatchState,
  side: TeamSide,
): TacticalPreferences => {
  const preferred =
    state.teams[side].tacticalPreferences ?? TACTICAL_PREFERENCE_DEFAULTS[state.teams[side].style];
  const suitability = deriveTacticalSuitability(state, side);
  const channelAdvantage = suitability.channelTransition - suitability.centralCirculation;
  return {
    blockHeight: clamp(
      preferred.blockHeight -
        preferred.blockHeight * Math.max(0, 0.62 - suitability.recoveryCover) * 0.45,
    ),
    organisedPress: clamp(preferred.organisedPress * (0.62 + suitability.pressingCapacity * 0.55)),
    counterpress: clamp(preferred.counterpress * (0.58 + suitability.pressingCapacity * 0.6)),
    compactness: preferred.compactness,
    possessionPatience: clamp(preferred.possessionPatience - channelAdvantage * 0.3),
    verticality: clamp(preferred.verticality + channelAdvantage * 0.35),
  };
};

export const pressingOpportunitySchema = z.object({
  mode: z.enum(['organised_press', 'counterpress', 'mid_block', 'low_block']),
  engagement: unit,
  transitionOpportunity: unit,
  safeOutletCount: z.number().int().nonnegative().max(21),
  coverQuality: unit,
  riskBehind: unit,
  screenTarget: pitchPointSchema,
  triggers: z.object({
    heavyTouch: unit,
    poorOrientation: unit,
    touchline: unit,
    isolation: unit,
    numericalAdvantage: unit,
  }),
});
export type PressingOpportunity = z.infer<typeof pressingOpportunitySchema>;

/** Bounded local tactical anticipation. No resolver outcome, success draw or fixed transition deadline. */
export const derivePressingOpportunity = (
  state: TacticalMatchState,
  side: TeamSide,
): PressingOpportunity => {
  const preferences = deriveTeamTacticalPreferences(state, side);
  const carrier = state.players.find((player) => player.id === state.ball.ownerId);
  const empty: PressingOpportunity = {
    mode: preferences.blockHeight < 0.4 ? 'low_block' : 'mid_block',
    engagement: 0,
    transitionOpportunity: 0,
    safeOutletCount: 0,
    coverQuality: 0,
    riskBehind: 0,
    screenTarget: { x: 52.5, y: 34 },
    triggers: {
      heavyTouch: 0,
      poorOrientation: 0,
      touchline: 0,
      isolation: 0,
      numericalAdvantage: 0,
    },
  };
  if (!carrier || carrier.team === side || isRestartSetup(state)) return empty;
  const defenders = state.players.filter(
    (player) =>
      player.team === side &&
      player.profile.primaryPosition !== 'goalkeeper' &&
      !state.discipline?.[player.id]?.sentOff,
  );
  const receivers = state.players.filter(
    (player) =>
      player.team === carrier.team &&
      player.id !== carrier.id &&
      !state.discipline?.[player.id]?.sentOff &&
      distance(player.position, carrier.position) <= 29,
  );
  const outlets = receivers
    .map((receiver) => {
      const clearance = Math.min(
        15,
        ...defenders.map((player) => distance(player.position, receiver.position)),
      );
      const lane = Math.min(
        8,
        ...defenders
          .filter((player) => distance(player.position, carrier.position) > 2.3)
          .map((player) => distanceToSegment(player.position, carrier.position, receiver.position)),
      );
      const receptionFacing = angleForVector({
        x: carrier.position.x - receiver.position.x,
        y: carrier.position.y - receiver.position.y,
      });
      const readiness =
        1 -
        (Math.abs(normalizeAngle(receptionFacing - receiver.facingAngle)) / Math.PI) * 0.3 -
        (1 - receiver.profile.attributes.firstTouch / 100) * 0.25;
      return {
        receiver,
        clearance,
        lane,
        readiness,
        quality: clamp((clearance - 1.5) / 5) * clamp((lane - 0.7) / 3) * readiness,
      };
    })
    .sort((a, b) => b.quality - a.quality || a.receiver.id.localeCompare(b.receiver.id));
  const safeOutletCount = outlets.filter((outlet) => outlet.quality >= 0.35).length;
  const opponentDir = carrier.team === 'home' ? 1 : -1;
  const cover = defenders.filter(
    (player) =>
      opponentDir * (player.position.x - carrier.position.x) > 3 &&
      Math.abs(player.position.y - 34) < 24 &&
      distance(player.position, carrier.position) < 36,
  );
  const coverQuality =
    clamp(cover.length / 3) *
    (0.45 +
      mean(
        cover.map(
          ({ profile: { attributes: a } }) => (a.pace + a.positioning + a.gameReading) / 300,
        ),
      ) *
        0.55);
  const localDefenders = defenders.filter(
    (player) => distance(player.position, carrier.position) < 11,
  ).length;
  const localSupport = receivers.filter(
    (player) => distance(player.position, carrier.position) < 13,
  ).length;
  const preparation = state.onBallPreparation;
  const heavyTouch = clamp(
    (distance(state.ball, carrier.position) - 0.7) / 1.3 +
      (preparation?.actorId === carrier.id &&
      preparation.receptionKind === 'heavy_touch' &&
      preparation.readyAt > state.time
        ? 0.6
        : 0),
  );
  const attackingFacing = carrier.team === 'home' ? Math.PI / 2 : -Math.PI / 2;
  const poorOrientation = Math.abs(normalizeAngle(carrier.facingAngle - attackingFacing)) / Math.PI;
  const touchline = clamp((8 - Math.min(carrier.position.y, 68 - carrier.position.y)) / 8);
  const isolation = 1 - clamp(safeOutletCount / 3);
  const numericalAdvantage = clamp((localDefenders - localSupport) / 3);
  const progress = carrier.team === 'home' ? carrier.position.x : 105 - carrier.position.x;
  const riskBehind = clamp(
    (1 - coverQuality) * 0.6 + preferences.blockHeight * 0.2 + Math.max(0, progress - 55) / 60,
  );
  const loss = state.lastPossessionLoss;
  const change = state.lastPossessionChange;
  const lossAt =
    loss?.from === side &&
    loss.to === carrier.team &&
    !['shot', 'foul_stoppage'].includes(loss.cause)
      ? loss.at
      : change?.from === side && change.to === carrier.team
        ? change.at
        : state.teams[side].phase === 'defensive_transition'
          ? state.time - state.timeSincePossessionChanged
          : undefined;
  // Stable connected outlets indicate reorganisation; geometry can close the window early or
  // preserve a useful local recovery opportunity after eight seconds. Time only decays value.
  const transitionOpportunity =
    lossAt !== undefined
      ? Math.exp(-Math.max(0, state.time - lossAt) / 6) *
        clamp(0.18 + numericalAdvantage * 0.55 + isolation * 0.5)
      : 0;
  const trigger =
    heavyTouch * 0.75 +
    poorOrientation * 0.18 +
    touchline * 0.22 +
    isolation * 0.25 +
    numericalAdvantage * 0.25;
  const lineAccess = clamp((progress - (64 - preferences.blockHeight * 44)) / 22);
  const engagement = clamp(
    0.08 +
      preferences.organisedPress * (0.13 + lineAccess * 0.18 + trigger * 0.52) +
      preferences.counterpress * transitionOpportunity * 0.75 +
      heavyTouch * 0.28 +
      coverQuality * 0.13 -
      Math.min(3, safeOutletCount) * 0.105 -
      riskBehind * 0.15,
  );
  const outlet = outlets[0]?.receiver;
  const screenTarget = clampPitchPoint(
    outlet
      ? {
          x: carrier.position.x * 0.4 + outlet.position.x * 0.6,
          y: carrier.position.y * 0.4 + outlet.position.y * 0.6,
        }
      : { x: carrier.position.x + opponentDir * 5, y: carrier.position.y * 0.55 + 34 * 0.45 },
  );
  return {
    mode:
      transitionOpportunity * preferences.counterpress > 0.16
        ? 'counterpress'
        : engagement >= 0.4 && preferences.blockHeight >= 0.48
          ? 'organised_press'
          : empty.mode,
    engagement,
    transitionOpportunity,
    safeOutletCount,
    coverQuality,
    riskBehind,
    screenTarget,
    triggers: { heavyTouch, poorOrientation, touchline, isolation, numericalAdvantage },
  };
};

/** Cost of a proposed route, for ranking only; current stamina is never depleted here. */
export const deriveEconomicalMovementCost = (player: MatchPlayerState, target: PitchPoint) => {
  const a = player.profile.attributes;
  const metres = distance(player.position, target);
  if (metres < 0.05) return 0;
  const speed = Math.hypot(player.velocity.x, player.velocity.y);
  const turn =
    Math.abs(
      normalizeAngle(
        angleForVector({ x: target.x - player.position.x, y: target.y - player.position.y }) -
          player.facingAngle,
      ),
    ) / Math.PI;
  return (
    metres * (0.025 + (1 - (a.stamina + a.agility) / 200) * 0.055) +
    turn * (0.3 + speed * 0.12) * (1 - a.agility / 200)
  );
};
