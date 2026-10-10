import { z } from 'zod';
import type { MatchPlayerState } from './matchState';
import { deriveMovementCapability, projectSprintEpisode } from './locomotion';
import {
  advanceMatchFitness,
  createMatchFitness,
  deriveFitnessPhysicalModifiers,
  matchFitnessSchema,
  recoverConditionAfterDays,
  recoverHalftimeFitness,
} from './matchFitness';

export const fitnessDrillSchema = z.enum([
  'continuous_jog',
  'repeated_sprints',
  'isolated_long_sprint',
  'sprint_recovery_sprint',
  'intensive_press',
  'economical_screen',
  'turns_braking',
  'shield_contact',
]);
export type FitnessDrill = z.infer<typeof fitnessDrillSchema>;
export const fitnessMicroLabRowSchema = z.object({
  scenario: z.string(),
  stamina: z.number().min(0).max(100),
  canonicalSeconds: z.number().nonnegative(),
  fitness: matchFitnessSchema,
  attainableSpeed: z.number().positive(),
  acceleration: z.number().positive(),
  difficultActionCost: z.number().min(0).max(1),
  firstEightSecondSprintDistance: z.number().nonnegative(),
  finalEightSecondSprintDistance: z.number().nonnegative(),
});
export const fitnessMicroLabResultSchema = z.object({
  stepSeconds: z.literal(0.025),
  rows: z.array(fitnessMicroLabRowSchema),
});
export type FitnessMicroLabResult = z.infer<typeof fitnessMicroLabResultSchema>;

/** An isolated locomotion integrator uses the same capability, finite acceleration and
 * completed-work updater as the match. It does not command a completed 30 m sprint merely
 * because a sprint was intended. Position corrections/ball contact are excluded explicitly. */
export const runFitnessDrill = (
  input: MatchPlayerState,
  drill: FitnessDrill,
  seconds = 900,
): MatchPlayerState => {
  let player: MatchPlayerState = {
    ...input,
    velocity: { x: 0, y: 0 },
    fitness: input.fitness ?? createMatchFitness(),
  };
  const dt = 0.025;
  for (let index = 0; index < Math.round(seconds / dt); index++) {
    const at = index * dt;
    const capability = deriveMovementCapability(player);
    const sprintingIntent =
      drill === 'isolated_long_sprint'
        ? at < 30
        : drill === 'sprint_recovery_sprint'
          ? at < 8 || (at >= 78 && at < 86)
          : drill === 'repeated_sprints' || drill === 'intensive_press'
            ? at % 12 < 8
            : false;
    const desiredSpeed = sprintingIntent
      ? capability.maximumSprintSpeed
      : drill === 'continuous_jog'
        ? Math.min(3.2, capability.jogSpeed)
        : drill === 'turns_braking'
          ? at % 6 < 3
            ? Math.min(5.6, capability.runSpeed)
            : 1.5
          : drill === 'economical_screen'
            ? at % 20 < 16
              ? 1.5
              : 3
            : drill === 'repeated_sprints' || drill === 'intensive_press'
              ? 2.5
              : 0;
    const direction = drill === 'turns_braking' ? Math.floor(at / 3) * Math.PI * 0.5 : 0;
    const wanted = { x: Math.cos(direction) * desiredSpeed, y: Math.sin(direction) * desiredSpeed };
    const oldSpeed = Math.hypot(player.velocity.x, player.velocity.y);
    const change = { x: wanted.x - player.velocity.x, y: wanted.y - player.velocity.y };
    const changeLength = Math.hypot(change.x, change.y);
    const availableAcceleration =
      capability.acceleration *
      (desiredSpeed < oldSpeed ? deriveFitnessPhysicalModifiers(player).braking : 1);
    const scale = Math.min(1, (availableAcceleration * dt) / Math.max(1e-9, changeLength));
    const velocity = {
      x: player.velocity.x + change.x * scale,
      y: player.velocity.y + change.y * scale,
    };
    const speed = Math.hypot(velocity.x, velocity.y);
    const turnRadians =
      speed > 0.5 && oldSpeed > 0.5
        ? Math.abs(
            Math.atan2(
              player.velocity.x * velocity.y - player.velocity.y * velocity.x,
              player.velocity.x * velocity.x + player.velocity.y * velocity.y,
            ),
          )
        : 0;
    const sprint = projectSprintEpisode(player, speed / capability.maximumSprintSpeed, at, dt);
    const fitness = advanceMatchFitness(player, {
      dt,
      distance: speed * dt,
      speed,
      previousSpeed: oldSpeed,
      turnRadians,
      sprinting: sprint.actualSprinting,
      sprintBurst: sprint.countBurst,
      pressing: drill === 'intensive_press',
      bodyContactLoad: drill === 'shield_contact' && at % 15 < 10 ? 0.85 : 0,
    });
    const {
      sprintStartedAt: _oldStarted,
      sprintRecoveryStartedAt: _oldRecovery,
      ...withoutEpisode
    } = player;
    void [_oldStarted, _oldRecovery];
    player = {
      ...withoutEpisode,
      velocity,
      position: { x: player.position.x + velocity.x * dt, y: player.position.y + velocity.y * dt },
      fitness,
      ...(sprint.sprintStartedAt === undefined ? {} : { sprintStartedAt: sprint.sprintStartedAt }),
      ...(sprint.sprintRecoveryStartedAt === undefined
        ? {}
        : { sprintRecoveryStartedAt: sprint.sprintRecoveryStartedAt }),
      sprintBurstCounted: sprint.sprintBurstCounted,
    };
  }
  return player;
};

const sprintDistance = (input: MatchPlayerState) => {
  const before = input.fitness?.workload.distanceSprint ?? 0;
  return (
    runFitnessDrill(input, 'isolated_long_sprint', 8).fitness!.workload.distanceSprint - before
  );
};
export const runFitnessMicroLab = (input: MatchPlayerState): FitnessMicroLabResult => {
  const rows: FitnessMicroLabResult['rows'] = [];
  for (const stamina of [30, 60, 90]) {
    const base: MatchPlayerState = {
      ...input,
      profile: { ...input.profile, attributes: { ...input.profile.attributes, stamina } },
      fitness: createMatchFitness(),
    };
    const firstEightSecondSprintDistance = sprintDistance(base);
    const add = (scenario: string, player: MatchPlayerState, canonicalSeconds: number) => {
      const capability = deriveMovementCapability(player);
      rows.push({
        scenario,
        stamina,
        canonicalSeconds,
        fitness: player.fitness!,
        attainableSpeed: capability.maximumSprintSpeed,
        acceleration: capability.acceleration,
        difficultActionCost: deriveFitnessPhysicalModifiers(player).bodyControlImpairment,
        firstEightSecondSprintDistance,
        finalEightSecondSprintDistance: sprintDistance({ ...player, velocity: { x: 0, y: 0 } }),
      });
    };
    for (const drill of fitnessDrillSchema.options) add(drill, runFitnessDrill(base, drill), 900);
    const depleted = runFitnessDrill(base, 'repeated_sprints');
    add('halftime_recovery', recoverHalftimeFitness(depleted), 900);
    add(
      'one_day_rest',
      { ...base, fitness: createMatchFitness(recoverConditionAfterDays(65, stamina, 1)) },
      900,
    );
    add(
      'three_days_rest',
      { ...base, fitness: createMatchFitness(recoverConditionAfterDays(65, stamina, 3)) },
      900,
    );
    add('rested_substitute_late', base, 4500);
  }
  return fitnessMicroLabResultSchema.parse({ stepSeconds: 0.025, rows });
};
