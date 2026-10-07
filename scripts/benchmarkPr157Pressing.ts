import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import type { MatchPlayerState, TacticalMatchState } from '../src/core/matchSimulation/matchState';
import { playerAttributesSchema } from '../src/schemas/domainSchemas';

const args = new Map(
  process.argv.slice(2).map((s) => {
    const [key, ...value] = s.replace(/^--/, '').split('=');
    return [key, value.join('=')];
  }),
);
const root = resolve(args.get('engine-root') ?? '.');
const sourceFingerprint = () => {
  const directory = resolve(root, 'src/core/matchSimulation');
  const collect = (path: string): string[] =>
    readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
      const filename = resolve(path, entry.name);
      return entry.isDirectory()
        ? collect(filename)
        : entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')
          ? [filename]
          : [];
    });
  const files = collect(directory).sort();
  const hash = createHash('sha256');
  for (const filename of files)
    hash
      .update(relative(directory, filename).replaceAll('\\', '/'))
      .update('\0')
      .update(readFileSync(filename))
      .update('\0');
  return z
    .object({
      algorithm: z.literal('sha256'),
      scope: z.string(),
      files: z.number().int().positive(),
      digest: z.string().length(64),
    })
    .parse({
      algorithm: 'sha256',
      scope:
        'Sorted non-test .ts files in src/core/matchSimulation; relative path + NUL + bytes + NUL',
      files: files.length,
      digest: hash.digest('hex'),
    });
};
const initialSourceFingerprint = sourceFingerprint();
const load = <T>(path: string): Promise<T> => import(pathToFileURL(resolve(root, path)).href);
const [world, sessions, engine, defence, preparation, positioning] = await Promise.all([
  load<typeof import('./createCanonicalWorldDatabase')>('scripts/createCanonicalWorldDatabase.ts'),
  load<typeof import('../src/core/singleMatch')>('src/core/singleMatch.ts'),
  load<typeof import('../src/core/matchSimulation/matchSimulation')>(
    'src/core/matchSimulation/matchSimulation.ts',
  ),
  load<typeof import('../src/core/matchSimulation/defensiveChallenges')>(
    'src/core/matchSimulation/defensiveChallenges.ts',
  ),
  load<typeof import('../src/core/matchSimulation/onBallPreparation')>(
    'src/core/matchSimulation/onBallPreparation.ts',
  ),
  load<typeof import('../src/core/matchSimulation/tacticalPositioning')>(
    'src/core/matchSimulation/tacticalPositioning.ts',
  ),
]);
const configuration = z
  .object({ repetitions: z.number().int().min(4).max(256), seconds: z.number().positive().max(12) })
  .parse({
    repetitions: Number(args.get('repetitions') ?? 32),
    seconds: Number(args.get('seconds') ?? 6),
  });
const template = engine.createTacticalMatch(
  sessions.createSingleMatchSession(world.createCanonicalWorldDatabase(), {
    homeClubId: 'pro_9',
    awayClubId: 'pro_1',
    seed: 'pr157-press-template',
    control: { mode: 'spectator' },
  }),
);
const attackerId = template.players.find(
  (p) => p.team === 'home' && p.slot.position === 'central_midfielder',
)!.id;
const defenderId = template.players.find(
  (p) => p.team === 'away' && p.slot.position === 'center_back',
)!.id;
type Attributes = MatchPlayerState['profile']['attributes'];
const contextSchema = z.enum([
  'stationary',
  'slow',
  'fast',
  'heavy_touch',
  'clean',
  'shield',
  'touchline',
  'danger',
  'good_cover',
  'poor_cover',
  'cooperative',
  'booked',
  'late_trailing',
  'turned',
  'moving_press',
  'release',
  'emergency_run',
  'booked_emergency',
  'tactical_break',
  'immediate_dogso',
]);
const cellSchema = z.object({
  id: z.string(),
  context: contextSchema,
  defender: playerAttributesSchema.partial().optional(),
  attacker: playerAttributesSchema.partial().optional(),
});
type Cell = z.infer<typeof cellSchema>;
const bands = [10, 30, 60, 90, 100];
const cells: Cell[] = [];
for (const attribute of [
  'aggression',
  'tackling',
  'gameReading',
  'positioning',
  'composure',
  'strength',
  'pace',
  'agility',
] as const)
  for (const band of bands)
    cells.push({
      id: `defender:${attribute}:${band}`,
      context: 'stationary',
      defender: { [attribute]: band },
    });
for (const attribute of ['dribbling', 'technique', 'agility', 'composure', 'pace'] as const)
  for (const band of bands)
    cells.push({
      id: `attacker:${attribute}:${band}`,
      context: 'moving_press',
      defender: { aggression: 90 },
      attacker: { [attribute]: band },
    });
const riskContexts = ['emergency_run', 'booked_emergency', 'tactical_break', 'immediate_dogso'];
for (const context of contextSchema.options.filter(
  (context) => args.has('contexts') || !riskContexts.includes(context),
))
  for (const aggression of [30, 60, 90])
    cells.push({
      id: `context:${context}:aggression:${aggression}`,
      context,
      defender: {
        aggression,
        ...(context === 'emergency_run' || context === 'booked_emergency'
          ? { tackling: 90, gameReading: 90, positioning: 90, composure: 10 }
          : {}),
      },
    });
for (const aggression of bands)
  cells.push({ id: `card:aggression:${aggression}`, context: 'booked', defender: { aggression } });
for (const tackling of [30, 90])
  for (const dribbling of [30, 90])
    cells.push({
      id: `contest:tackling:${tackling}:dribbling:${dribbling}`,
      context: 'moving_press',
      defender: { aggression: 90, tackling },
      attacker: { dribbling, agility: dribbling },
    });
cells.forEach((cell) => cellSchema.parse(cell));
const selectedContexts = args
  .get('contexts')
  ?.split(',')
  .map((context) => contextSchema.parse(context));
const selectedCells = selectedContexts
  ? cells.filter((cell) => selectedContexts.includes(cell.context))
  : cells;

const fixture = (cell: Cell, sample: number): TacticalMatchState => {
  const state = structuredClone(template);
  state.seed = `pr157-press-paired:${sample}`;
  state.time =
    cell.context === 'late_trailing' ||
    cell.context === 'emergency_run' ||
    cell.context === 'booked_emergency'
      ? 83 * 60
      : 600;
  state.scenario = 'open_play';
  state.status = state.time >= 45 * 60 ? 'second_half' : 'first_half';
  delete state.restart;
  delete state.planningSchedule;
  delete state.currentAction;
  state.players.forEach((p, index) => {
    p.profile.attributes = { ...p.profile.attributes };
    for (const key of Object.keys(p.profile.attributes) as (keyof Attributes)[])
      p.profile.attributes[key] = 60;
    p.position = {
      x: p.team === 'home' ? 32 - (index % 3) * 5 : 78 + (index % 3) * 5,
      y: 7 + (index % 10) * 5.5,
    };
    p.target = { ...p.position };
    p.idealTarget = { ...p.position };
    p.velocity = { x: 0, y: 0 };
  });
  const attacker = state.players.find((p) => p.id === attackerId)!;
  const defender = state.players.find((p) => p.id === defenderId)!;
  Object.assign(defender.profile.attributes, cell.defender);
  Object.assign(attacker.profile.attributes, cell.attacker);
  const danger =
    cell.context === 'danger' ||
    cell.context === 'late_trailing' ||
    riskContexts.includes(cell.context);
  attacker.position = {
    x:
      cell.context === 'immediate_dogso'
        ? 91
        : cell.context === 'tactical_break'
          ? 72
          : cell.context === 'emergency_run' || cell.context === 'booked_emergency'
            ? 84
            : danger
              ? 83
              : 52,
    y: cell.context === 'touchline' ? 3 : 34,
  };
  attacker.target = { ...attacker.position };
  attacker.facingAngle = Math.PI / 2;
  defender.position = {
    x: attacker.position.x + 5 + (sample % 4) * 0.3,
    y: attacker.position.y + ((sample % 5) - 2) * 0.35,
  };
  defender.anchor = { ...defender.position };
  defender.target = { ...defender.position };
  defender.facingAngle = -Math.PI / 2;
  const cover = state.players.filter(
    (p) => p.team === 'away' && p.id !== defenderId && p.slot.position !== 'goalkeeper',
  );
  cover.slice(0, 3).forEach((p, index) => {
    p.position = {
      x: attacker.position.x + 10 + index * 3,
      y: attacker.position.y + (index - 1) * 7,
    };
    p.target = { ...p.position };
  });
  if (cell.context === 'poor_cover' || danger)
    cover.forEach((p) => {
      p.position = { x: 28, y: 62 };
    });
  if (cell.context === 'cooperative')
    cover[0]!.position = { x: attacker.position.x - 1, y: attacker.position.y + 6 };
  if (cell.context === 'moving_press')
    defender.velocity = { x: -5, y: (sample % 2 ? 1 : -1) * 0.6 };
  if (
    cell.context === 'slow' ||
    cell.context === 'fast' ||
    cell.context === 'moving_press' ||
    ['emergency_run', 'booked_emergency', 'tactical_break'].includes(cell.context)
  ) {
    attacker.velocity = { x: cell.context === 'fast' ? 5 : danger ? 3.5 : 1.4, y: 0 };
    state.ballCarrierIntent = {
      actorId: attacker.id,
      type: 'carry',
      target: { x: attacker.position.x + 16, y: attacker.position.y },
      startPosition: { ...attacker.position },
      closestPointReached: { ...attacker.position },
      startedAt: state.time,
      expiresAt: state.time + 8,
      estimatedArrival: state.time + 5,
      humanSelected: false,
      movementMode: cell.context === 'fast' ? 'sprint' : 'dribble',
    };
  }
  if (cell.context === 'shield' || cell.context === 'cooperative')
    state.ballCarrierIntent = {
      actorId: attacker.id,
      type: 'carry',
      target: { ...attacker.position },
      startPosition: { ...attacker.position },
      closestPointReached: { ...attacker.position },
      startedAt: state.time,
      expiresAt: state.time + 8,
      estimatedArrival: state.time + 8,
      humanSelected: false,
      movementMode: 'retain',
      executionMode: 'shield',
    };
  state.ball = {
    x: attacker.position.x + (cell.context === 'heavy_touch' ? 1.7 : 0.45),
    y: attacker.position.y,
    height: 0,
    ownerId: attacker.id,
    lastTouchPlayerId: attacker.id,
  };
  state.possessionTeam = 'home';
  state.timeSincePossessionChanged = 3;
  state.currentPressure = 0.5;
  state.nearestChallengerId = defender.id;
  state.actionCooldown = cell.context === 'release' ? 0 : 20;
  state.onBallPreparation = preparation.deriveOnBallPreparation(
    state,
    attacker,
    cell.context === 'heavy_touch' ? 'heavy_touch' : 'clean_control',
  );
  state.teams.home.phase = 'positional_attack';
  state.teams.away.phase = 'defensive_block';
  if (cell.context === 'booked' || cell.context === 'booked_emergency')
    state.discipline = { [defenderId]: { yellowCards: 1, sentOff: false, team: 'away' } };
  if (
    cell.context === 'late_trailing' ||
    cell.context === 'emergency_run' ||
    cell.context === 'booked_emergency'
  )
    state.score = { home: 1, away: 0 };
  if (cell.context === 'turned') attacker.facingAngle = -Math.PI / 2;
  return state;
};
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const mean = (values: number[]) => (values.length ? sum(values) / values.length : null);
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);
const outputRows = [];
const started = performance.now();
for (const cell of selectedCells) {
  const samples = [];
  for (let sample = 0; sample < configuration.repetitions; sample++) {
    let state = fixture(cell, sample);
    const initial = structuredClone(state);
    const start = state.time;
    let minDistance = Infinity,
      approachTime: number | null = null,
      containmentSeconds = 0,
      staticSeconds = 0,
      staticRun = 0,
      staticMax = 0;
    let carrierMovingSeconds = 0,
      carrierDistance = 0,
      supportDistance = 0,
      secondarySeconds = 0,
      structureFailures = 0;
    const challenges = new Map<string, NonNullable<TacticalMatchState['lastChallenge']>>();
    const cards = new Set<string>();
    let staticReference:
      | { target: { x: number; y: number }; solution: string; ball: { x: number; y: number } }
      | undefined;
    const techniques: Record<string, number> = {},
      intentionSeconds: Record<string, number> = {};
    const trace = [];
    let outcome = 'unresolved';
    for (let tick = 0; tick < Math.round(configuration.seconds / 0.025); tick++) {
      const before = state;
      state = engine.stepTacticalMatch(state, 0.025);
      const actor =
        state.players.find((p) => p.id === attackerId) ??
        before.players.find((p) => p.id === attackerId)!;
      const defender =
        state.players.find((p) => p.id === defenderId) ??
        before.players.find((p) => p.id === defenderId)!;
      const metres = distance(actor.position, defender.position);
      minDistance = Math.min(minDistance, metres);
      if (approachTime === null && metres < 2.5) approachTime = state.time - start;
      const actorSpeed = Math.hypot(actor.velocity.x, actor.velocity.y);
      const defenderSpeed = Math.hypot(defender.velocity.x, defender.velocity.y);
      if (actorSpeed > 0.5 && state.ball.ownerId === attackerId) carrierMovingSeconds += 0.025;
      const plan =
        'derivePressingPlan' in defence
          ? defence.derivePressingPlan(state, defenderId, null)
          : undefined;
      const intention =
        plan?.intention ??
        (defence.shouldCommitRoutinePress(state, defenderId, null) ? 'engage' : 'contain');
      intentionSeconds[intention] = (intentionSeconds[intention] ?? 0) + 0.025;
      if (intention === 'contain' || intention === 'screen') containmentSeconds += 0.025;
      const currentSolution = JSON.stringify([
        state.latestAction,
        state.ballCarrierIntent?.movementMode,
        state.ballCarrierIntent?.executionMode,
        state.onBallPreparation?.micro?.phase,
        intention,
      ]);
      const pressTarget = plan?.target ?? defender.target;
      const physicalRest =
        state.ball.ownerId === attackerId &&
        metres < 2.5 &&
        actorSpeed < 0.25 &&
        defenderSpeed < 0.25 &&
        !state.defensiveChallenge &&
        Math.hypot(
          (state.ball.velocity?.x ?? actor.velocity.x) - actor.velocity.x,
          (state.ball.velocity?.y ?? actor.velocity.y) - actor.velocity.y,
        ) < 0.3;
      if (
        !physicalRest ||
        !staticReference ||
        currentSolution !== staticReference.solution ||
        distance(pressTarget, staticReference.target) > 0.35 ||
        distance(state.ball, staticReference.ball) > 0.35
      ) {
        staticReference = physicalRest
          ? {
              target: { ...pressTarget },
              solution: currentSolution,
              ball: { x: state.ball.x, y: state.ball.y },
            }
          : undefined;
        staticRun = 0;
      }
      const isStatic = physicalRest && Boolean(staticReference);
      staticSeconds += isStatic ? 0.025 : 0;
      staticRun = isStatic ? staticRun + 0.025 : 0;
      staticMax = Math.max(staticMax, staticRun);
      const previousActor = before.players.find((p) => p.id === attackerId)!;
      carrierDistance += distance(actor.position, previousActor.position);
      for (const p of state.players.filter(
        (p) =>
          p.team === 'home' && p.id !== attackerId && distance(p.position, actor.position) < 30,
      ))
        supportDistance += distance(
          p.position,
          before.players.find((q) => q.id === p.id)!.position,
        );
      const cooperative = defence.deriveCooperativePress(state, 'away');
      if (cooperative) secondarySeconds += 0.025;
      if (tick % 20 === 0) {
        const dangerous = state.players.filter(
          (p) =>
            p.team === 'home' &&
            p.id !== attackerId &&
            p.position.x > 71 &&
            Math.abs(p.position.y - 34) < 23 &&
            !state.players.some(
              (d) =>
                d.team === 'away' &&
                d.slot.position !== 'goalkeeper' &&
                distance(p.position, d.position) < 8,
            ),
        );
        structureFailures += dangerous.length ? 1 : 0;
        if (sample === 0 && trace.length < 13)
          trace.push({
            at: state.time - start,
            metres,
            actorSpeed,
            defenderSpeed,
            relativeSpeed: Math.hypot(
              actor.velocity.x - defender.velocity.x,
              actor.velocity.y - defender.velocity.y,
            ),
            ballOffset: distance(actor.position, state.ball),
            target: plan?.target ?? defender.target,
            intention,
            pressure: state.currentPressure,
            challengeOptions: defence
              .enumerateDefensiveChallengeActions(state, defenderId)
              .map((a) => a.technique),
            chosen:
              defence.chooseNpcDefensiveChallengeAction(state, defenderId, cooperative ?? null)
                ?.technique ?? null,
            reason: plan?.reason ?? 'legacy',
            carrierIntent:
              state.ballCarrierIntent?.movementMode ??
              state.onBallPreparation?.micro?.phase ??
              null,
            support: positioning
              .deriveBuildUpSupport(state, 'home')
              .map((p) => ({ role: p.role, target: p.target })),
          });
      }
      const last = state.lastChallenge;
      if (last && !challenges.has(last.id)) {
        challenges.set(last.id, last);
        techniques[last.technique] = (techniques[last.technique] ?? 0) + 1;
      }
      if (state.lastCard && state.lastCard.at >= start) cards.add(state.lastCard.id);
      if (state.discipline?.[defenderId]?.sentOff) {
        outcome = 'presser_sent_off';
        break;
      }
      if (state.restart?.phase === 'setup') {
        outcome = last?.outcome === 'foul' ? 'foul' : 'out_of_play';
        break;
      }
      if (state.ball.ownerId !== attackerId) {
        outcome =
          last?.outcome === 'clean_win'
            ? 'successful_tackle'
            : last?.outcome === 'loose_ball'
              ? 'loose_ball'
              : state.ball.travelKind
                ? (state.ball.velocity?.x ?? 0) < 0
                  ? 'reset_pass'
                  : 'forced_release'
                : 'lost_control';
        break;
      }
      if (
        distance(actor.position, initial.players.find((p) => p.id === attackerId)!.position) > 4 &&
        metres > 3
      ) {
        outcome = 'carrier_escape';
        break;
      }
    }
    if (outcome === 'unresolved' && staticMax >= 1) outcome = 'static';
    else if (outcome === 'unresolved' && state.ballCarrierIntent?.movementMode === 'retain')
      outcome = 'shield_retained';
    else if (outcome === 'unresolved' && carrierDistance > 1) outcome = 'active_containment';
    samples.push({
      approachTime,
      minDistance,
      containmentSeconds,
      staticSeconds,
      staticMax,
      carrierMovingSeconds,
      carrierDistance,
      supportDistance,
      secondarySeconds,
      structureFailures,
      outcome,
      techniques,
      intentionSeconds,
      challenges: [...challenges.values()],
      cards: cards.size,
      trace,
    });
  }
  const outcomes: Record<string, number> = {},
    techniques: Record<string, number> = {},
    intentions: Record<string, number> = {};
  for (const s of samples) {
    outcomes[s.outcome] = (outcomes[s.outcome] ?? 0) + 1;
    for (const [k, v] of Object.entries(s.techniques)) techniques[k] = (techniques[k] ?? 0) + v;
    for (const [k, v] of Object.entries(s.intentionSeconds))
      intentions[k] = (intentions[k] ?? 0) + v;
  }
  const challenges = samples.flatMap((s) => s.challenges);
  outputRows.push({
    ...cell,
    attempts: samples.length,
    challengeAttempts: challenges.length,
    challengeFrequency: samples.filter((s) => s.challenges.length).length / samples.length,
    bodyContacts: challenges.filter((c) => c.opponentContact).length,
    cleanWins: challenges.filter((c) => c.outcome === 'clean_win').length,
    looseBalls: challenges.filter((c) => c.outcome === 'loose_ball').length,
    beaten: challenges.filter((c) => c.outcome === 'beaten').length,
    fouls: challenges.filter((c) => c.outcome === 'foul').length,
    cards: sum(samples.map((s) => s.cards)),
    outcomes,
    techniques,
    intentionSeconds: intentions,
    approachTime: mean(samples.flatMap((s) => (s.approachTime === null ? [] : [s.approachTime]))),
    minDistance: mean(samples.map((s) => s.minDistance)),
    engagementSpeed: mean(challenges.map((c) => c.relativeSpeed)),
    containmentSeconds: mean(samples.map((s) => s.containmentSeconds)),
    staticEpisodes: samples.filter((s) => s.staticMax >= 1).length,
    stationarySeconds: sum(samples.map((s) => s.staticSeconds)),
    carrierMovingSeconds: mean(samples.map((s) => s.carrierMovingSeconds)),
    carrierDistance: mean(samples.map((s) => s.carrierDistance)),
    supportDistance: mean(samples.map((s) => s.supportDistance)),
    secondarySeconds: mean(samples.map((s) => s.secondarySeconds)),
    structuralFailures: sum(samples.map((s) => s.structureFailures)),
    trace:
      samples[0]!.trace.length > 1
        ? [samples[0]!.trace[0], samples[0]!.trace.at(-1)]
        : samples[0]!.trace,
  });
}
// Selection and skill are distinct experiments: identical forced standing contact, paired seeds.
const contactRows = [];
for (const attribute of [
  'aggression',
  'tackling',
  'gameReading',
  'positioning',
  'strength',
  'dribbling',
  'technique',
  'agility',
] as const)
  for (const band of bands) {
    const outcomes: Record<string, number> = {};
    for (let sample = 0; sample < configuration.repetitions * 4; sample++) {
      const attackerAttribute = ['dribbling', 'technique', 'agility'].includes(attribute);
      const state = fixture(
        {
          id: 'fixed_contact',
          context: 'stationary',
          ...(attackerAttribute
            ? { attacker: { [attribute]: band } }
            : { defender: { [attribute]: band } }),
        },
        sample,
      );
      const attacker = state.players.find((p) => p.id === attackerId)!;
      const defender = state.players.find((p) => p.id === defenderId)!;
      defender.position = { x: attacker.position.x + 1.15, y: attacker.position.y };
      state.ball.x = attacker.position.x + 0.45;
      const result = defence.resolveDefensiveChallenge(
        defence.beginDefensiveChallenge(
          state,
          { type: 'challenge', actorId: defenderId, opponentId: attackerId, technique: 'standing' },
          'autonomous_npc',
        ),
      );
      const outcome = result.diagnostic?.outcome ?? 'unresolved';
      outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
    }
    contactRows.push({ attribute, band, attempts: configuration.repetitions * 4, outcomes });
  }
const rowSchema = cellSchema.extend({
  attempts: z.number().int().positive(),
  challengeAttempts: z.number().int().nonnegative(),
  challengeFrequency: z.number().min(0).max(1),
  bodyContacts: z.number().int().nonnegative(),
  cleanWins: z.number().int().nonnegative(),
  looseBalls: z.number().int().nonnegative(),
  beaten: z.number().int().nonnegative(),
  fouls: z.number().int().nonnegative(),
  cards: z.number().int().nonnegative(),
  staticEpisodes: z.number().int().nonnegative(),
  stationarySeconds: z.number().nonnegative(),
  outcomes: z.record(z.string(), z.number().int().nonnegative()),
  techniques: z.record(z.string(), z.number().int().nonnegative()),
  intentionSeconds: z.record(z.string(), z.number().nonnegative()),
  minDistance: z.number().nonnegative().nullable(),
  engagementSpeed: z.number().nonnegative().nullable(),
  approachTime: z.number().nonnegative().nullable(),
  containmentSeconds: z.number().nonnegative().nullable(),
  carrierMovingSeconds: z.number().nonnegative().nullable(),
  carrierDistance: z.number().nonnegative().nullable(),
  supportDistance: z.number().nonnegative().nullable(),
  secondarySeconds: z.number().nonnegative().nullable(),
  structuralFailures: z.number().nonnegative(),
  trace: z.array(z.record(z.string(), z.unknown())).max(2),
});
const report = {
  version: 1,
  engineRoot: root,
  canonicalSourceHash: initialSourceFingerprint.digest,
  sourceFingerprint: initialSourceFingerprint,
  configuration,
  selectedContexts: selectedContexts ?? null,
  definitions: {
    pairedSeeds: 'Seed depends only on repetition, never attribute/context.',
    fixture:
      '22 canonical players, 6 seconds by default; scanning fixtures hold decision cooldown to isolate physical movement; release context permits normal NPC choices.',
    static:
      'Both actors <0.25m/s within2.5m, controlled ball relative speed<0.3m/s, no challenge/action/intent/phase change or target/ball displacement>0.35m, for>=1 continuous second. Diagnostic only.',
    structuralFailures:
      '0.5-second samples with any advanced central attacker >8m from nearest outfield defender; not attribution of a conceded chance.',
    fixedContact:
      'Forced standing action at identical reachable geometry; aggression is excluded from resolver quality.',
    supportDistance:
      'Cumulative actual movement of local attacking teammates, not a claimed response latency.',
    acceleration:
      'Model has no separate acceleration or balance attribute. Pace/agility/strength sweeps affect derived physical acceleration; agility represents body recovery.',
    cards:
      'Actual canonical issued card identities during the episode; pending cards remain pending.',
  },
  cells: z.array(rowSchema).parse(outputRows),
  fixedContact: z
    .array(
      z.object({
        attribute: z.string(),
        band: z.number().min(0).max(100),
        attempts: z.number().int().positive(),
        outcomes: z.record(z.string(), z.number().int().nonnegative()),
      }),
    )
    .parse(contactRows),
  wallSeconds: (performance.now() - started) / 1000,
};
const out = resolve(args.get('out') ?? 'docs/performance/PR157-pressing-after.json');
if (sourceFingerprint().digest !== initialSourceFingerprint.digest)
  throw new Error('Engine source changed during pressing benchmark; rerun on a stable source.');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  JSON.stringify(
    report,
    (_key, value: unknown) => (typeof value === 'number' ? Math.round(value * 1e6) / 1e6 : value),
    2,
  ) + '\n',
);
process.stdout.write(
  JSON.stringify({
    out,
    cells: outputRows.length,
    repetitions: configuration.repetitions,
    wallSeconds: report.wallSeconds,
  }) + '\n',
);
