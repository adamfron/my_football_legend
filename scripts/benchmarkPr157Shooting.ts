import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import type { MatchAction, ShotDiagnostic } from '../src/core/matchSimulation/matchState';

const args = new Map(
  process.argv.slice(2).map((argument) => {
    const [key, ...value] = argument.replace(/^--/, '').split('=');
    return [key, value.join('=')];
  }),
);
const root = resolve(args.get('engine-root') ?? '.');
const sourceDirectory = resolve(root, 'src/core/matchSimulation');
const sourceHash = createHash('sha256');
for (const path of readdirSync(sourceDirectory, { recursive: true })
  .filter(
    (path): path is string =>
      typeof path === 'string' && path.endsWith('.ts') && !path.endsWith('.test.ts'),
  )
  .sort())
  sourceHash
    .update(path.replaceAll('\\', '/'))
    .update('\0')
    .update(readFileSync(resolve(sourceDirectory, path)))
    .update('\0');
const canonicalSourceHash = sourceHash.digest('hex');
const load = <T>(path: string): Promise<T> => import(pathToFileURL(resolve(root, path)).href);
const [worldModule, sessions, engine, actions, keeperModule, stats, restarts, shootingOptions] =
  await Promise.all([
    load<typeof import('./createCanonicalWorldDatabase')>(
      'scripts/createCanonicalWorldDatabase.ts',
    ),
    load<typeof import('../src/core/singleMatch')>('src/core/singleMatch.ts'),
    load<typeof import('../src/core/matchSimulation/matchSimulation')>(
      'src/core/matchSimulation/matchSimulation.ts',
    ),
    load<typeof import('../src/core/matchSimulation/matchActions')>(
      'src/core/matchSimulation/matchActions.ts',
    ),
    load<typeof import('../src/core/matchSimulation/goalkeeperIntervention')>(
      'src/core/matchSimulation/goalkeeperIntervention.ts',
    ),
    load<typeof import('../src/core/matchSimulation/playerMatchStats')>(
      'src/core/matchSimulation/playerMatchStats.ts',
    ),
    load<typeof import('../src/core/matchSimulation/restartScenarios')>(
      'src/core/matchSimulation/restartScenarios.ts',
    ),
    load<typeof import('../src/core/matchSimulation/shootingOptions')>(
      'src/core/matchSimulation/shootingOptions.ts',
    ),
  ]);
const config = z
  .object({
    repetitions: z.number().int().min(4).max(256),
    bands: z.array(z.number().min(0).max(100)).min(1),
    distances: z.array(z.number().positive()).min(1),
  })
  .parse({
    repetitions: Number(args.get('repetitions') ?? 64),
    bands: (args.get('bands') ?? '5,10,20,40,60,80,100').split(',').map(Number),
    distances: (args.get('distances') ?? '4,8,12,16,20,25,32').split(',').map(Number),
  });
const contextSchema = z.object({
  id: z.string(),
  distance: z.number().positive(),
  angleRadians: z.number(),
  pressure: z.number().min(0).max(1),
  turnRadians: z.number(),
  weakFoot: z.boolean(),
  incomingSpeed: z.number().nonnegative(),
  contact: z.enum(['settled', 'first_time', 'half_volley', 'volley', 'header']),
  intent: z.enum(['driven', 'placed', 'chip', 'header']),
  target: z.object({ horizontal: z.number(), vertical: z.number() }),
  keeperDepth: z.number().positive(),
  keeperLateral: z.number(),
  blocker: z.boolean(),
  freeKick: z.boolean(),
});
type Context = z.infer<typeof contextSchema>;
const context = (id: string, overrides: Partial<Context> = {}): Context =>
  contextSchema.parse({
    id,
    distance: 20,
    angleRadians: 0,
    pressure: 0,
    turnRadians: 0,
    weakFoot: false,
    incomingSpeed: 0,
    contact: 'settled',
    intent: 'placed',
    target: { horizontal: 0.55, vertical: 0.3 },
    keeperDepth: 2,
    keeperLateral: 0,
    blocker: false,
    freeKick: false,
    ...overrides,
  });
const contexts = [
  context('settled'),
  context('pressure-moderate', { pressure: 0.45 }),
  context('pressure-strong', { pressure: 0.9 }),
  context('turned', { turnRadians: 2.2 }),
  context('angled', { angleRadians: 0.65 }),
  context('weak-foot', { weakFoot: true }),
  context('angle-moderate', { angleRadians: 0.35 }),
  context('first-time', { contact: 'first_time', incomingSpeed: 14 }),
  context('first-time-fast', { contact: 'first_time', incomingSpeed: 26 }),
  context('half-volley', { contact: 'half_volley', incomingSpeed: 14 }),
  context('volley', { contact: 'volley', incomingSpeed: 14 }),
  context('header', { distance: 12, contact: 'header', intent: 'header', incomingSpeed: 14 }),
  context('driven', { intent: 'driven' }),
  context('chip-rushing-keeper', {
    distance: 12,
    intent: 'chip',
    keeperDepth: 5,
    target: { horizontal: 0, vertical: 0.55 },
  }),
  context('blocked', { blocker: true }),
  context('existing-direct-free-kick', { freeKick: true }),
  context('difficult', {
    distance: 25,
    pressure: 0.9,
    turnRadians: 2.2,
    angleRadians: 0.5,
    weakFoot: true,
  }),
];
const keeperContexts = [
  context('keeper-central-low', { distance: 16, target: { horizontal: 0, vertical: 0.12 } }),
  context('keeper-central-high', { distance: 16, target: { horizontal: 0, vertical: 0.8 } }),
  context('keeper-near-post', {
    distance: 16,
    angleRadians: 0.4,
    target: { horizontal: 0.7, vertical: 0.3 },
    keeperLateral: 0.8,
  }),
  context('keeper-far-post', {
    distance: 16,
    angleRadians: 0.4,
    target: { horizontal: -0.7, vertical: 0.3 },
    keeperLateral: 0.8,
  }),
  context('keeper-close-one-on-one', { distance: 5, target: { horizontal: 0.55, vertical: 0.25 } }),
  context('keeper-chip', {
    distance: 12,
    intent: 'chip',
    keeperDepth: 5,
    target: { horizontal: 0, vertical: 0.55 },
  }),
];
const input = engine.createTacticalMatch(
  sessions.createSingleMatchSession(worldModule.createCanonicalWorldDatabase(), {
    homeClubId: 'pro_9',
    awayClubId: 'pro_1',
    seed: 'pr157-shooting-template',
    control: { mode: 'spectator' },
  }),
);
const shooterId = input.players.find(
  (player) => player.team === 'home' && player.slot.position === 'striker',
)!.id;
const keeperId = input.players.find(
  (player) => player.team === 'away' && player.slot.position === 'goalkeeper',
)!.id;
const prepare = (
  c: Context,
  attribute: string,
  ability: number,
  sample: number,
  keeperAbility = 60,
) => {
  const state = structuredClone(input);
  // The paired random stream excludes ability, attribute and context; isolate physical responses.
  state.seed = `pr157-shooting:${sample}`;
  state.time = 30;
  state.scenario = c.freeKick ? 'free_kick_close' : 'open_play';
  state.possessionTeam = 'home';
  state.playerAgencyEnabled = false;
  state.actionCooldown = 0;
  delete state.restart;
  delete state.planningSchedule;
  delete state.onBallPreparation;
  for (const player of state.players) {
    player.position = { x: player.team === 'home' ? 5 : 20, y: 65 };
    player.target = { ...player.position };
    player.velocity = { x: 0, y: 0 };
    for (const key of Object.keys(
      player.profile.attributes,
    ) as (keyof typeof player.profile.attributes)[])
      player.profile.attributes[key] = 60;
  }
  const shooter = state.players.find((player) => player.id === shooterId)!;
  const keeper = state.players.find((player) => player.id === keeperId)!;
  const defender = state.players.find(
    (player) => player.team === 'away' && player.slot.position !== 'goalkeeper',
  )!;
  shooter.position = {
    x: 105 - c.distance * Math.cos(c.angleRadians),
    y: 34 + c.distance * Math.sin(c.angleRadians),
  };
  shooter.target = { ...shooter.position };
  shooter.facingAngle = Math.PI / 2 + c.angleRadians + c.turnRadians;
  const skills = [
    'finishing',
    'technique',
    'composure',
    'heading',
    'firstTouch',
    'agility',
  ] as const;
  if (attribute === 'bundle') for (const key of skills) shooter.profile.attributes[key] = ability;
  else shooter.profile.attributes[attribute as (typeof skills)[number]] = ability;
  shooter.profile.dominantFoot = 'right';
  shooter.profile.weakFootProficiency = c.weakFoot ? 10 : 80;
  keeper.position = { x: 105 - c.keeperDepth, y: 34 + c.keeperLateral };
  keeper.target = { ...keeper.position };
  keeper.facingAngle = -Math.PI / 2;
  if (args.has('selection-outlet')) {
    const outlet = state.players.find(
      (player) =>
        player.team === 'home' && player.id !== shooter.id && player.slot.position !== 'goalkeeper',
    )!;
    outlet.position = { x: shooter.position.x - 6, y: shooter.position.y + 6 };
    outlet.target = { ...outlet.position };
  }
  for (const key of [
    'reflexes',
    'agility',
    'handling',
    'concentration',
    'positioning',
    'oneOnOnes',
    'gameReading',
    'pace',
  ] as const)
    keeper.profile.attributes[key] = keeperAbility;
  if (c.pressure > 0) {
    defender.position = {
      x: shooter.position.x - 0.4,
      y: shooter.position.y + 14 * (1 - c.pressure),
    };
    defender.target = { ...defender.position };
  }
  if (c.blocker) {
    defender.position = { x: shooter.position.x + 4, y: shooter.position.y };
    defender.target = { ...defender.position };
  }
  const height =
    c.contact === 'header'
      ? 1.8
      : c.contact === 'volley'
        ? 0.95
        : c.contact === 'half_volley'
          ? 0.48
          : 0.11;
  const offset = c.weakFoot
    ? { x: -Math.cos(shooter.facingAngle) * 0.5, y: Math.sin(shooter.facingAngle) * 0.5 }
    : { x: 0, y: 0 };
  const point = { x: shooter.position.x + offset.x, y: shooter.position.y + offset.y };
  const donor = state.players.find((player) => player.team === 'home' && player.id !== shooter.id)!;
  state.ball =
    c.contact === 'settled'
      ? { ...point, height, ownerId: shooter.id }
      : {
          ...point,
          height,
          from: { x: point.x - 8, y: point.y },
          target: shooter.position,
          velocity: { x: c.incomingSpeed, y: 0, z: c.contact === 'half_volley' ? 1.5 : 0 },
          airborne: height > 0.11,
          bounceCount: c.contact === 'half_volley' ? 1 : 0,
          intendedReceiverId: shooter.id,
          lastTouchPlayerId: donor.id,
          travelKind: 'cross',
          sourceAction: 'cross',
        };
  state.currentPressure = c.pressure;
  state.statistics = stats.createMatchStatistics(state);
  let action: MatchAction =
    c.contact === 'header'
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
          intent: c.intent as 'driven' | 'placed' | 'chip',
          contact: c.contact,
          target: { x: 105, y: 34 },
          goalTarget: c.target,
        };
  if (c.contact === 'header' && args.has('generated-headers'))
    action =
      shootingOptions
        .enumerateCanonicalShootingOptions(state, shooter.id)
        .find((proposal) => proposal.type === 'header') ?? action;
  if (c.freeKick) {
    // Exercise existing wall/taker setup and canonical restart release, without introducing UX.
    for (const player of state.players)
      player.profile.attributes.setPieces = player.id === shooter.id ? 100 : 1;
    const restarted = restarts.applyRestartScenario(state, 'free_kick_close', {
      restartTeam: 'home',
      restartPoint: { ...shooter.position },
    });
    restarted.players.find((player) => player.id === shooter.id)!.facingAngle = shooter.facingAngle;
    restarted.ball.height = 0.11;
    restarted.statistics = stats.createMatchStatistics(restarted);
    if (restarted.restart?.takerId !== shooter.id)
      throw new Error('Shooting lab free-kick taker must be the paired shooter');
    return { state: restarted, action };
  }
  return { state, action };
};
const distributionSchema = z.object({
  mean: z.number(),
  p50: z.number(),
  p90: z.number(),
  max: z.number(),
});
const distribution = (values: number[]) => {
  if (!values.length) return { mean: 0, p50: 0, p90: 0, max: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  return {
    mean: values.reduce((sum, v) => sum + v, 0) / values.length,
    p50: sorted[Math.floor(sorted.length * 0.5)]!,
    p90: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))]!,
    max: sorted.at(-1)!,
  };
};
const countSchema = z.number().int().nonnegative();
const cellSchema = z.object({
  matrix: z.enum(['ability_distance', 'contexts', 'individual_attributes', 'goalkeeper']),
  context: contextSchema,
  attribute: z.string(),
  ability: z.number(),
  keeperAbility: z.number(),
  attempts: countSchema,
  rejected: countSchema,
  unresolved: countSchema,
  projectedOnTarget: countSchema,
  onTarget: countSchema,
  blocks: countSchema,
  posts: countSchema,
  crossbars: countSchema,
  wide: countSchema,
  over: countSchema,
  goalkeeperContacts: countSchema,
  catches: countSchema,
  parries: countSchema,
  saves: countSchema,
  goals: countSchema,
  contactTypes: z.record(z.string(), countSchema),
  selectionTopFamily: z.record(z.string(), countSchema),
  selectionTopAction: z.record(z.string(), countSchema),
  selectionUtility: z.record(
    z.string(),
    z.object({
      samples: countSchema,
      canonical: distributionSchema,
      scored: distributionSchema,
    }),
  ),
  executionQuality: distributionSchema,
  horizontalErrorMetres: distributionSchema,
  verticalErrorMetres: distributionSchema,
  launchSpeed: distributionSchema,
  reactionSeconds: distributionSchema,
  requiredKeeperDisplacement: distributionSchema,
  availableKeeperReach: distributionSchema,
  physicalReachable: countSchema,
  trajectoryParityFailures: countSchema,
  actualDistance: distributionSchema,
  actualAngle: distributionSchema,
  actualPressure: distributionSchema,
  orientationDifficulty: distributionSchema,
  weakFootDifficulty: distributionSchema,
  contactDifficulty: distributionSchema,
});
type Cell = z.infer<typeof cellSchema>;
const rows: Cell[] = [];
const keeperTrajectories = new Map<string, string>();
const started = performance.now();
const runCell = (
  matrix: Cell['matrix'],
  c: Context,
  attribute: string,
  ability: number,
  keeperAbility = 60,
) => {
  const counts = {
    attempts: 0,
    rejected: 0,
    unresolved: 0,
    projectedOnTarget: 0,
    onTarget: 0,
    blocks: 0,
    posts: 0,
    crossbars: 0,
    wide: 0,
    over: 0,
    goalkeeperContacts: 0,
    catches: 0,
    parries: 0,
    saves: 0,
    goals: 0,
    physicalReachable: 0,
    trajectoryParityFailures: 0,
  };
  const contactTypes: Record<string, number> = {},
    selectionTopFamily: Record<string, number> = {},
    selectionTopAction: Record<string, number> = {};
  const selectionUtilities = new Map<string, { canonical: number[]; scored: number[] }>();
  const quality: number[] = [],
    horizontal: number[] = [],
    vertical: number[] = [],
    speed: number[] = [],
    reaction: number[] = [],
    displacement: number[] = [],
    reach: number[] = [];
  const actualDistance: number[] = [],
    actualAngle: number[] = [],
    actualPressure: number[] = [],
    orientation: number[] = [],
    weakFoot: number[] = [],
    contact: number[] = [];
  for (let sample = 0; sample < config.repetitions; sample++) {
    const { state, action } = prepare(c, attribute, ability, sample, keeperAbility);
    const allRanked = actions.rankAvailableActionsForAI(state, shooterId);
    for (const kind of ['shot', 'pass', 'carry']) {
      const best = allRanked.find(({ action: proposal }) =>
        kind === 'shot'
          ? proposal.type === 'shot' || proposal.type === 'header'
          : proposal.type === kind,
      );
      if (!best) continue;
      const values = selectionUtilities.get(kind) ?? { canonical: [], scored: [] };
      values.canonical.push(best.canonicalScore);
      values.scored.push(best.score);
      selectionUtilities.set(kind, values);
    }
    const top = allRanked[0]?.action.type;
    if (top) selectionTopAction[top] = (selectionTopAction[top] ?? 0) + 1;
    const ranked = allRanked.filter(
      ({ action: proposal }) => proposal.type === 'shot' || proposal.type === 'header',
    );
    const selected = ranked[0]?.action;
    if (selected && (selected.type === 'shot' || selected.type === 'header')) {
      const family = selected.type === 'header' ? 'header' : selected.intent;
      selectionTopFamily[family] = (selectionTopFamily[family] ?? 0) + 1;
    }
    let live = actions.resolveMatchAction(state, action, 'autonomous_npc');
    const shot = live.ball.shot;
    if (!shot) {
      counts.rejected++;
      continue;
    }
    counts.attempts++;
    if (matrix === 'goalkeeper') {
      const key = `${c.id}:${sample}`;
      const trajectory = JSON.stringify({
        velocity: live.ball.velocity,
        launch: live.ball.launchVelocity,
        target: shot.actualTarget,
        error: shot.error,
      });
      const reference = keeperTrajectories.get(key);
      if (reference && reference !== trajectory) counts.trajectoryParityFailures++;
      if (!reference) keeperTrajectories.set(key, trajectory);
    }
    quality.push(shot.executionErrorProfile?.executionQuality ?? shot.shooterExecutionQuality);
    horizontal.push(Math.abs(shot.error.horizontal) * 3.66);
    vertical.push(Math.abs(shot.error.vertical) * 2.44);
    speed.push(shot.launchSpeed ?? shot.speed);
    actualDistance.push(shot.distance);
    actualAngle.push(shot.angle);
    actualPressure.push(shot.pressure);
    orientation.push(shot.executionErrorProfile?.orientationDifficulty ?? 0);
    weakFoot.push(shot.executionErrorProfile?.weakFootDifficulty ?? 0);
    contact.push(shot.executionErrorProfile?.contactDifficulty ?? 0);
    contactTypes[shot.contact ?? 'settled'] = (contactTypes[shot.contact ?? 'settled'] ?? 0) + 1;
    counts.projectedOnTarget += Number(shot.classification === 'on_target');
    const projection = keeperModule.projectGoalkeeperIntervention(live);
    if (projection) {
      reaction.push(projection.reactionDelay);
      displacement.push(projection.requiredDisplacement);
      reach.push(projection.availableReach);
      counts.physicalReachable += Number(projection.reachable);
    }
    live.actionCooldown = 1000;
    let resolved: ShotDiagnostic | undefined;
    for (let tick = 0; tick < 320; tick++) {
      if (live.lastShot?.shotId === shot.shotId && live.lastShot.outcome) {
        resolved = live.lastShot;
        break;
      }
      live = engine.stepTacticalMatchAfterDecisionProbe(live, 0.025);
    }
    if (!resolved) counts.unresolved++;
    counts.onTarget += Number(resolved?.outcome === 'goal' || resolved?.outcome === 'save');
    counts.blocks += Number(resolved?.outcome === 'block');
    counts.posts += Number(resolved?.outcome === 'post');
    counts.crossbars += Number(resolved?.outcome === 'crossbar');
    counts.wide += Number(resolved?.outcome === 'miss' && resolved.classification === 'wide');
    counts.over += Number(resolved?.outcome === 'miss' && resolved.classification === 'over');
    counts.goalkeeperContacts += Number(Boolean(resolved?.keeperId));
    counts.catches += Number(resolved?.goalkeeperAction === 'catch');
    counts.parries += Number(
      resolved?.goalkeeperAction === 'parry' || resolved?.goalkeeperAction === 'parry_away',
    );
    counts.saves += Number(resolved?.outcome === 'save');
    counts.goals += Number(resolved?.outcome === 'goal');
  }
  rows.push(
    cellSchema.parse({
      matrix,
      context: c,
      attribute,
      ability,
      keeperAbility,
      ...counts,
      contactTypes,
      selectionTopFamily,
      selectionTopAction,
      selectionUtility: Object.fromEntries(
        [...selectionUtilities].map(([kind, values]) => [
          kind,
          {
            samples: values.canonical.length,
            canonical: distribution(values.canonical),
            scored: distribution(values.scored),
          },
        ]),
      ),
      executionQuality: distribution(quality),
      horizontalErrorMetres: distribution(horizontal),
      verticalErrorMetres: distribution(vertical),
      launchSpeed: distribution(speed),
      reactionSeconds: distribution(reaction),
      requiredKeeperDisplacement: distribution(displacement),
      availableKeeperReach: distribution(reach),
      actualDistance: distribution(actualDistance),
      actualAngle: distribution(actualAngle),
      actualPressure: distribution(actualPressure),
      orientationDifficulty: distribution(orientation),
      weakFootDifficulty: distribution(weakFoot),
      contactDifficulty: distribution(contact),
    }),
  );
  process.stderr.write(
    `${matrix} ${c.id} ${c.distance}m ${attribute} ${ability} keeper ${keeperAbility}: ${counts.onTarget}/${counts.attempts}, goals ${counts.goals}, rejects ${counts.rejected}, unresolved ${counts.unresolved}\n`,
  );
};
const matrices = (
  args.get('matrices') ?? 'ability_distance,contexts,individual_attributes,goalkeeper'
).split(',');
if (matrices.includes('ability_distance'))
  for (const metres of config.distances)
    for (const ability of config.bands)
      runCell(
        'ability_distance',
        context('settled-distance', {
          distance: metres,
          target: { horizontal: 0, vertical: 0.3 },
          keeperLateral: 12,
        }),
        'bundle',
        ability,
      );
if (matrices.includes('contexts'))
  for (const c of contexts.filter(
    (c) => !args.has('contexts') || args.get('contexts')!.split(',').includes(c.id),
  ))
    for (const ability of config.bands) runCell('contexts', c, 'bundle', ability);
if (matrices.includes('individual_attributes'))
  for (const attribute of ['finishing', 'technique', 'composure', 'heading', 'agility'].filter(
    (attribute) => !args.has('attribute') || attribute === args.get('attribute'),
  ))
    for (const c of contexts.filter((c) =>
      attribute === 'heading'
        ? c.id === 'header'
        : ['settled', 'pressure-strong', attribute === 'agility' ? 'turned' : 'volley'].includes(
            c.id,
          ),
    ))
      for (const ability of config.bands) runCell('individual_attributes', c, attribute, ability);
if (matrices.includes('goalkeeper'))
  for (const c of keeperContexts)
    for (const keeperAbility of [10, 40, 70, 100])
      runCell('goalkeeper', c, 'bundle', 85, keeperAbility);
const output = resolve(args.get('out') ?? '.benchmark-artifacts/pr157-shooting.json');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(
  output,
  JSON.stringify(
    {
      config,
      root,
      canonicalSourceHash,
      runtimeMilliseconds: performance.now() - started,
      collectionScope: 'canonical_release_and_first_physical_resolution',
      definitions: {
        headerAim: args.has('generated-headers')
          ? 'Actual canonical generated header action, including its current geometry-based goalTarget.'
          : 'Physical header controls deliberately use the legacy central target (horizontal0, vertical0.55), with no explicit goalTarget. Other contexts use the target recipe recorded in the row.',
        pairedSeeds:
          'Ability, individual skill, difficulty and keeper skill share the same release seed and shooter identity. Canonical outcomes may diverge physically after launch.',
        horizontalError:
          'Absolute sampled target-plane coordinate error multiplied by goal half-width (3.66m). It is intended execution error, separate from physical flight height/drag and keeper intervention.',
        verticalError:
          'Absolute sampled target-plane coordinate error multiplied by goal height (2.44m). Negative aiming heights can bounce into goal.',
        onTarget:
          'Final public result goal or save. ProjectedOnTarget is unobstructed physical goal-plane classification.',
        blocks:
          'Final first physical block includes failed keeper contacts. GoalkeeperContacts is every final shot carrying keeperId, including passive-body contacts. Contacts minus saves measures non-save keeper contacts, not an exact passive-only classifier.',
        rangeMatrix:
          'Keeper displaced laterally 12m to isolate execution with an open goal. Context and keeper matrices use the named normal geometry.',
        freeKick:
          'Existing applyRestartScenario free_kick_close establishes the actual taker, defensive wall, keeper and release lifecycle. Only existing shot actions are exercised; no new restart UI/choreography.',
        selection:
          'Top-ranked legal shot family, overall action counts, and best shot/pass/carry canonical utility and final score (including existing deterministic decision noise). Families with no legal option are absent. Sterile fixtures measure bounded preference, not full-match action frequency.',
        selectionFixture: args.has('selection-outlet')
          ? 'Representative choice supplement places one skill60 teammate6m behind and6m lateral to the shooter as a legal short passing outlet; other named geometry is unchanged.'
          : 'Default physical isolation leaves teammates far behind; ordinary passing outlets are absent.',
        reactionReach:
          'Release-time advisory canonical keeper projection; actual contact and outcomes still come from fixed-step locomotion/CCD.',
      },
      rows,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify({
    output,
    cells: rows.length,
    attempts: rows.reduce((n, r) => n + r.attempts, 0),
    rejected: rows.reduce((n, r) => n + r.rejected, 0),
    unresolved: rows.reduce((n, r) => n + r.unresolved, 0),
    runtimeMilliseconds: performance.now() - started,
  }),
);
if (rows.some((r) => r.rejected || r.unresolved || r.trajectoryParityFailures))
  process.exitCode = 1;
