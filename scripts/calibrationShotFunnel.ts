import { z } from 'zod';
import { createCanonicalWorldDatabase } from './createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../src/core/singleMatch';
import {
  createTacticalMatch,
  resolveMatchAction,
  stepTacticalMatch,
} from '../src/core/matchSimulation/index';
import { BALL_RADIUS } from '../src/core/matchSimulation/ballFlight';
import type { MatchAction } from '../src/core/matchSimulation/matchState';

export const shotFunnelFamilySchema = z.enum([
  'driven',
  'placed',
  'chip',
  'first_time',
  'half_volley',
  'volley',
  'header',
]);
export const shotFunnelSummarySchema = z.object({
  family: shotFunnelFamilySchema,
  attempts: z.number().int().nonnegative(),
  onTarget: z.number().int().nonnegative(),
  projectedOnTarget: z.number().int().nonnegative(),
  goals: z.number().int().nonnegative(),
  keeperContacts: z.number().int().nonnegative(),
  saves: z.number().int().nonnegative(),
  blocks: z.number().int().nonnegative(),
  unresolved: z.number().int().nonnegative(),
});
export type ShotFunnelSummary = z.infer<typeof shotFunnelSummarySchema>;

/**
 * Controlled calibration fixtures, not a match distribution: equal styles, bounded contexts,
 * canonical action release and ordinary fixed-step match physics/contact resolution throughout.
 */
export const runCalibrationShotFunnel = (attemptsPerFamily = 32): ShotFunnelSummary[] => {
  const world = createCanonicalWorldDatabase();
  return shotFunnelFamilySchema.options.map((family) => {
    const summary: ShotFunnelSummary = {
      family,
      attempts: 0,
      onTarget: 0,
      projectedOnTarget: 0,
      goals: 0,
      keeperContacts: 0,
      saves: 0,
      blocks: 0,
      unresolved: 0,
    };
    for (let index = 0; index < attemptsPerFamily; index += 1) {
      let state = createTacticalMatch(
        createSingleMatchSession(world, {
          homeClubId: world.clubs[0]!.id,
          awayClubId: world.clubs[1]!.id,
          seed: `pr145:shot-funnel:${family}:${index}`,
          control: { mode: 'spectator' },
        }),
      );
      const shooter = state.players.find(
        (player) => player.team === 'home' && player.profile.primaryPosition === 'striker',
      )!;
      const keeper = state.players.find(
        (player) => player.team === 'away' && player.profile.primaryPosition === 'goalkeeper',
      )!;
      const passer = state.players.find(
        (player) => player.team === 'home' && player.id !== shooter.id,
      )!;
      for (const player of state.players) {
        player.position = { x: player.team === 'home' ? 45 : 35, y: 8 };
        player.target = { ...player.position };
        player.velocity = { x: 0, y: 0 };
      }
      const range = [7, 14, 20, 23][index % 4]!;
      shooter.position = { x: 105 - range, y: 34 + ((index % 3) - 1) * 3 };
      shooter.target = { ...shooter.position };
      shooter.facingAngle = Math.PI / 2;
      const quality = [45, 65, 85][index % 3]!;
      Object.assign(shooter.profile.attributes, {
        finishing: quality,
        technique: quality,
        composure: quality,
        firstTouch: quality,
        agility: quality,
        heading: quality,
        jumping: quality,
      });
      keeper.position = { x: family === 'chip' ? 100 : 103, y: 34 };
      keeper.target = { ...keeper.position };
      keeper.facingAngle = -Math.PI / 2;
      Object.assign(keeper.profile.attributes, {
        reflexes: 72,
        agility: 72,
        handling: 72,
        concentration: 72,
        positioning: 72,
      });
      state.scenario = 'open_play';
      state.currentPressure = 0;
      state.actionCooldown = 0;
      const settled = family === 'driven' || family === 'placed' || family === 'chip';
      const height =
        family === 'header'
          ? 1.8
          : family === 'volley'
            ? 0.95
            : family === 'half_volley'
              ? 0.48
              : BALL_RADIUS;
      state.ball = settled
        ? { ...shooter.position, height, ownerId: shooter.id }
        : {
            x: shooter.position.x - 0.45,
            y: shooter.position.y,
            height,
            from: { x: shooter.position.x - 8, y: shooter.position.y },
            target: { ...shooter.position },
            velocity: { x: 12, y: 0, z: 0 },
            airborne: height > BALL_RADIUS,
            bounceCount: family === 'half_volley' ? 1 : 0,
            intendedReceiverId: shooter.id,
            lastTouchPlayerId: passer.id,
            travelKind: 'cross',
            sourceAction: 'cross',
          };
      const action: MatchAction =
        family === 'header'
          ? {
              type: 'header',
              actorId: shooter.id,
              intent: 'header_shot',
              target: { x: 105, y: 34 },
              firstTime: true,
            }
          : {
              type: 'shot',
              actorId: shooter.id,
              intent:
                family === 'chip' ? 'chip' : family === 'driven' || !settled ? 'driven' : 'placed',
              contact: settled ? 'settled' : family,
              target: { x: 105, y: 34 },
              goalTarget: {
                horizontal: family === 'chip' ? 0 : index % 2 === 0 ? 0.4 : -0.4,
                vertical: family === 'chip' ? 0.62 : 0.3,
              },
            };
      state = resolveMatchAction(state, action);
      const released = state.ball.shot;
      if (!released) {
        summary.unresolved += 1;
        continue;
      }
      summary.attempts += 1;
      if (released.classification === 'on_target') summary.projectedOnTarget += 1;
      for (let tick = 0; tick < 240 && state.lastShot?.shotId !== released.shotId; tick += 1)
        state = stepTacticalMatch(state, 0.025);
      const resolved = state.lastShot?.shotId === released.shotId ? state.lastShot : undefined;
      if (!resolved?.outcome) summary.unresolved += 1;
      if (resolved?.outcome === 'goal' || resolved?.outcome === 'save') summary.onTarget += 1;
      if (resolved?.outcome === 'goal') summary.goals += 1;
      if (resolved?.outcome === 'save') summary.saves += 1;
      if (resolved?.outcome === 'block') summary.blocks += 1;
      if (resolved?.keeperId) summary.keeperContacts += 1;
    }
    return shotFunnelSummarySchema.parse(summary);
  });
};
