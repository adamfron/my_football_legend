import { mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import type { MatchPlayerState, TacticalMatchState } from '../src/core/matchSimulation/matchState';

const args = new Map(
  process.argv.slice(2).map((s) => {
    const [key, ...value] = s.replace(/^--/, '').split('=');
    return [key, value.join('=')];
  }),
);
const root = resolve(args.get('engine-root') ?? '.');
const fingerprint = () => {
  const directory = resolve(root, 'src/core/matchSimulation');
  const files = readdirSync(directory)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .sort();
  const hash = createHash('sha256');
  for (const name of files)
    hash
      .update(relative(directory, resolve(directory, name)).replaceAll('\\', '/'))
      .update('\0')
      .update(readFileSync(resolve(directory, name)))
      .update('\0');
  return {
    algorithm: 'sha256',
    scope:
      'Sorted non-test .ts files in src/core/matchSimulation; relative path + NUL + bytes + NUL',
    files: files.length,
    digest: hash.digest('hex'),
  };
};
const initialFingerprint = fingerprint();
const physicalContactsObservable = existsSync(
  resolve(root, 'src/core/matchSimulation/ballContactGeometry.ts'),
);
const load = <T>(path: string): Promise<T> => import(pathToFileURL(resolve(root, path)).href);
const [world, sessions, engine, preparation, actions] = await Promise.all([
  load<typeof import('./createCanonicalWorldDatabase')>('scripts/createCanonicalWorldDatabase.ts'),
  load<typeof import('../src/core/singleMatch')>('src/core/singleMatch.ts'),
  load<typeof import('../src/core/matchSimulation/matchSimulation')>(
    'src/core/matchSimulation/matchSimulation.ts',
  ),
  load<typeof import('../src/core/matchSimulation/onBallPreparation')>(
    'src/core/matchSimulation/onBallPreparation.ts',
  ),
  load<typeof import('../src/core/matchSimulation/matchActions')>(
    'src/core/matchSimulation/matchActions.ts',
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
    seed: 'pr158-contact-template',
    control: { mode: 'spectator' },
  }),
);
const attackerId = template.players.find(
  (p) => p.team === 'home' && p.slot.position === 'central_midfielder',
)!.id;
const defenderId = template.players.find(
  (p) => p.team === 'away' && p.slot.position === 'center_back',
)!.id;
const contextSchema = z.enum([
  'stationary',
  'moving',
  'sharp_turn',
  'shallow_turn',
  'roulette',
  'shield_front',
  'shield_side',
  'shield_back',
  'shield_two',
  'push_run',
  'release',
  'shield_release',
  'touchline',
  'autonomous',
  'first_time_pass',
]);
const cellSchema = z.object({
  id: z.string(),
  context: contextSchema,
  attacker: z.record(z.string(), z.number()).optional(),
  defender: z.record(z.string(), z.number()).optional(),
  approachAngle: z.number().optional(),
  approachSpeed: z.number().optional(),
  booked: z.boolean().optional(),
  ballOffset: z.number().optional(),
  bodyOrientation: z.number().optional(),
});
type Cell = z.infer<typeof cellSchema>;
const cells: Cell[] = contextSchema.options.map((context) => ({
  id: `context:${context}`,
  context,
}));
for (const attribute of [
  'dribbling',
  'technique',
  'agility',
  'firstTouch',
  'strength',
  'composure',
])
  for (const band of [20, 60, 95])
    cells.push({
      id: `attacker:${attribute}:${band}`,
      context: 'sharp_turn',
      attacker: { [attribute]: band },
    });
for (const attribute of ['aggression', 'tackling', 'gameReading'])
  for (const band of [20, 95])
    cells.push({
      id: `defender:${attribute}:${band}`,
      context: 'roulette',
      defender: { [attribute]: band },
    });
for (const angle of [0, Math.PI / 2, Math.PI])
  cells.push({ id: `approach:${angle}`, context: 'sharp_turn', approachAngle: angle });
for (const speed of [0, 5])
  cells.push({ id: `relative_speed:${speed}`, context: 'sharp_turn', approachSpeed: speed });
for (const offset of [0.32, 1.2])
  cells.push({ id: `offset:${offset}`, context: 'sharp_turn', ballOffset: offset });
for (const orientation of [0, Math.PI / 2, -Math.PI / 2])
  cells.push({
    id: `body_orientation:${orientation}`,
    context: 'sharp_turn',
    bodyOrientation: orientation,
  });
for (const strength of [20, 60, 95])
  cells.push({ id: `shield_strength:${strength}`, context: 'shield_two', attacker: { strength } });
cells.push(
  { id: 'booked', context: 'roulette', booked: true },
  {
    id: 'elite:roulette',
    context: 'roulette',
    attacker: { dribbling: 95, technique: 95, agility: 95, firstTouch: 95, composure: 95 },
  },
  {
    id: 'low:roulette',
    context: 'roulette',
    attacker: { dribbling: 20, technique: 20, agility: 20, firstTouch: 20, composure: 20 },
  },
);
cells.forEach((cell) => cellSchema.parse(cell));
const selected = args.has('cells')
  ? cells.filter((c) => args.get('cells')!.split(',').includes(c.id))
  : cells;
const metres = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);
const norm = (angle: number) =>
  ((((angle + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
const fixture = (cell: Cell, repetition: number): TacticalMatchState => {
  const state = structuredClone(template);
  state.seed = `pr158-contact-paired:${repetition}`;
  state.time = 600;
  state.status = 'first_half';
  state.scenario = 'open_play';
  delete state.restart;
  delete state.planningSchedule;
  delete state.currentAction;
  delete state.ballCarrierIntent;
  state.players.forEach((p, i) => {
    for (const key of Object.keys(
      p.profile.attributes,
    ) as (keyof MatchPlayerState['profile']['attributes'])[])
      p.profile.attributes[key] = 60;
    p.position = {
      x: p.team === 'home' ? 20 - (i % 3) * 4 : 85 + (i % 3) * 4,
      y: 4 + (i % 10) * 6,
    };
    p.target = { ...p.position };
    p.idealTarget = { ...p.position };
    p.velocity = { x: 0, y: 0 };
  });
  const a = state.players.find((p) => p.id === attackerId)!;
  const d = state.players.find((p) => p.id === defenderId)!;
  Object.assign(a.profile.attributes, cell.attacker);
  Object.assign(d.profile.attributes, { aggression: 85, ...cell.defender });
  a.position = { x: 52, y: cell.context === 'touchline' ? 1.1 : 34 };
  a.target = { ...a.position };
  a.facingAngle = cell.bodyOrientation ?? Math.PI / 2;
  const angle =
    cell.approachAngle ??
    (cell.context === 'shield_side' ? Math.PI / 2 : cell.context === 'shield_back' ? Math.PI : 0);
  d.position = {
    x: a.position.x + Math.cos(angle) * (3.5 + (repetition % 4) * 0.12),
    y: a.position.y + Math.sin(angle) * 3.5,
  };
  d.anchor = { ...d.position };
  d.target = { ...d.position };
  d.facingAngle = Math.atan2(a.position.x - d.position.x, a.position.y - d.position.y);
  d.velocity = {
    x: -Math.cos(angle) * (cell.approachSpeed ?? 2),
    y: -Math.sin(angle) * (cell.approachSpeed ?? 2),
  };
  const cover = state.players.filter(
    (p) => p.team === 'away' && p.id !== d.id && p.slot.position !== 'goalkeeper',
  );
  cover.slice(0, 3).forEach((p, i) => {
    p.position = { x: 65 + i * 4, y: 26 + i * 8 };
    p.target = { ...p.position };
  });
  if (cell.context === 'shield_two') {
    cover[0]!.position = { x: 49.5, y: 35 };
    cover[0]!.target = { ...cover[0]!.position };
    cover[0]!.facingAngle = Math.PI / 2;
  }
  if (['first_time_pass', 'shield_release'].includes(cell.context)) {
    const receiver =
      state.players.find(
        (p) => p.team === 'home' && p.id !== a.id && p.slot.position === 'central_midfielder',
      ) ?? state.players.find((p) => p.team === 'home' && p.id !== a.id)!;
    receiver.position = { x: 49, y: 43 };
    receiver.target = { ...receiver.position };
    receiver.facingAngle = Math.atan2(
      a.position.x - receiver.position.x,
      a.position.y - receiver.position.y,
    );
  }
  a.velocity =
    cell.context === 'moving' || cell.context === 'push_run' ? { x: 3, y: 0 } : { x: 0, y: 0 };
  state.ball = {
    x: a.position.x + (cell.ballOffset ?? 0.45),
    y: a.position.y,
    height: 0,
    ownerId: a.id,
    lastTouchPlayerId: a.id,
  };
  state.possessionTeam = 'home';
  state.timeSincePossessionChanged = 3;
  state.currentPressure = 0.6;
  state.nearestChallengerId = d.id;
  state.actionCooldown = ['release', 'autonomous'].includes(cell.context) ? 0 : 20;
  state.onBallPreparation = preparation.deriveOnBallPreparation(state, a, 'clean_control');
  state.teams.home.phase = 'positional_attack';
  state.teams.away.phase = 'defensive_block';
  if (cell.booked) state.discipline = { [d.id]: { yellowCards: 1, sentOff: false, team: 'away' } };
  if (!['stationary', 'release', 'autonomous', 'first_time_pass'].includes(cell.context)) {
    const shield = cell.context.startsWith('shield');
    const target = {
      x: a.position.x + (cell.context === 'sharp_turn' || cell.context === 'roulette' ? -10 : 10),
      y: a.position.y + (cell.context === 'shallow_turn' ? 3 : 0),
    };
    state.ballCarrierIntent = {
      actorId: a.id,
      type: 'carry',
      target: shield ? { ...a.position } : target,
      startPosition: { ...a.position },
      closestPointReached: { ...a.position },
      startedAt: state.time,
      expiresAt: state.time + 10,
      estimatedArrival: state.time + 5,
      humanSelected: false,
      movementMode: shield ? 'retain' : cell.context === 'push_run' ? 'sprint' : 'dribble',
      ...(shield ? { executionMode: 'shield' as const } : {}),
    };
  }
  return state;
};
const rows = [];
const started = performance.now();
for (const cell of selected) {
  const samples = [];
  for (let repetition = 0; repetition < configuration.repetitions; repetition++) {
    let state = fixture(cell, repetition);
    const origin = { ...state.players.find((p) => p.id === attackerId)!.position };
    const start = state.time;
    let travelled = 0,
      rotation = 0,
      ballTravel = 0,
      ownedSeconds = 0,
      exposedSeconds = 0,
      contacts = 0,
      revisions = 0,
      carries = 0,
      passRelease = false,
      maxAngularSpeed = 0;
    let previousHeading: number | undefined;
    let initialEpisodeActive = true;
    let interruptionCensored = false;
    let controlEndPosition = { ...origin };
    const trace = [];
    for (let step = 0; step < configuration.seconds / 0.025; step++) {
      const prev = state;
      const pa = prev.players.find((p) => p.id === attackerId)!;
      if (
        (cell.context === 'first_time_pass' && step === 0) ||
        (cell.context === 'shield_release' && step === 30 && state.ball.ownerId === attackerId)
      ) {
        const receiver = state.players.find(
          (p) => p.team === 'home' && p.id !== attackerId && metres(p.position, origin) < 12,
        )!;
        state = actions.resolveMatchAction(
          { ...state, actionCooldown: 0 },
          {
            type: 'pass',
            actorId: attackerId,
            receiverId: receiver.id,
            target: receiver.position,
            intent: 'support',
            firstTime: cell.context === 'first_time_pass',
          },
          'autonomous_npc',
        );
      }
      // Selected two-contact change uses the ordinary canonical intention and locomotion;
      // this is a demanded turn experiment, not a claim about autonomous roulette selection.
      if (cell.context === 'roulette' && step === 30 && state.ballCarrierIntent) {
        state = {
          ...state,
          ballCarrierIntent: {
            ...state.ballCarrierIntent,
            target: { x: origin.x + 12, y: origin.y + 4 },
          },
        };
        revisions++;
      }
      state = engine.stepTacticalMatch(state, 0.025);
      const a = state.players.find((p) => p.id === attackerId)!;
      const d = state.players.find((p) => p.id === defenderId)!;
      const da = Math.abs(norm(a.facingAngle - pa.facingAngle));
      // Restart/period setup can retain the owner's identity while placing their
      // body elsewhere. Discard the entire interrupting interval before measuring
      // displacement or rotation; it is not a carrier movement or foot contact.
      if (
        initialEpisodeActive &&
        (prev.scenario !== 'open_play' ||
          state.scenario !== 'open_play' ||
          prev.restart !== undefined ||
          state.restart !== undefined ||
          prev.status !== state.status ||
          !['first_half', 'second_half'].includes(state.status ?? ''))
      ) {
        initialEpisodeActive = false;
        interruptionCensored = true;
      }
      if (initialEpisodeActive && prev.ball.ownerId === attackerId) {
        travelled += metres(pa.position, a.position);
        rotation += da;
        maxAngularSpeed = Math.max(maxAngularSpeed, da / 0.025);
        ballTravel += metres(prev.ball, state.ball);
        controlEndPosition = { ...a.position };
      }
      if (initialEpisodeActive && state.ball.ownerId === attackerId) {
        ownedSeconds += 0.025;
        if (metres(d.position, state.ball) <= 0.95) exposedSeconds += 0.025;
      }
      const contactState = (
        state as TacticalMatchState & {
          controlledBallContact?: {
            actorId: string;
            lastContactAt: number;
            physicalContacts: number;
            nextContact?: { earliestAt: number };
          };
        }
      ).controlledBallContact;
      if (
        initialEpisodeActive &&
        contactState?.actorId === attackerId &&
        contactState?.lastContactAt !==
          (prev as typeof state & { controlledBallContact?: { lastContactAt: number } })
            .controlledBallContact?.lastContactAt &&
        contactState
      )
        contacts++;
      if (
        state.ballCarrierIntent?.startedAt !== prev.ballCarrierIntent?.startedAt &&
        initialEpisodeActive &&
        state.ballCarrierIntent?.actorId === attackerId
      )
        carries++;
      const t = state.ballCarrierIntent?.localTarget;
      if (t && initialEpisodeActive) {
        const h = Math.atan2(t.x - a.position.x, t.y - a.position.y);
        if (previousHeading !== undefined && Math.abs(norm(h - previousHeading)) > Math.PI / 2)
          revisions++;
        previousHeading = h;
      }
      if (state.ball.ownerId !== attackerId) initialEpisodeActive = false;
      if (
        state.lastPassDiagnostic?.passerId === attackerId &&
        state.lastPassDiagnostic.releasedAt >= start
      )
        passRelease = true;
      if (repetition === 0 && step % 10 === 0)
        trace.push({
          at: state.time - start,
          orientation: a.facingAngle,
          angularVelocity: norm(a.facingAngle - pa.facingAngle) / 0.025,
          body: a.position,
          ball: { x: state.ball.x, y: state.ball.y },
          ballVelocity: state.ball.velocity ?? null,
          relativeBallVelocity: state.ball.velocity
            ? { x: state.ball.velocity.x - a.velocity.x, y: state.ball.velocity.y - a.velocity.y }
            : null,
          defenderBody: metres(d.position, a.position),
          defenderBall: metres(d.position, state.ball),
          defenderEta:
            Math.max(0, metres(d.position, state.ball) - 0.95) /
            Math.max(1, Math.hypot(d.velocity.x, d.velocity.y)),
          nextContactEta: contactState?.nextContact
            ? Math.max(0, contactState.nextContact.earliestAt - state.time)
            : null,
          owner: state.ball.ownerId ?? null,
          scenario: state.scenario,
          status: state.status,
          restartPhase: state.restart?.phase ?? null,
          initialEpisodeActive,
          physicalContacts: physicalContactsObservable ? contacts : null,
          lastPhysicalContactAt:
            contactState && contactState.physicalContacts > 0 ? contactState.lastContactAt : null,
          lastChallengeOutcome: state.lastChallenge?.outcome ?? null,
          passReleasedAt:
            state.lastPassDiagnostic?.passerId === attackerId &&
            state.lastPassDiagnostic.releasedAt >= start
              ? state.lastPassDiagnostic.releasedAt
              : null,
        });
    }
    const net = metres(origin, controlEndPosition);
    samples.push({
      rotationDegrees: (rotation * 180) / Math.PI,
      maxAngularSpeed,
      netDisplacement: net,
      travelled,
      ballTravel,
      ownedSeconds,
      exposedSeconds,
      physicalContacts: physicalContactsObservable ? contacts : null,
      directionRevisions: revisions,
      repeatedCarrySelections: carries,
      interruptionCensored,
      passRelease,
      retained: state.ball.ownerId === attackerId,
      stationaryPirouette: rotation > Math.PI && net < 2,
      completeRotationLittleProgress: rotation > 2 * Math.PI && net < 3,
      attempts: state.defensiveTelemetry?.attempted ?? 0,
      clean: state.defensiveTelemetry?.cleanWins ?? 0,
      loose: state.defensiveTelemetry?.looseBalls ?? 0,
      fouls: state.defensiveTelemetry?.fouls ?? 0,
      ...(trace.length ? { trace } : {}),
    });
  }
  rows.push({ cell, samples });
}
const result = {
  configuration,
  engineRoot: root,
  sourceFingerprint: initialFingerprint,
  methodology:
    'Paired seed by repetition; canonical 25ms engine. Carrier rotation/displacement/contact metrics stop at the first initial ownership loss or interruption (restart, non-open-play scenario or period change); the entire interrupting interval is excluded before measuring placement movement. Six-second traces and aggregate defender events continue to final outcome, including the final owner identity in retained. Sharp/roulette are explicit requested direction experiments. Physical contacts unavailable in PR157 are null, never zero actual. Eta uses bounded speed proxy for defender; next-contact ETA absent in baseline. No provider-count equivalence.',
  wallSeconds: (performance.now() - started) / 1000,
  rows,
};
const output = resolve(args.get('output') ?? 'work/pr158-contact.json');
if (fingerprint().digest !== initialFingerprint.digest)
  throw new Error('Canonical source changed during contact benchmark; rerun the paired evidence.');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(result, null, 2));
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const summary = rows.map(({ cell, samples }) => ({
  cell,
  duels: samples.length,
  stationaryPirouettes: samples.filter((s) => s.stationaryPirouette).length,
  completeRotationLittleProgress: samples.filter((s) => s.completeRotationLittleProgress).length,
  retained: samples.filter((s) => s.retained).length,
  passReleases: samples.filter((s) => s.passRelease).length,
  attempts: sum(samples.map((s) => s.attempts)),
  clean: sum(samples.map((s) => s.clean)),
  loose: sum(samples.map((s) => s.loose)),
  fouls: sum(samples.map((s) => s.fouls)),
  physicalContacts: physicalContactsObservable
    ? sum(samples.map((s) => s.physicalContacts ?? 0))
    : null,
  meanRotationDegrees: sum(samples.map((s) => s.rotationDegrees)) / samples.length,
  meanNetMetres: sum(samples.map((s) => s.netDisplacement)) / samples.length,
  meanTravelledMetres: sum(samples.map((s) => s.travelled)) / samples.length,
  ownedSeconds: sum(samples.map((s) => s.ownedSeconds)),
  exposedSeconds: sum(samples.map((s) => s.exposedSeconds)),
  directionRevisions: sum(samples.map((s) => s.directionRevisions)),
  repeatedCarrySelections: sum(samples.map((s) => s.repeatedCarrySelections)),
  interruptionCensored: samples.filter((s) => s.interruptionCensored).length,
}));
writeFileSync(
  output.replace(/\.json$/, '-summary.json'),
  JSON.stringify(
    {
      configuration,
      sourceFingerprint: initialFingerprint,
      methodology: result.methodology,
      rows: summary,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    output,
    cells: rows.length,
    duels: rows.length * configuration.repetitions,
    wallSeconds: result.wallSeconds,
  }),
);
