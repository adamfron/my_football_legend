import { createPr212Scene, pr212Frame, pr212SceneSchema, pr212Cases } from './pr212Scenarios';
import {
  tacticalMatchStateSchema,
  type TacticalMatchState,
} from '../src/core/matchSimulation/matchState';
import { stepTacticalMatch } from '../src/core/matchSimulation/matchSimulation';
import type { z } from 'zod';

export const createPr213Scene = (config: z.input<typeof pr212SceneSchema>) => {
  const f = createPr212Scene(config);
  f.initial.experimentalPlayerBodyImpulse = 'upright-pair-dev-v1';
  return f;
};
export const pr213Frame = (s: TacticalMatchState) => ({
  ...pr212Frame(s),
  playerContacts: s.playerBodyContacts ?? [],
  continuousPlayers: s.continuousPlayerContacts ?? [],
  agency: s.humanPossessionEpisode,
  pendingDecision: s.pendingPlayerDecision,
  fouls: s.lastFoul,
  injuries: s.players.map((p) => ({ id: p.id, injury: p.injury })),
});
export const tracePr213 = (initial: TacticalMatchState, ticks: number) => {
  let state = initial;
  const frames = [pr213Frame(state)];
  for (let i = 0; i < ticks; i++) {
    state = stepTacticalMatch(state, 0.025);
    frames.push(pr213Frame(state));
  }
  return { state, frames };
};
export const normalizedPr213State = (s: TacticalMatchState) =>
  tacticalMatchStateSchema.parse(JSON.parse(JSON.stringify(s))) as unknown as TacticalMatchState;
export const pr213Cases = [
  ...pr212Cases,
  { name: 'body-closing', separation: 0.2, lateral: 0.5, defenderSpeed: -6, ticks: 8 },
  { name: 'body-gentle', separation: 0.12, lateral: 0.5, defenderSpeed: -1, ticks: 12 },
  { name: 'body-near-tangent', separation: 0.2, lateral: 0.67, defenderSpeed: -6, ticks: 8 },
  { name: 'body-initial-overlap', separation: -0.2, lateral: 0, defenderSpeed: -1, ticks: 8 },
  { name: 'body-pass-challenge', separation: 0.5, lateral: 0.3, defenderSpeed: -6, ticks: 8 },
  { name: 'pass-challenge-body', separation: 0.5, lateral: 0.5, defenderSpeed: -6, ticks: 8 },
  { name: 'pass-body-challenge', separation: 0.7, lateral: 0.5, defenderSpeed: -9, ticks: 8 },
] satisfies z.input<typeof pr212SceneSchema>[];

/** Additional acquisition routes use the same scene seed and ordinary executor. */
export const pr213DuelScenes = () => {
  const cases: [string, (s: TacticalMatchState) => void][] = [
    [
      'stationary-loose',
      (s) => {
        delete s.ball.ownerId;
        s.ball.looseSince = s.time;
      },
    ],
    [
      'moving-loose',
      (s) => {
        delete s.ball.ownerId;
        s.ball.looseSince = s.time;
        s.players.find((p) => p.id === s.controlledFootballerId)!.velocity = { x: 2, y: 0 };
        s.players.find((p) => p.id === s.defensiveChallenge!.actorId)!.velocity = { x: -2, y: 0 };
      },
    ],
    [
      'shielding',
      (s) => {
        const actor = s.players.find((p) => p.id === s.ball.ownerId)!;
        s.ballCarrierIntent = {
          actorId: actor.id,
          type: 'carry',
          target: { x: 32, y: 34 },
          startedAt: s.time,
          expiresAt: s.time + 3,
          estimatedArrival: 1,
          startPosition: actor.position,
          closestPointReached: actor.position,
          humanSelected: false,
          executionMode: 'shield',
        };
      },
    ],
    ['owned-to-loose', () => {}],
    [
      'returning-ball',
      (s) => {
        delete s.ball.ownerId;
        s.ball.looseSince = s.time;
        s.ball.x += 0.8;
        s.ball.velocity = { x: -2, y: 0, z: 0 };
      },
    ],
    [
      'third-opponent',
      (s) => {
        delete s.ball.ownerId;
        s.ball.looseSince = s.time;
        const q = s.players.find(
          (p) =>
            p.team !== s.possessionTeam &&
            p.id !== s.defensiveChallenge!.actorId &&
            p.slot.position !== 'goalkeeper',
        )!;
        q.position = { x: s.ball.x + 0.6, y: s.ball.y + 0.45 };
        q.target = q.anchor = q.neutralAnchor = { ...q.position };
      },
    ],
    [
      'teammate-replacement',
      (s) => {
        delete s.ball.ownerId;
        s.ball.looseSince = s.time;
        const q = s.players.find(
          (p) =>
            p.team === s.possessionTeam &&
            p.id !== s.controlledFootballerId &&
            p.slot.position !== 'goalkeeper',
        )!;
        q.position = { x: s.ball.x + 0.5, y: s.ball.y + 0.17 };
        q.facingAngle = -Math.PI / 2;
        q.target = q.anchor = q.neutralAnchor = { ...q.position };
      },
    ],
    [
      'consecutive-ticks',
      (s) => {
        s.ball.velocity = { x: -0.1, y: 0, z: 0 };
      },
    ],
  ];
  return cases.map(([name, configure]) => {
    const f = createPr213Scene({ name, pass: false, ballSpeed: 0, ticks: 80 });
    configure(f.initial);
    f.initial = normalizedPr213State(f.initial);
    return f;
  });
};
