import { z } from 'zod';
import { RandomGenerator } from '../random/RandomGenerator';
import { deriveLooseBallAssignments } from './looseBallPhysics';
import {
  clampPitchPoint,
  distance,
  distanceToSegment,
  formationSlotToTeamSpace,
  PITCH_LENGTH,
  type PitchPoint,
  type TeamSide,
} from './matchSpace';
import type { MatchPlayerState, TacticalMatchState, TacticalStyle } from './matchState';
import { restartInfluence } from './restartGeometry';
import { deriveGoalkeeperBasePosition } from './goalkeeperPositioning';
import {
  deriveCooperativePress,
  derivePressingPlan,
  protectedPressReceiver,
} from './defensiveChallenges';
import { deriveBuildUpReliefWeight, threatChannel } from './teamThreatMemory';

export interface TacticalStyleParameters {
  width: number;
  compactness: number;
  lineHeight: number;
  supportDistance: number;
  ballShift: number;
  pressing: number;
  forwardRuns: number;
  transitionUrgency: number;
  freedom: number;
}
export const TACTICAL_STYLE_PARAMETERS: Record<TacticalStyle, TacticalStyleParameters> = {
  possession: {
    width: 1.02,
    compactness: 0.83,
    lineHeight: 0.58,
    supportDistance: 0.72,
    ballShift: 0.42,
    pressing: 0.58,
    forwardRuns: 0.48,
    transitionUrgency: 0.55,
    freedom: 0.55,
  },
  balanced: {
    width: 1,
    compactness: 1,
    lineHeight: 0.5,
    supportDistance: 1,
    ballShift: 0.4,
    pressing: 0.5,
    forwardRuns: 0.55,
    transitionUrgency: 0.55,
    freedom: 0.4,
  },
  direct: {
    width: 0.96,
    compactness: 1.18,
    lineHeight: 0.54,
    supportDistance: 1.25,
    ballShift: 0.3,
    pressing: 0.45,
    forwardRuns: 0.82,
    transitionUrgency: 0.8,
    freedom: 0.5,
  },
  counter_attacking: {
    width: 0.9,
    compactness: 0.88,
    lineHeight: 0.32,
    supportDistance: 1.15,
    ballShift: 0.5,
    pressing: 0.38,
    forwardRuns: 0.9,
    transitionUrgency: 0.95,
    freedom: 0.42,
  },
  pressing: {
    width: 0.88,
    compactness: 0.76,
    lineHeight: 0.72,
    supportDistance: 0.8,
    ballShift: 0.72,
    pressing: 0.92,
    forwardRuns: 0.65,
    transitionUrgency: 0.9,
    freedom: 0.48,
  },
};
const direction = (side: TeamSide) => (side === 'home' ? 1 : -1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Match-only resting transform: formation data describes shape, never literal pitch occupation. */
export const deriveNeutralFormationAnchor = (
  player: Pick<MatchPlayerState, 'slot' | 'team' | 'profile'>,
): PitchPoint => {
  const relative = formationSlotToTeamSpace(player.slot);
  if (player.profile.primaryPosition === 'goalkeeper')
    return { x: player.team === 'home' ? 5.5 : 99.5, y: 34 };
  const ownHalfX = 16 + relative.depth * 39;
  return {
    x: player.team === 'home' ? ownHalfX : PITCH_LENGTH - ownHalfX,
    y: 34 + relative.lateral * 26 * direction(player.team),
  };
};

/** Smooth radial influence: approximately 0.9 at 10m, 0.5 at 25m and negligible at 50m. */
export const ballReactionWeight = (metres: number) =>
  Math.exp(-Math.pow(Math.max(0, metres) / 30, 2));

export interface TeamBlockTransform {
  advance: number;
  lateral: number;
  widthScale: number;
  depthScale: number;
  centre: PitchPoint;
}
export const deriveTeamBlockTransform = (
  state: TacticalMatchState,
  side: TeamSide,
): TeamBlockTransform => {
  const owns = state.possessionTeam === side,
    parameters = TACTICAL_STYLE_PARAMETERS[state.teams[side].style];
  const response = state.teams[side].threatMemory?.response;
  const dir = direction(side),
    ballDepth = dir * (state.ball.x - PITCH_LENGTH / 2);
  const transition = state.teams[side].phase.includes('transition')
    ? Math.min(1, state.teams[side].phaseElapsed / 3)
    : 1;
  const sustained = owns ? Math.min(1, state.timeSincePossessionChanged / 8) : 0;
  const stableAdvance = owns
    ? 7 + parameters.lineHeight * 5 + ballDepth * 0.16 + sustained * 7
    : -2 + parameters.lineHeight * 3 + ballDepth * 0.08 - Math.max(0, -ballDepth - 10) * 0.35;
  const advance = stableAdvance * (0.7 + 0.3 * transition) - (response?.lineDepthMetres ?? 0);
  const lateral = (state.ball.y - 34) * parameters.ballShift * 0.34;
  const widthScale =
    parameters.width * (owns ? 1 : 0.82) * (1 - (response?.compactness ?? 0) * 0.2);
  const depthScale =
    (owns ? 0.98 : 0.82) *
    (state.teams[side].phase.includes('transition') ? 1.08 : 1) *
    (1 - (response?.compactness ?? 0) * 0.1);
  return {
    advance,
    lateral,
    widthScale,
    depthScale,
    centre: { x: 52.5 + dir * advance, y: 34 + lateral },
  };
};

/** Selects only the best few temporary departures from the formation structure. */
export const deriveAttackingRunIds = (state: TacticalMatchState, side: TeamSide) => {
  if (state.possessionTeam !== side || !state.ball.ownerId) return [];
  const carrier = state.players.find((p) => p.id === state.ball.ownerId)!;
  const urgency = state.teams[side].phase === 'attacking_transition' ? 1.25 : 1;
  return state.players
    .filter(
      (p) =>
        p.team === side &&
        p.id !== carrier.id &&
        p.profile.primaryPosition !== 'goalkeeper' &&
        p.duty !== 'defend',
    )
    .map((p) => ({
      p,
      score:
        (urgency *
          (p.profile.attributes.gameReading +
            p.profile.attributes.positioning +
            p.profile.attributes.pace +
            p.profile.attributes.concentration)) /
          4 -
        distance(p.position, carrier.position) * 0.45 +
        (p.duty === 'attack' ? 12 : 0),
    }))
    .filter(({ score }) => score > 43)
    .sort((a, b) => b.score - a.score || a.p.id.localeCompare(b.p.id))
    .slice(
      0,
      state.teams[side].phase === 'attacking_transition' ||
        direction(side) * (state.ball.x - 52.5) > 18
        ? 3
        : 2,
    )
    .map(({ p }) => p.id);
};

export const finalThirdOccupationSchema = z.enum([
  'near_post',
  'penalty_spot',
  'far_post',
  'edge_support',
  'wide_support',
  'rest_defence',
]);
export type FinalThirdOccupation = z.infer<typeof finalThirdOccupationSchema>;

export interface FinalThirdOccupationAssignment {
  playerId: string;
  occupation: FinalThirdOccupation;
  target: PitchPoint;
}

/**
 * Allocates a bounded box structure independently from central and flank run budgets.
 */
export const deriveFinalThirdOccupations = (
  state: TacticalMatchState,
  side: TeamSide,
): FinalThirdOccupationAssignment[] => {
  if (state.possessionTeam !== side || !state.ball.ownerId) return [];
  const dir = direction(side);
  const depth = dir * (state.ball.x - 52.5);
  if (depth < 18 || state.timeSincePossessionChanged < 1.2) return [];
  const carrier = state.players.find((player) => player.id === state.ball.ownerId);
  if (!carrier?.team || carrier.team !== side) return [];
  const flankRunnerIds = new Set(
    deriveFlankRunAssignments(state, side).map(({ playerId }) => playerId),
  );
  const runners = state.players
    .filter(
      (player) =>
        player.team === side &&
        player.id !== carrier.id &&
        player.profile.primaryPosition !== 'goalkeeper' &&
        !isWideDefender(player) &&
        !flankRunnerIds.has(player.id) &&
        player.duty !== 'defend',
    )
    .sort((a, b) => {
      const aScore = dir * (a.position.x - 52.5) + a.profile.attributes.positioning / 10;
      const bScore = dir * (b.position.x - 52.5) + b.profile.attributes.positioning / 10;
      return bScore - aScore || a.id.localeCompare(b.id);
    })
    .slice(0, 3);
  const offside = calculateOffsideLine(state, side);
  const goalX = side === 'home' ? 105 : 0;
  const boxX = side === 'home' ? 92 : 13;
  const edgeX = side === 'home' ? 85.5 : 19.5;
  const ballSide = state.ball.y < 34 ? -1 : 1;
  const wide = Math.abs(state.ball.y - 34) >= 15;
  const assignments: FinalThirdOccupationAssignment[] = [];
  const assign = (
    player: MatchPlayerState | undefined,
    occupation: FinalThirdOccupation,
    point: PitchPoint,
  ) => {
    if (!player) return;
    assignments.push({
      playerId: player.id,
      occupation,
      target: constrainTargetOnside(clampPitchPoint(point), offside, side, 1.1),
    });
  };
  const central = runners.find((player) => !isWideDefender(player));
  assign(central, 'near_post', { x: goalX - dir * 7, y: 34 + ballSide * 4.5 });
  const second = runners.find((player) => player.id !== central?.id && !isWideDefender(player));
  if (wide)
    assign(
      second,
      Math.abs((second?.neutralAnchor.y ?? 34) - 34) > 12 ? 'far_post' : 'penalty_spot',
      {
        x: boxX,
        y: second && Math.sign(second.neutralAnchor.y - 34) === -ballSide ? 34 - ballSide * 11 : 34,
      },
    );
  else assign(second, 'edge_support', { x: edgeX, y: 34 - ballSide * 7 });
  const third = runners.find(
    (player) => player.id !== central?.id && player.id !== second?.id && !isWideDefender(player),
  );
  if (wide) assign(third, 'edge_support', { x: edgeX, y: 34 - ballSide * 6 });
  return assignments;
};

const isWideDefender = (p: MatchPlayerState) =>
  ['left_back', 'right_back', 'left_wing_back', 'right_wing_back'].includes(p.slot.position);

const isWideAttacker = (p: MatchPlayerState) =>
  ['left_winger', 'right_winger', 'left_midfielder', 'right_midfielder'].includes(p.slot.position);

export const flankRelationshipSchema = z.enum([
  'support_behind',
  'provide_width',
  'overlap',
  'underlap',
  'rest_defence',
]);
export type FlankRelationship = z.infer<typeof flankRelationshipSchema>;

export const flankRunAssignmentSchema = z.object({
  playerId: z.string(),
  relationship: z.enum(['overlap', 'underlap', 'provide_width']),
});
export type FlankRunAssignment = z.infer<typeof flankRunAssignmentSchema>;

/** Dedicated relational flank budget: one committed side, with explicit cover behind the ball. */
export const deriveFlankRunAssignments = (state: TacticalMatchState, side: TeamSide) => {
  if (state.possessionTeam !== side || !state.ball.ownerId) return [];
  const dir = direction(side);
  const candidates = state.players
    .filter((player) => player.team === side && isWideDefender(player) && player.duty !== 'defend')
    .map((fullback) => {
      const flankSign = Math.sign(fullback.neutralAnchor.y - 34);
      const winger = state.players.find(
        (player) =>
          player.team === side &&
          isWideAttacker(player) &&
          Math.sign(player.neutralAnchor.y - 34) === flankSign,
      );
      const cover = state.players.filter(
        (player) =>
          player.team === side &&
          player.id !== fullback.id &&
          player.profile.primaryPosition !== 'goalkeeper' &&
          dir * (player.position.x - state.ball.x) < -5,
      ).length;
      const ballSide = Math.sign(state.ball.y - 34) === flankSign;
      if (!winger || cover < 2 || !ballSide || state.teams[side].phase === 'defensive_transition')
        return undefined;
      const wingerWide = Math.abs(winger.position.y - 34) >= 20;
      const outside = { x: winger.position.x + dir * 8, y: 34 + flankSign * 30 };
      const outsideSpace = Math.min(
        ...state.players
          .filter((player) => player.team !== side)
          .map((player) => distance(player.position, outside)),
      );
      const relationship: FlankRunAssignment['relationship'] = !wingerWide
        ? 'provide_width'
        : outsideSpace > 5
          ? 'overlap'
          : 'underlap';
      return {
        playerId: fullback.id,
        relationship,
        score: (ballSide ? 20 : 0) + cover * 3 + outsideSpace,
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    .sort((a, b) => b.score - a.score || a.playerId.localeCompare(b.playerId));
  return candidates.slice(0, 1).map(({ playerId, relationship }) => ({ playerId, relationship }));
};

/** RNG-free observation of a fullback's relationship to his same-flank winger. */
export const deriveFlankRelationship = (
  state: TacticalMatchState,
  fullback: MatchPlayerState,
): FlankRelationship => {
  if (!isWideDefender(fullback) || state.possessionTeam !== fullback.team) return 'rest_defence';
  const assignment = deriveFlankRunAssignments(state, fullback.team).find(
    (candidate) => candidate.playerId === fullback.id,
  );
  if (assignment) return assignment.relationship;
  const flankSign = Math.sign(fullback.neutralAnchor.y - 34);
  const winger = state.players.find(
    (player) =>
      player.team === fullback.team &&
      isWideAttacker(player) &&
      Math.sign(player.neutralAnchor.y - 34) === flankSign,
  );
  if (!winger) return 'support_behind';
  const dir = direction(fullback.team);
  const lateralDistance = Math.abs(state.ball.y - fullback.neutralAnchor.y);
  const sameSideInfluence =
    Math.sign(state.ball.y - 34) === flankSign
      ? Math.max(0, 1 - lateralDistance / 30)
      : Math.max(0, 0.35 - Math.abs(state.ball.y - 34) / 60);
  const wingerWide = Math.abs(winger.position.y - 34) >= 20;
  const cover = state.players.filter(
    (player) =>
      player.team === fullback.team &&
      player.id !== fullback.id &&
      player.profile.primaryPosition !== 'goalkeeper' &&
      dir * (player.position.x - state.ball.x) < -5,
  ).length;
  if (sameSideInfluence < 0.22 || cover < 2 || fullback.duty === 'defend') return 'rest_defence';
  if (!wingerWide) return 'support_behind';
  return 'support_behind';
};

/** Small relational layer between the team block and individual space seeking. */
export const applyRoleRelationships = (
  state: TacticalMatchState,
  player: MatchPlayerState,
  structural: PitchPoint,
): PitchPoint => {
  const mates = state.players.filter((mate) => mate.team === player.team && mate.id !== player.id);
  const owns = state.possessionTeam === player.team;
  const dir = direction(player.team);
  const widePartner = mates.find((mate) => {
    const sameFlank =
      Math.sign(mate.neutralAnchor.y - 34) === Math.sign(player.neutralAnchor.y - 34);
    return (
      sameFlank &&
      (isWideDefender(player)
        ? isWideAttacker(mate)
        : isWideAttacker(player) && isWideDefender(mate))
    );
  });
  let target = structural;
  if (owns && isWideDefender(player)) {
    const relationship = deriveFlankRelationship(state, player);
    const flankSign = Math.sign(player.neutralAnchor.y - 34);
    if (relationship === 'provide_width')
      target = { x: target.x + dir * 9, y: 34 + flankSign * 30 };
    else if (relationship === 'overlap' && widePartner)
      target = { x: widePartner.position.x + dir * 10, y: 34 + flankSign * 30 };
    else if (relationship === 'underlap' && widePartner)
      target = { x: widePartner.position.x + dir * 7, y: 34 + flankSign * 14 };
    else if (relationship === 'rest_defence') target = { ...target, x: target.x - dir * 3 };
  }
  if (owns && widePartner && isWideAttacker(player)) {
    const partnerWide = Math.abs(widePartner.position.y - 34) >= 20;
    // One provides the touchline, the other a staggered inside/behind connection.
    if (partnerWide)
      target = {
        x: target.x - dir * (isWideDefender(player) ? 3 : 0),
        y: 34 + (target.y - 34) * 0.68,
      };
    else
      target = {
        ...target,
        y: 34 + Math.sign(player.neutralAnchor.y - 34) * Math.max(23, Math.abs(target.y - 34)),
      };
  }
  return clampPitchPoint(target);
};

export interface PressingAssignment {
  primary?: string;
  cover?: string;
  secondary?: { playerId: string; target: PitchPoint };
  screen: string[];
}
export const derivePressingAssignment = (
  state: TacticalMatchState,
  side: TeamSide,
): PressingAssignment => {
  const carrier = state.ball.ownerId && state.players.find((p) => p.id === state.ball.ownerId);
  if (!carrier || carrier.team === side) return { screen: [] };
  const candidates = state.players
    .filter(
      (p) =>
        p.team === side &&
        p.profile.primaryPosition !== 'goalkeeper' &&
        !state.discipline?.[p.id]?.sentOff,
    )
    .sort(
      (a, b) =>
        distance(a.position, carrier.position) - distance(b.position, carrier.position) ||
        a.id.localeCompare(b.id),
    );
  const cooperative = deriveCooperativePress(state, side);
  return {
    ...(cooperative
      ? {
          primary: cooperative.primaryId,
          secondary: { playerId: cooperative.secondaryId, target: cooperative.target },
        }
      : candidates[0]
        ? { primary: candidates[0].id }
        : {}),
    ...(candidates.find(
      (player) =>
        player.id !== (cooperative?.primaryId ?? candidates[0]?.id) &&
        player.id !== cooperative?.secondaryId,
    )
      ? {
          cover: candidates.find(
            (player) =>
              player.id !== (cooperative?.primaryId ?? candidates[0]?.id) &&
              player.id !== cooperative?.secondaryId,
          )!.id,
        }
      : {}),
    screen: candidates
      .slice(2, 5)
      .filter((p) => distance(p.position, carrier.position) < 32)
      .map((p) => p.id),
  };
};

export const buildUpSupportSchema = z.object({
  playerId: z.string(),
  role: z.enum(['escape', 'pivot', 'third_man', 'width_run', 'rest_defence']),
  target: z.object({ x: z.number(), y: z.number() }),
  weight: z.number().min(0).max(1),
});
/** Formation links exist immediately. Current pressure strengthens two escape angles and a
 * third-man route; learned traps refine them, without waiting for team-memory activation. */
export const deriveBuildUpSupport = (
  state: TacticalMatchState,
  side: TeamSide,
): z.infer<typeof buildUpSupportSchema>[] => {
  const owner = state.players.find((player) => player.id === state.ball.ownerId);
  if (!owner || owner.team !== side) return [];
  if (state.restart?.phase === 'setup') return [];
  const nearest = Math.min(
    14,
    ...state.players
      .filter((p) => p.team !== side)
      .map((p) => distance(p.position, owner.position)),
  );
  const localPressure = Math.max(0, 1 - nearest / 11);
  const learnedRelief =
    (state.teams[side].threatMemory?.response.support ?? 0) *
    deriveBuildUpReliefWeight(state, owner);
  const support = Math.min(1, 0.64 + localPressure * 0.3 + learnedRelief * 0.2);
  const dir = direction(side);
  const candidates = state.players
    .filter(
      (player) =>
        player.team === side &&
        player.id !== owner.id &&
        player.profile.primaryPosition !== 'goalkeeper' &&
        !state.discipline?.[player.id]?.sentOff &&
        // The next midfield line must be able to come towards a deep fullback. A single
        // short radius can exclude the entire central triangle before build-up has begun.
        distance(player.position, owner.position) <=
          (player.slot.position.includes('midfielder') ? 46 : 34),
    )
    .sort(
      (a, b) =>
        distance(a.position, owner.position) -
          distance(b.position, owner.position) +
          (a.duty === 'attack' ? 9 : 0) -
          (b.duty === 'attack' ? 9 : 0) -
          (a.slot.position.includes('midfielder') ? 7 : 0) +
          (b.slot.position.includes('midfielder') ? 7 : 0) || a.id.localeCompare(b.id),
    );
  const presser = state.players
    .filter((p) => p.team !== side)
    .sort((a, b) => distance(a.position, owner.position) - distance(b.position, owner.position))[0];
  const escapeSign =
    owner.position.y < 16
      ? 1
      : owner.position.y > 52
        ? -1
        : Math.sign(owner.position.y - (presser?.position.y ?? 34)) || 1;
  const assignments: z.infer<typeof buildUpSupportSchema>[] = [];
  const foes = state.players.filter((p) => p.team !== side);
  const used = new Set<string>();
  const progress = side === 'home' ? owner.position.x : 105 - owner.position.x;
  const slow = Math.max(0, 1 - Math.hypot(owner.velocity.x, owner.velocity.y) / 3);
  const weight = Math.min(1, support + localPressure * slow * 0.12);
  const assign = (
    player: MatchPlayerState | undefined,
    role: z.infer<typeof buildUpSupportSchema>['role'],
    points: PitchPoint[],
    strength = weight,
  ) => {
    if (!player) return;
    // Clear both the carrier's lane and the receiver's marker. Remain within a local
    // tactical job; a shadowed target is re-evaluated whenever the geometry changes.
    const target = points
      .map(clampPitchPoint)
      .map((point) => {
        const lane = Math.min(
          6,
          ...foes
            .filter((p) => distance(p.position, owner.position) > 2)
            .map((p) => distanceToSegment(p.position, owner.position, point)),
        );
        const clearance = Math.min(8, ...foes.map((p) => distance(p.position, point)));
        return { point, score: lane * 2 + clearance - distance(player.position, point) * 0.14 };
      })
      .sort((a, b) => b.score - a.score)[0]!.point;
    used.add(player.id);
    assignments.push({ playerId: player.id, role, target, weight: strength });
  };
  const pivot =
    progress < 62 ? candidates.find((p) => p.slot.position.includes('midfielder')) : undefined;
  assign(
    pivot,
    'pivot',
    [-1, 1].flatMap((sign) =>
      [9, 14].map((depth) => ({
        x: owner.position.x + dir * (depth - learnedRelief * 7),
        y: 34 + sign * 8,
      })),
    ),
  );
  const escape =
    candidates.find((p) => !used.has(p.id) && p.slot.position.includes('midfielder')) ??
    candidates.find((p) => !used.has(p.id) && p.slot.position === 'center_back') ??
    candidates.find((p) => !used.has(p.id) && !isWideDefender(p));
  assign(
    escape,
    'escape',
    [escapeSign, -escapeSign].flatMap((sign) =>
      [-4, 2].map((depth) => ({
        x: owner.position.x + dir * depth,
        y: owner.position.y + sign * (10 - learnedRelief * 3),
      })),
    ),
  );
  const thirdMan = candidates.find(
    (p) => !used.has(p.id) && p.slot.position.includes('midfielder') && p.duty !== 'defend',
  );
  if (localPressure > 0.15 || pivot) {
    const connection = assignments.find((a) => a.role === 'pivot')?.target ?? owner.position;
    assign(
      thirdMan,
      'third_man',
      [-1, 1].map((sign) => ({
        x: connection.x + dir * (9 - learnedRelief * 5),
        y: 34 + sign * (13 - learnedRelief * 3),
      })),
      Math.min(0.85, weight),
    );
  }
  const runner = candidates.find((p) => !used.has(p.id) && isWideAttacker(p));
  if (localPressure > 0.35 && slow > 0.4)
    assign(
      runner,
      'width_run',
      [
        {
          x: owner.position.x + dir * 16,
          y: 34 + (Math.sign((runner?.neutralAnchor.y ?? 34) - 34) || escapeSign) * 25,
        },
      ],
      Math.min(0.8, weight),
    );
  // A centre-back behind build-up stays connected as a reset option instead of following a high line.
  const centreBack = candidates.find((p) => p.slot.position === 'center_back' && !used.has(p.id));
  if (centreBack && (side === 'home' ? owner.position.x : 105 - owner.position.x) < 58)
    assignments.push({
      playerId: centreBack.id,
      role: 'rest_defence',
      weight: 0.52,
      target: clampPitchPoint({
        x: owner.position.x - dir * (16 - learnedRelief * 5),
        y: 34 + Math.sign(centreBack.neutralAnchor.y - 34) * 10,
      }),
    });
  return assignments;
};

/** Furthest legal attacking depth, expressed in canonical pitch coordinates. */
export const calculateOffsideLine = (
  state: Pick<TacticalMatchState, 'players' | 'ball'>,
  attackingSide: TeamSide,
) => {
  const xs = state.players
    .filter((p) => p.team !== attackingSide)
    .map((p) => p.position.x)
    .sort((a, b) => (attackingSide === 'home' ? b - a : a - b));
  const secondLast = xs[1] ?? (attackingSide === 'home' ? PITCH_LENGTH : 0);
  return attackingSide === 'home'
    ? Math.max(state.ball.x, secondLast)
    : Math.min(state.ball.x, secondLast);
};

export const constrainTargetOnside = (
  point: PitchPoint,
  line: number,
  side: TeamSide,
  margin = 0.7,
): PitchPoint => ({
  ...point,
  x: side === 'home' ? Math.min(point.x, line - margin) : Math.max(point.x, line + margin),
});

const seekSpace = (
  state: TacticalMatchState,
  player: MatchPlayerState,
  structural: PitchPoint,
  offside: number,
) => {
  const parameters = TACTICAL_STYLE_PARAMETERS[state.teams[player.team].style];
  const freedom =
    parameters.freedom * (player.duty === 'attack' ? 1 : player.duty === 'support' ? 0.65 : 0.25);
  if (freedom < 0.15) return structural;
  const dir = direction(player.team),
    opponents = state.players.filter((p) => p.team !== player.team);
  const candidates = [
    structural,
    { x: structural.x + dir * 3, y: structural.y - 3 },
    { x: structural.x + dir * 3, y: structural.y + 3 },
    { x: structural.x - dir * 2, y: structural.y },
  ].map((p) => constrainTargetOnside(clampPitchPoint(p), offside, player.team));
  return candidates
    .map((point) => {
      const nearest = Math.min(...opponents.map((p) => distance(point, p.position)));
      const deviation = distance(point, structural),
        progression = dir * (point.x - structural.x);
      return { point, score: nearest * 0.5 + progression * 0.25 - deviation * (1.1 - freedom) };
    })
    .sort((a, b) => b.score - a.score)[0]!.point;
};

/** Current team structure before temporary pressing, runs or loose-ball assignments. */
export const deriveStructuralPosition = (
  state: TacticalMatchState,
  player: MatchPlayerState,
  neutralAnchor = deriveNeutralFormationAnchor(player),
): PitchPoint => {
  if (player.profile.primaryPosition === 'goalkeeper')
    return applyRoleRelationships(
      state,
      player,
      deriveGoalkeeperBasePosition(state.ball, player.team),
    );
  const block = deriveTeamBlockTransform(state, player.team);
  const dir = direction(player.team);
  const structural = {
    x:
      52.5 +
      (neutralAnchor.x - 52.5) * block.depthScale +
      dir * block.advance * (player.duty === 'defend' ? 0.68 : player.duty === 'attack' ? 1.18 : 1),
    y: 34 + (neutralAnchor.y - 34) * block.widthScale + block.lateral,
  };
  return applyRoleRelationships(state, player, structural);
};

export const deriveTacticalTargets = (state: TacticalMatchState): MatchPlayerState[] => {
  const looseAssignments = deriveLooseBallAssignments(state);
  const assignments = {
    home: derivePressingAssignment(state, 'home'),
    away: derivePressingAssignment(state, 'away'),
  };
  const offside = {
    home: calculateOffsideLine(state, 'home'),
    away: calculateOffsideLine(state, 'away'),
  };
  const runs = {
    home: deriveAttackingRunIds(state, 'home'),
    away: deriveAttackingRunIds(state, 'away'),
  };
  const occupations = {
    home: deriveFinalThirdOccupations(state, 'home'),
    away: deriveFinalThirdOccupations(state, 'away'),
  };
  const buildUpSupport = {
    home: deriveBuildUpSupport(state, 'home'),
    away: deriveBuildUpSupport(state, 'away'),
  };
  return state.players.map((player) => {
    const neutralAnchor = deriveNeutralFormationAnchor(player);
    const parameters = TACTICAL_STYLE_PARAMETERS[state.teams[player.team].style],
      dir = direction(player.team);
    const isKeeper = player.profile.primaryPosition === 'goalkeeper';
    const structural = deriveStructuralPosition(state, player, neutralAnchor);
    let ideal = structural;
    const carrier = state.ball.ownerId && state.players.find((p) => p.id === state.ball.ownerId);
    if (!isKeeper && carrier) {
      const local = ballReactionWeight(distance(player.position, carrier.position));
      if (carrier.team === player.team && carrier.id !== player.id) {
        const weakSideWidth =
          ['left_winger', 'right_winger'].includes(player.slot.position) &&
          Math.sign(player.neutralAnchor.y - 34) !== Math.sign(carrier.position.y - 34);
        ideal = {
          x: ideal.x + dir * 2 * local,
          y: weakSideWidth
            ? ideal.y
            : ideal.y +
              ((carrier.position.y - ideal.y) * 0.22 * local) / parameters.supportDistance,
        };
      } else {
        const assignment = assignments[player.team];
        const protectedReceiver = protectedPressReceiver(state, player);
        if (protectedReceiver) {
          ideal = { x: protectedReceiver.position.x - dir * 2, y: protectedReceiver.position.y };
        } else if (assignment.primary === player.id) {
          const commits =
            distance(player.position, carrier.position) <= 10 + parameters.pressing * 8;
          const approach = derivePressingPlan(state, player.id)?.target ?? carrier.position;
          ideal = commits
            ? approach
            : {
                x: lerp(ideal.x, carrier.position.x, 0.68 * parameters.pressing * local),
                y: lerp(ideal.y, carrier.position.y, 0.68 * parameters.pressing * local),
              };
        } else if (assignment.secondary?.playerId === player.id)
          ideal = assignment.secondary.target;
        else if (assignment.cover === player.id)
          ideal = {
            x: lerp(ideal.x, carrier.position.x - dir * 5, 0.28 * local),
            y: lerp(ideal.y, carrier.position.y, 0.28 * local),
          };
        else if (assignment.screen.includes(player.id))
          ideal = {
            x: lerp(ideal.x, (carrier.position.x + 52.5) / 2, 0.16 * local),
            y: lerp(ideal.y, carrier.position.y, 0.16 * local),
          };
        else {
          // Smaller remote shifts preserve the block while the local duel changes.
          const compression = local * 0.075;
          ideal = {
            x: lerp(ideal.x, carrier.position.x - dir * 9, compression),
            y: lerp(ideal.y, carrier.position.y, compression),
          };
        }
      }
    }
    const supportAssignment = buildUpSupport[player.team].find(
      (assignment) => assignment.playerId === player.id,
    );
    if (supportAssignment)
      ideal = {
        x: lerp(ideal.x, supportAssignment.target.x, supportAssignment.weight),
        y: lerp(ideal.y, supportAssignment.target.y, supportAssignment.weight),
      };
    if (!isKeeper && carrier && carrier.team !== player.team) {
      const protection =
        state.teams[player.team].threatMemory?.response.flankProtection[
          threatChannel(carrier.position)
        ] ?? 0;
      ideal.y = lerp(ideal.y, carrier.position.y, protection * 0.14);
    }
    if (!isKeeper && state.possessionTeam === player.team)
      ideal = seekSpace(state, player, ideal, offside[player.team]);
    const occupation = occupations[player.team].find(({ playerId }) => playerId === player.id);
    if (occupation && !supportAssignment) ideal = occupation.target;
    else if (!isKeeper && !supportAssignment && runs[player.team].includes(player.id)) {
      const overlap = isWideDefender(player) && Math.abs(state.ball.y - player.position.y) < 18;
      ideal = {
        x: ideal.x + dir * (overlap ? 13 : 9 + parameters.forwardRuns * 7),
        y: overlap
          ? player.slot.position.startsWith('left')
            ? player.team === 'home'
              ? 5
              : 63
            : player.team === 'home'
              ? 63
              : 5
          : ideal.y,
      };
    }
    const looseAssignment = looseAssignments.find(({ playerId }) => playerId === player.id);
    const coverAssignment = looseAssignments.find(({ coverId }) => coverId === player.id);
    if (coverAssignment?.coverTarget) ideal = coverAssignment.coverTarget;
    // A nominated contestant must reach the actual contact point. Blending the race with a
    // distant formation anchor can leave a stationary loose ball just beyond control radius.
    if (looseAssignment) ideal = looseAssignment.target;
    ideal = clampPitchPoint(
      isKeeper ? ideal : constrainTargetOnside(ideal, offside[player.team], player.team),
    );
    const restartWeight = restartInfluence(state),
      restartTarget = state.restart?.targets[player.id];
    if (restartTarget && restartWeight > 0)
      ideal = clampPitchPoint({
        x: lerp(ideal.x, restartTarget.x, restartWeight),
        y: lerp(ideal.y, restartTarget.y, restartWeight),
      });
    const period = Math.floor(state.time / 4),
      blend = (state.time % 4) / 4;
    const errorAt = (n: number) => {
      const rng = RandomGenerator.fromSeed(`${state.seed}:position:${player.id}:${n}`);
      return { x: rng.float() - 0.5, y: rng.float() - 0.5 };
    };
    const e0 = errorAt(period),
      e1 = errorAt(period + 1),
      smooth = blend * blend * (3 - 2 * blend);
    const errorSize =
      (looseAssignment ? 0 : 1 - restartWeight) *
      (1 - player.profile.attributes.positioning / 100) *
      (2.5 + parameters.freedom * 2);
    const noisy = clampPitchPoint({
      x: ideal.x + lerp(e0.x, e1.x, smooth) * errorSize,
      y: ideal.y + lerp(e0.y, e1.y, smooth) * errorSize,
    });
    const reading =
      (player.profile.attributes.gameReading + player.profile.attributes.concentration) / 200;
    const reaction = 1 - Math.exp(-(state.time === 0 ? 1 : 0.05 + reading * 0.18));
    const perceived = {
      x: lerp(player.target.x, noisy.x, reaction),
      y: lerp(player.target.y, noisy.y, reaction),
    };
    return { ...player, neutralAnchor, idealTarget: ideal, target: clampPitchPoint(perceived) };
  });
};
