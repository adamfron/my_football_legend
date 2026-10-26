import { z } from 'zod';
import type { TacticalMatchState, MatchPlayerState } from './matchState';
import { distance, distanceToSegment, attacksRight, physicalPointSchema } from './matchSpace';
import { transitionRunSchema } from './opportunityWindows';

export const teamOrganisationSchema = z.object({
  width: z.number().nonnegative(),
  depth: z.number().nonnegative(),
  anchorRms: z.number().nonnegative(),
  centralScreens: z.number().int().nonnegative(),
  recoveryRunners: z.number().int().nonnegative(),
  trackingRunners: z.number().int().nonnegative(),
  lineGaps: z.array(z.number()).max(2),
});
/** Passive truth-based measurement. Never fed into a bounded player's decision. */
export const measureTeamOrganisation = (s: TacticalMatchState, team: 'home' | 'away') => {
  const players = s.players.filter(
    (p) => p.team === team && p.slot.position !== 'goalkeeper' && !s.discipline?.[p.id]?.sentOff,
  );
  const dir = players[0] && attacksRight(players[0]) ? 1 : -1;
  const goal = { x: dir === 1 ? 0 : 105, y: 34 };
  const lines = ['defender', 'midfielder', 'striker']
    .map((kind) => {
      const line = players.filter((p) =>
        kind === 'defender'
          ? /back/.test(p.slot.position)
          : kind === 'midfielder'
            ? /midfielder/.test(p.slot.position)
            : /striker|winger/.test(p.slot.position),
      );
      return line.length ? line.reduce((sum, p) => sum + p.position.x, 0) / line.length : null;
    })
    .filter((v): v is number => v !== null);
  const span = (axis: 'x' | 'y') =>
    players.length
      ? Math.max(...players.map((p) => p.position[axis])) -
        Math.min(...players.map((p) => p.position[axis]))
      : 0;
  return {
    width: span('y'),
    depth: span('x'),
    anchorRms: Math.sqrt(
      players.reduce((n, p) => n + distance(p.position, p.anchor) ** 2, 0) /
        Math.max(1, players.length),
    ),
    centralScreens: players.filter(
      (p) => dir * (s.ball.x - p.position.x) > 0 && distanceToSegment(p.position, s.ball, goal) < 5,
    ).length,
    recoveryRunners: players.filter((p) => dir * p.velocity.x < -1).length,
    trackingRunners: players.filter(
      (p) => p.spatialMovement?.kind === 'track_depth' || p.transitionMark,
    ).length,
    lineGaps: lines.slice(1).map((x, i) => Math.abs(x - lines[i]!)),
  };
};

export const transitionSampleSchema = z.object({
  runs: z.array(transitionRunSchema).max(2),
  at: z.number(),
  ball: physicalPointSchema.extend({ z: z.number() }),
  velocity: physicalPointSchema.extend({ z: z.number() }),
  ownerId: z.string().nullable(),
  players: z
    .array(
      z.object({
        id: z.string(),
        team: z.enum(['home', 'away']),
        position: physicalPointSchema,
        velocity: physicalPointSchema,
        target: physicalPointSchema,
        facing: z.number(),
      }),
    )
    .max(22),
  home: teamOrganisationSchema,
  away: teamOrganisationSchema,
  action: z.string().nullable(),
  restart: z.string().nullable(),
});
export type TransitionSample = z.infer<typeof transitionSampleSchema>;
export const sampleTransition = (s: TacticalMatchState): TransitionSample => ({
  runs: structuredClone(s.transitionRuntime?.runs ?? []),
  at: s.time,
  ball: { x: s.ball.x, y: s.ball.y, z: s.ball.height ?? 0.11 },
  velocity: { x: s.ball.velocity?.x ?? 0, y: s.ball.velocity?.y ?? 0, z: s.ball.velocity?.z ?? 0 },
  ownerId: s.ball.ownerId ?? null,
  players: s.players.map((p) => ({
    id: p.id,
    team: p.team,
    position: { ...p.position },
    velocity: { ...p.velocity },
    target: { ...p.target },
    facing: p.facingAngle,
  })),
  home: measureTeamOrganisation(s, 'home'),
  away: measureTeamOrganisation(s, 'away'),
  action: s.latestAction?.type ?? null,
  restart: s.restart ? s.scenario : null,
});

export const physicalContactTimes = (p: MatchPlayerState, ball: { x: number; y: number }) => ({
  distance: distance(p.position, ball),
  facing: p.facingAngle,
  velocity: { ...p.velocity },
});
