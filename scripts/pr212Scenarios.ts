import { z } from 'zod';
import { createPr211Scene } from './pr211Scenarios';
import { beginDefensiveChallenge } from '../src/core/matchSimulation/defensiveChallenges';
import {
  temporalFootPath,
  ZERO_TEMPORAL_ERROR,
} from '../src/core/matchSimulation/temporalFootStrike';
import { stepTacticalMatch } from '../src/core/matchSimulation/matchSimulation';
import {
  tacticalMatchStateSchema,
  type TacticalMatchState,
} from '../src/core/matchSimulation/matchState';

export const pr212SceneSchema = z.object({
  name: z.string(),
  separation: z.number().default(0.5),
  timing: z.number().min(-0.02).max(0.02).default(0),
  ballSpeed: z.number().default(0.5),
  defenderSpeed: z.number().default(0),
  lateral: z.number().default(-0.17),
  pass: z.boolean().default(true),
  technique: z.enum(['standing', 'committed', 'slide']).default('standing'),
  ticks: z.number().int().positive().max(120).default(12),
});
export const createPr212Scene = (input: z.input<typeof pr212SceneSchema>) => {
  const config = pr212SceneSchema.parse(input);
  const f = createPr211Scene('ordinary', 0);
  const state = config.pass ? f.selected : f.initial;
  state.experimentalContactTimeline = 'standing-contact-dev-v1';
  state.ball.velocity = { x: config.ballSpeed, y: 0, z: 0 };
  const defender = state.players.find((p) => p.id === f.opponent.id)!;
  defender.position = { x: state.ball.x + config.separation, y: state.ball.y + config.lateral };
  defender.velocity = { x: config.defenderSpeed, y: 0 };
  defender.facingAngle = -Math.PI / 2;
  defender.target = { ...defender.position };
  defender.anchor = { ...defender.position };
  defender.neutralAnchor = { ...defender.position };
  const selected = beginDefensiveChallenge(
    state,
    {
      type: 'challenge',
      actorId: defender.id,
      opponentId: f.actor.id,
      technique: config.technique,
    },
    'autonomous_npc',
  );
  if (!selected.defensiveChallenge && config.technique !== 'standing') {
    // Restored unsupported intent: tests its historical consumer, not NPC admission.
    selected.defensiveChallenge = {
      id: `${selected.seed}:pr212-restored:${config.technique}`,
      actorId: defender.id,
      opponentId: f.actor.id,
      technique: config.technique,
      source: 'autonomous_npc',
      startedAt: selected.time,
      expiresAt: selected.time + 1.2,
      target: { x: selected.ball.x, y: selected.ball.y },
    };
  }
  const attempt = selected.defensiveChallenge?.physicalAttempt;
  if (attempt)
    attempt.path = temporalFootPath(attempt.plan, {
      ...ZERO_TEMPORAL_ERROR,
      timingSeconds: config.timing,
    });
  return {
    config,
    initial: tacticalMatchStateSchema.parse(selected) as unknown as TacticalMatchState,
  };
};

export const pr212Frame = (input: TacticalMatchState) => {
  const s = tacticalMatchStateSchema.parse(input) as unknown as TacticalMatchState;
  return {
    time: s.time,
    ball: s.ball,
    ballEpisode: s.ballEpisode ?? 0,
    strike: s.lastStrikeResolution,
    challenge: s.lastChallenge,
    activeChallenge: s.defensiveChallenge,
    groundContact: s.lastGroundContact,
    bodyContact: s.lastBallContact,
    continuousFeet: s.continuousFootContacts,
    defensiveEpisodes: s.defensiveEpisodes,
    recentDuel: s.recentDuel,
    ownerId: s.ball.ownerId ?? null,
    ownershipStartedAt: s.ballOwnershipStartedAt,
    control: s.controlledBallContact,
    acquisition: s.ballAcquisition,
    possessionChange: s.lastPossessionChange,
    restart: s.lastRestartAward,
    score: s.score,
    players: s.players.map((p) => ({
      id: p.id,
      position: p.position,
      velocity: p.velocity,
      plantBalance: p.plantBalance,
      lowerBodyPose: p.lowerBodyPose,
      challengeRecovery: p.challengeRecovery,
    })),
  };
};
export const tracePr212 = (initial: TacticalMatchState, ticks: number) => {
  let state = initial;
  const frames = [pr212Frame(state)];
  for (let i = 0; i < ticks; i++) {
    state = stepTacticalMatch(state, 0.025);
    frames.push(pr212Frame(state));
  }
  return { state, frames };
};
export const pr212Cases: z.input<typeof pr212SceneSchema>[] = [
  { name: 'paired-earlier', ballSpeed: 1, timing: -0.02 },
  { name: 'paired-later', ballSpeed: 1, timing: 0 },
  { name: 'paired-unresolved-10ms', ballSpeed: 1, timing: -0.01 },
  { name: 'defender-10ms-earlier', timing: -0.01 },
  { name: 'same-onset', timing: 0 },
  { name: 'defender-10ms-later', timing: 0.01 },
  { name: 'defender-20ms-earlier', timing: -0.02 },
  { name: 'close-miss', separation: 0.34 },
  { name: 'late-real-contact', separation: 1 },
  { name: 'out-of-reach', separation: 1.5 },
  { name: 'escaping-ball', ballSpeed: 8, separation: 1.5 },
  { name: 'stationary-duel', pass: false, ballSpeed: 0, ticks: 80 },
  { name: 'stationary-close', pass: false, ballSpeed: 0, separation: 0.34, ticks: 80 },
  { name: 'opponent-body', separation: 0.2, lateral: 0.5, defenderSpeed: -6 },
  { name: 'unsupported-committed', technique: 'committed' },
  { name: 'unsupported-slide', technique: 'slide' },
];
