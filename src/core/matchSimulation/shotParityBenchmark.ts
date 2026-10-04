import { z } from 'zod';
import { goalIntentToPitch } from './goalCoordinates';
import { projectGoalkeeperIntervention } from './goalkeeperIntervention';
import { resolveMatchAction } from './matchActions';
import { stepTacticalMatchAfterDecisionProbe, FIXED_MATCH_DT } from './matchSimulation';
import { enumerateCanonicalShootingOptions } from './shootingOptions';
import { shotIntentSchema } from './shotIntent';
import { shotResultSchema, type ShotDiagnostic, type TacticalMatchState } from './matchState';

export const shotParityConfigSchema = z.object({
  seedFamily: z.string().min(1).default('pr151-shot-parity'),
  repeats: z.number().int().min(1).max(128).default(16),
});
export type ShotParityConfig = z.infer<typeof shotParityConfigSchema>;
const targetSchema = z.object({ horizontal: z.number(), vertical: z.number() });
export const shotParityFixtureSchema = z.object({
  name: z.string(),
  location: z.object({ x: z.number(), y: z.number() }),
  facingAngle: z.number(),
  velocity: z.object({ x: z.number(), y: z.number() }),
  defenderDistance: z.number().positive(),
});
export type ShotParityFixture = z.infer<typeof shotParityFixtureSchema>;
export const SHOT_PARITY_FIXTURES = z.array(shotParityFixtureSchema).parse([
  {
    name: 'close-still-open',
    location: { x: 94, y: 34 },
    facingAngle: Math.PI / 2,
    velocity: { x: 0, y: 0 },
    defenderDistance: 18,
  },
  {
    name: 'close-running-pressure',
    location: { x: 94, y: 34 },
    facingAngle: Math.PI / 2,
    velocity: { x: 5, y: 0 },
    defenderDistance: 2.5,
  },
  {
    name: 'angle-still-open',
    location: { x: 90, y: 46 },
    facingAngle: Math.PI / 2,
    velocity: { x: 0, y: 0 },
    defenderDistance: 18,
  },
  {
    name: 'angle-sideways-pressure',
    location: { x: 90, y: 46 },
    facingAngle: 0,
    velocity: { x: 0, y: 4 },
    defenderDistance: 2.5,
  },
  {
    name: 'range-running-open',
    location: { x: 83, y: 34 },
    facingAngle: Math.PI / 2,
    velocity: { x: 6, y: 0 },
    defenderDistance: 18,
  },
  {
    name: 'range-turned-pressure',
    location: { x: 83, y: 34 },
    facingAngle: -Math.PI / 4,
    velocity: { x: -2, y: 3 },
    defenderDistance: 2.5,
  },
]);
const sideSummarySchema = z.object({
  shots: z.number().int().nonnegative(),
  meanHorizontalError: z.number(),
  meanVerticalError: z.number(),
  horizontalErrorStdDev: z.number().nonnegative(),
  verticalErrorStdDev: z.number().nonnegative(),
  meanActualTarget: targetSchema,
  meanPressure: z.number().min(0).max(1),
  projectedOnTargetPercent: z.number().min(0).max(100),
  onTargetPercent: z.number().min(0).max(100),
  postPercent: z.number().min(0).max(100),
  crossbarPercent: z.number().min(0).max(100),
  savePercent: z.number().min(0).max(100),
  goalPercent: z.number().min(0).max(100),
  unresolved: z.number().int().nonnegative(),
});
export const shotParitySummarySchema = z.object({
  config: shotParityConfigSchema,
  collectionScope: z.literal('paired_launch_and_first_physical_resolution'),
  fixtures: z.array(shotParityFixtureSchema),
  sharedInputs: z.object({
    shooterAttributes: z.record(z.string(), z.number()),
    keeperAttributes: z.record(z.string(), z.number()),
    dominantFoot: z.enum(['left', 'right']),
    weakFootProficiency: z.number().min(0).max(100),
    keeperPosition: z.object({ x: z.number(), y: z.number() }),
    horizontalTargets: z.array(z.number()),
  }),
  fixtureCount: z.number().int().positive(),
  seedCount: z.number().int().positive(),
  pairs: z.number().int().positive(),
  canonicalLaunchDifferences: z.number().int().nonnegative(),
  targetMenuDifferences: z.number().int().nonnegative(),
  keeperInputDifferences: z.number().int().nonnegative(),
  physicalResultDifferences: z.number().int().nonnegative(),
  maximumPairedErrorDelta: z.number().nonnegative(),
  human: sideSummarySchema,
  npc: sideSummarySchema,
  groups: z.array(
    z.object({
      fixture: z.string(),
      intent: shotIntentSchema,
      human: sideSummarySchema,
      npc: sideSummarySchema,
    }),
  ),
});
export type ShotParitySummary = z.infer<typeof shotParitySummarySchema>;
type Observation = {
  launch: ShotDiagnostic;
  resolved: ShotDiagnostic | null;
  result: z.infer<typeof shotResultSchema> | null;
};
const summarize = (shots: Observation[]) => {
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const spread = (values: number[]) => {
    const average = mean(values);
    return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
  };
  const percent = (predicate: (shot: Observation) => boolean) =>
    (100 * shots.filter(predicate).length) / shots.length;
  const horizontal = shots.map(({ launch }) => launch.error.horizontal);
  const vertical = shots.map(({ launch }) => launch.error.vertical);
  return {
    shots: shots.length,
    meanHorizontalError: mean(horizontal),
    meanVerticalError: mean(vertical),
    horizontalErrorStdDev: spread(horizontal),
    verticalErrorStdDev: spread(vertical),
    meanActualTarget: {
      horizontal: mean(shots.map(({ launch }) => launch.actualTarget.horizontal)),
      vertical: mean(shots.map(({ launch }) => launch.actualTarget.vertical)),
    },
    meanPressure: mean(shots.map(({ launch }) => launch.pressure)),
    projectedOnTargetPercent: percent(({ launch }) => launch.classification === 'on_target'),
    // Keep public shot semantics aligned with canonical match statistics.
    onTargetPercent: percent(({ result }) => result === 'goal' || result === 'save'),
    postPercent: percent(({ result }) => result === 'post'),
    crossbarPercent: percent(({ result }) => result === 'crossbar'),
    savePercent: percent(({ result }) => result === 'save'),
    goalPercent: percent(({ result }) => result === 'goal'),
    unresolved: shots.filter(({ result }) => result === null).length,
  };
};
const keeperInputs = (state: TacticalMatchState) => {
  const projection = projectGoalkeeperIntervention(state);
  if (!projection) return null;
  const { keeper, ...geometry } = projection;
  return {
    ...geometry,
    attributes: keeper.profile.attributes,
    facingAngle: keeper.facingAngle,
    velocity: keeper.velocity,
  };
};
const finishShot = (launched: TacticalMatchState): Observation => {
  const launch = launched.ball.shot!;
  let state = launched;
  // Stop at the first physical result, before autonomous possession/rebound choices diverge.
  for (let tick = 0; tick < 8 / FIXED_MATCH_DT; tick++) {
    if (state.lastShot?.shotId === launch.shotId && state.lastShot.outcome)
      return { launch, resolved: state.lastShot, result: state.lastShot.outcome };
    state = stepTacticalMatchAfterDecisionProbe(state);
  }
  return { launch, resolved: null, result: null };
};

/** Paired source paths: actual human_selected and autonomous_npc action execution, then the
 * canonical flight/keeper simulation. Every physical input, shooter identity and seed is equal. */
export const runShotParityBenchmark = (
  template: TacticalMatchState,
  rawConfig: Partial<ShotParityConfig> = {},
): ShotParitySummary => {
  const config = shotParityConfigSchema.parse(rawConfig);
  const templateShooter = template.players.find(
    (player) => player.team === 'home' && player.profile.primaryPosition === 'striker',
  )!;
  const templateKeeper = template.players.find(
    (player) => player.team === 'away' && player.profile.primaryPosition === 'goalkeeper',
  )!;
  const sharedInputs = {
    shooterAttributes: {
      ...templateShooter.profile.attributes,
      finishing: 72,
      technique: 72,
      composure: 72,
      agility: 72,
    },
    keeperAttributes: {
      ...templateKeeper.profile.attributes,
      reflexes: 75,
      agility: 75,
      handling: 75,
      concentration: 75,
      positioning: 75,
    },
    dominantFoot: templateShooter.profile.dominantFoot,
    weakFootProficiency: templateShooter.profile.weakFootProficiency,
    keeperPosition: { x: 101, y: 34.8 },
    horizontalTargets: [-0.62, 0.62],
  };
  const humanShots: Observation[] = [],
    npcShots: Observation[] = [];
  const groups: ShotParitySummary['groups'] = [];
  let canonicalLaunchDifferences = 0,
    targetMenuDifferences = 0,
    keeperInputDifferences = 0;
  let physicalResultDifferences = 0,
    maximumPairedErrorDelta = 0;
  for (const fixture of SHOT_PARITY_FIXTURES)
    for (const intent of shotIntentSchema.options) {
      const groupHuman: Observation[] = [],
        groupNpc: Observation[] = [];
      for (let repeat = 0; repeat < config.repeats; repeat++)
        for (const horizontal of [-0.62, 0.62]) {
          const npc = structuredClone(template);
          npc.seed = `${config.seedFamily}:${repeat}`;
          npc.scenario = 'open_play';
          npc.time = 30;
          npc.actionCooldown = 30;
          delete npc.restart;
          delete npc.controlledFootballerId;
          delete npc.humanPossessionEpisode;
          delete npc.onBallPreparation;
          delete npc.playerMovementIntent;
          delete npc.ballCarrierIntent;
          const shooter = npc.players.find(
            (player) => player.team === 'home' && player.profile.primaryPosition === 'striker',
          )!;
          const keeper = npc.players.find(
            (player) => player.team === 'away' && player.profile.primaryPosition === 'goalkeeper',
          )!;
          const defender = npc.players.find(
            (player) => player.team === 'away' && player.profile.primaryPosition !== 'goalkeeper',
          )!;
          for (const player of npc.players) {
            player.position = {
              x: player.team === 'home' ? 35 : 45,
              y: 8 + player.position.y * 0.15,
            };
            player.target = { ...player.position };
            player.velocity = { x: 0, y: 0 };
          }
          Object.assign(shooter, {
            position: { ...fixture.location },
            target: { ...fixture.location },
            facingAngle: fixture.facingAngle,
            velocity: { ...fixture.velocity },
          });
          Object.assign(shooter.profile.attributes, {
            finishing: 72,
            technique: 72,
            composure: 72,
            agility: 72,
          });
          Object.assign(keeper, {
            position: { x: 101, y: 34.8 },
            target: { x: 101, y: 34.8 },
            facingAngle: -Math.PI / 2,
          });
          Object.assign(keeper.profile.attributes, {
            reflexes: 75,
            agility: 75,
            handling: 75,
            concentration: 75,
            positioning: 75,
          });
          defender.position = {
            x: shooter.position.x - fixture.defenderDistance,
            y: shooter.position.y,
          };
          defender.target = { ...defender.position };
          npc.ball = { ...shooter.position, ownerId: shooter.id };
          npc.possessionTeam = 'home';
          const human = structuredClone(npc);
          human.controlledFootballerId = shooter.id;
          if (
            JSON.stringify(enumerateCanonicalShootingOptions(human, shooter.id)) !==
            JSON.stringify(enumerateCanonicalShootingOptions(npc, shooter.id))
          )
            targetMenuDifferences++;
          const goalTarget = { horizontal, vertical: intent === 'chip' ? 0.62 : 0.3 };
          const point = goalIntentToPitch('home', goalTarget);
          const action = {
            type: 'shot' as const,
            actorId: shooter.id,
            intent,
            goalTarget,
            target: { x: point.x, y: point.y },
          };
          const launchedHuman = resolveMatchAction(human, action, 'human_selected');
          const launchedNpc = resolveMatchAction(npc, action, 'autonomous_npc');
          if (!launchedHuman.ball.shot || !launchedNpc.ball.shot)
            throw new Error(`Parity fixture cannot launch ${fixture.name}/${intent}`);
          if (JSON.stringify(launchedHuman.ball) !== JSON.stringify(launchedNpc.ball))
            canonicalLaunchDifferences++;
          if (
            JSON.stringify(keeperInputs(launchedHuman)) !==
            JSON.stringify(keeperInputs(launchedNpc))
          )
            keeperInputDifferences++;
          const h = finishShot(launchedHuman),
            n = finishShot(launchedNpc);
          if (JSON.stringify(h.resolved) !== JSON.stringify(n.resolved))
            physicalResultDifferences++;
          maximumPairedErrorDelta = Math.max(
            maximumPairedErrorDelta,
            Math.abs(h.launch.error.horizontal - n.launch.error.horizontal),
            Math.abs(h.launch.error.vertical - n.launch.error.vertical),
          );
          humanShots.push(h);
          npcShots.push(n);
          groupHuman.push(h);
          groupNpc.push(n);
        }
      groups.push({
        fixture: fixture.name,
        intent,
        human: summarize(groupHuman),
        npc: summarize(groupNpc),
      });
    }
  return shotParitySummarySchema.parse({
    config,
    collectionScope: 'paired_launch_and_first_physical_resolution',
    fixtures: SHOT_PARITY_FIXTURES,
    sharedInputs,
    fixtureCount: SHOT_PARITY_FIXTURES.length,
    seedCount: config.repeats,
    pairs: humanShots.length,
    canonicalLaunchDifferences,
    targetMenuDifferences,
    keeperInputDifferences,
    physicalResultDifferences,
    maximumPairedErrorDelta,
    human: summarize(humanShots),
    npc: summarize(npcShots),
    groups,
  });
};
