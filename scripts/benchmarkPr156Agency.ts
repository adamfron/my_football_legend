import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { TacticalMatchState } from '../src/core/matchSimulation/matchState';
import { findCanonicalDifference as difference } from './pr156CanonicalComparison';

const args = new Map(
  process.argv.slice(2).map((s) => {
    const [k, ...v] = s.replace(/^--/, '').split('=');
    return [k, v.join('=')];
  }),
);
const config = z
  .object({
    seeds: z.array(z.string()).min(1),
    minutes: z.number().positive().max(90),
    root: z.string(),
  })
  .parse({
    seeds: (args.get('seeds') ?? 'lab-muwhj3er,pr155-natural-b,pr155-natural-c').split(','),
    minutes: Number(args.get('minutes') ?? 90),
    root: resolve(args.get('engine-root') ?? '.'),
  });
const load = <T>(path: string): Promise<T> =>
  import(pathToFileURL(resolve(config.root, path)).href);
const [worldModule, sessionModule, engine, decisions, stats, randomModule, actions] =
  await Promise.all([
    load<typeof import('./createCanonicalWorldDatabase')>(
      'scripts/createCanonicalWorldDatabase.ts',
    ),
    load<typeof import('../src/core/singleMatch')>('src/core/singleMatch.ts'),
    load<typeof import('../src/core/matchSimulation/matchSimulation')>(
      'src/core/matchSimulation/matchSimulation.ts',
    ),
    load<typeof import('../src/core/matchSimulation/playerDecision')>(
      'src/core/matchSimulation/playerDecision.ts',
    ),
    load<typeof import('../src/core/matchSimulation/playerMatchStats')>(
      'src/core/matchSimulation/playerMatchStats.ts',
    ),
    load<typeof import('../src/core/random/RandomGenerator')>('src/core/random/RandomGenerator.ts'),
    load<typeof import('../src/core/matchSimulation/matchActions')>(
      'src/core/matchSimulation/matchActions.ts',
    ),
  ]);
const world = worldModule.createCanonicalWorldDatabase();
let randomTrace = createHash('sha256'),
  randomCalls = 0,
  tracing = true;
let traceParts: string[] = [];
const flushTrace = () => {
  if (traceParts.length) {
    randomTrace.update(traceParts.join('\n') + '\n');
    traceParts = [];
  }
};
const float = randomModule.RandomGenerator.prototype.float;
randomModule.RandomGenerator.prototype.float = function () {
  const value = float.call(this);
  if (tracing) {
    traceParts.push(this.export());
    randomCalls++;
    if (traceParts.length >= 8192) flushTrace();
  }
  return value;
};
const digestTrace = () => {
  flushTrace();
  return randomTrace.digest('hex');
};
const resetTrace = () => {
  randomTrace = createHash('sha256');
  randomCalls = 0;
  traceParts = [];
  tracing = true;
};
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
// Exclude only the two experimental inputs. Every canonical football field, source and ledger remains.
const canonical = (s: TacticalMatchState) => {
  const { controlledFootballerId: _id, playerAgencyEnabled: _agency, ...football } = s;
  void _id;
  void _agency;
  return football;
};
const ended = (s: TacticalMatchState) =>
  ['full_time', 'abandoned'].includes(s.status ?? '') ||
  (config.minutes < 90 && s.time >= config.minutes * 60);
const advance = (s: TacticalMatchState) =>
  s.status === 'half_time'
    ? engine.startSecondHalf(s)
    : engine.stepTacticalMatchAfterDecisionProbe(s, engine.FIXED_MATCH_DT);
// Independent streams used by the engine derive from seed/action index/contact identity, rather than a mutable global RNG.
const rngHash = (s: TacticalMatchState) =>
  hash({
    seed: s.seed,
    decisionIndex: s.decisionIndex,
    ballEpisode: s.ballEpisode,
    challenge: s.defensiveChallenge,
    contact: s.lastBallContact,
    acquisition: s.ballAcquisition,
    shot: s.lastShot,
  });
const evidence = (s: TacticalMatchState) => ({
  time: s.time,
  status: s.status,
  canonicalHash: hash(canonical(s)),
  rngHash: rngHash(s),
  // Includes touches, receives, pass/carry/shot/challenge/interception/recovery counters for all starters.
  statistics: s.statistics,
  teamSupport: s.teams,
  positionalHash: hash(s.players),
  majorActionSource: s.latestActionSource,
  firstTimePass: s.lastResolvedPass,
});
const results: unknown[] = [];
const output = resolve(args.get('out') ?? '.benchmark-artifacts/pr156-agency.json');
const recheckIds = new Set((args.get('recheck-enabled') ?? '').split(',').filter(Boolean));
const shouldRecheck = (id: string) =>
  args.has('recheck-enabled') && (!recheckIds.size || recheckIds.has(id));
const resumed = args.has('resume')
  ? z
      .object({
        config: z.unknown(),
        results: z.array(
          z.object({ seed: z.string(), reference: z.unknown(), variants: z.array(z.unknown()) }),
        ),
      })
      .parse(JSON.parse(readFileSync(output, 'utf8')))
  : undefined;
if (resumed && hash(resumed.config) !== hash(config))
  throw new Error('Resume configuration differs');
const resumeVariantSchema = z.object({
  playerId: z.string(),
  disabled: z
    .object({
      canonicalHash: z.string(),
      randomStreamHash: z.string(),
      randomCalls: z.number(),
      firstDivergence: z.null(),
      matchesCanonical: z.literal(true),
      matchesRng: z.literal(true),
      decisionOpportunities: z.literal(0),
      statistics: z.unknown(),
      teamSupport: z.unknown(),
      positionalHash: z.string(),
    })
    .passthrough(),
  enabled: z.object({
    divergenceBeforeDecision: z.boolean(),
    prefixCanonicalHash: z.string(),
    referencePrefixCanonicalHash: z.string(),
  }),
});
mkdirSync(dirname(output), { recursive: true });
const save = () =>
  writeFileSync(
    output,
    JSON.stringify(
      {
        base: 'cdbf07e0696f95e17d9f064552e861cb5bff64e4',
        config,
        rngDefinition:
          'SHA256 of ordered actual post-draw RNG states, including seed hash/state/call count for every fromSeed/fork/import instance; prototype observation makes no extra draws. Batches of 8192 preserve exact call order.',
        identityExclusions: ['controlledFootballerId', 'playerAgencyEnabled'],
        results,
      },
      null,
      2,
    ) + '\n',
  );
for (const seed of config.seeds) {
  const initial = engine.createTacticalMatch(
    sessionModule.createSingleMatchSession(world, {
      homeClubId: 'pro_9',
      awayClubId: 'pro_1',
      seed,
      control: { mode: 'spectator' },
    }),
  );
  initial.teams.home.style = 'balanced';
  initial.teams.away.style = 'pressing';
  // Fix the XI once. Selecting an identity never invokes forceIntoXI or changes the session.
  const checkpoints: { state: TacticalMatchState; hash: string; tick: number }[] = [
    { state: initial, hash: hash(canonical(initial)), tick: 0 },
  ];
  let cpu = initial,
    ticks = 0;
  resetTrace();
  const started = performance.now();
  while (!ended(cpu)) {
    cpu = advance(cpu);
    ticks++;
    if (ticks % 400 === 0 || ended(cpu))
      checkpoints.push({ state: cpu, hash: hash(canonical(cpu)), tick: ticks });
  }
  stats.assertMatchStatisticsInvariants(cpu.statistics!, cpu);
  const reference = { ...evidence(cpu), randomStreamHash: digestTrace(), randomCalls };
  const priorResult = resumed?.results.find((r) => r.seed === seed);
  if (priorResult && hash(priorResult.reference) !== hash(reference))
    throw new Error(`Resume CPU reference differs: ${seed}`);
  const variants: unknown[] = priorResult ? [...priorResult.variants] : [];
  const completedIds = new Set<string>();
  for (const row of variants) {
    const v = resumeVariantSchema.parse(row);
    if (
      completedIds.has(v.playerId) ||
      !initial.players.some((p) => p.id === v.playerId) ||
      v.disabled.canonicalHash !== reference.canonicalHash ||
      v.disabled.randomStreamHash !== reference.randomStreamHash ||
      v.disabled.randomCalls !== reference.randomCalls ||
      hash(v.disabled.statistics) !== hash(reference.statistics) ||
      hash(v.disabled.teamSupport) !== hash(reference.teamSupport) ||
      v.disabled.positionalHash !== reference.positionalHash ||
      (v.enabled.prefixCanonicalHash !== v.enabled.referencePrefixCanonicalHash &&
        !shouldRecheck(v.playerId)) ||
      (v.enabled.divergenceBeforeDecision && !shouldRecheck(v.playerId))
    )
      throw new Error(`Invalid completed resume row: ${v.playerId}`);
    completedIds.add(v.playerId);
  }
  const result = {
    seed,
    fixture: {
      home: 'pro_9',
      away: 'pro_1',
      homeFormation: initial.teams.home.formation,
      awayFormation: initial.teams.away.formation,
      homeStyle: 'balanced',
      awayStyle: 'pressing',
    },
    reference,
    variants,
    ticks,
    elapsedMs: 0,
    complete: false,
  };
  results.push(result);
  save();
  const runDisabled = (playerId: string) => {
    let state: TacticalMatchState = {
      ...initial,
      controlledFootballerId: playerId,
      playerAgencyEnabled: false,
    };
    resetTrace();
    let firstDivergence: { at: number; path: string | null } | null = null;
    let prior = checkpoints[0]!,
      priorVariant: TacticalMatchState = state,
      checkpoint = 1;
    for (let tick = 1; tick <= ticks; tick++) {
      state = advance(state);
      const cp = checkpoints[checkpoint];
      if (cp?.tick === tick) {
        if (!firstDivergence && hash(canonical(state)) !== cp.hash) {
          tracing = false;
          let a = prior.state,
            b = priorVariant;
          for (let t = prior.tick + 1; t <= tick; t++) {
            a = advance(a);
            b = advance(b);
            const path = difference(canonical(a), canonical(b));
            if (path !== null) {
              firstDivergence = { at: b.time, path };
              break;
            }
          }
          tracing = true;
        }
        prior = cp;
        priorVariant = state;
        checkpoint++;
      }
    }
    return {
      ...evidence(state),
      randomStreamHash: digestTrace(),
      randomCalls,
      firstDivergence,
    };
  };
  for (const player of initial.players) {
    if (completedIds.has(player.id) && !shouldRecheck(player.id)) continue;
    const existingIndex = variants.findIndex(
      (row) => resumeVariantSchema.parse(row).playerId === player.id,
    );
    const stored =
      existingIndex >= 0 ? resumeVariantSchema.parse(variants[existingIndex]) : undefined;
    const disabled = stored?.disabled ?? runDisabled(player.id);
    tracing = false;
    let enabled: TacticalMatchState = {
      ...initial,
      controlledFootballerId: player.id,
      playerAgencyEnabled: true,
    };
    let ref = initial,
      firstEnabledDivergence: { at: number; path: string | null } | null = null;
    let matchingRef = ref,
      matchingEnabled = enabled,
      divergenceAtOpportunityBoundary = false;
    let opportunity: ReturnType<typeof decisions.projectPlayerDecisionOpportunity>;
    // Compare the entire prefix before the first human choice. Stop at the actual decision boundary.
    while (!ended(enabled)) {
      opportunity = decisions.projectPlayerDecisionOpportunity(enabled);
      if (opportunity) break;
      ref = advance(ref);
      enabled = advance(enabled);
      if (!firstEnabledDivergence) {
        // Compare every field directly. Repeated JSON serialization of complete growing
        // ledgers is unnecessary; final prefix hashes still include their full contents.
        const path = difference(canonical(ref), canonical(enabled));
        if (path !== null) {
          firstEnabledDivergence = { at: enabled.time, path };
          // A newly available choice may stop the controlled action at the end of
          // this very tick while CPU executes it. Preserve that difference and
          // compare the preceding complete prefix, rather than calling the action
          // boundary an earlier identity leak or filtering action fields away.
          opportunity = decisions.projectPlayerDecisionOpportunity(enabled);
          if (opportunity) {
            divergenceAtOpportunityBoundary = true;
            break;
          }
        } else {
          matchingRef = ref;
          matchingEnabled = enabled;
        }
      }
    }
    const selected = opportunity?.options
      .map((option) => ({
        option,
        score:
          option.kind === 'action'
            ? actions.scoreActionForAI(enabled, player.id, option.action)
            : -20,
      }))
      .sort((a, b) => b.score - a.score || a.option.id.localeCompare(b.option.id))[0]?.option;
    const firstHumanDecision =
      opportunity && selected
        ? {
            at: enabled.time,
            kind: opportunity.kind,
            id: opportunity.id,
            option: selected.id,
            source: 'human_selected',
          }
        : null;
    const divergenceBeforeChoice =
      Boolean(firstEnabledDivergence) && !divergenceAtOpportunityBoundary;
    const afterChoice =
      opportunity && selected
        ? decisions.applyPlayerDecision(enabled, opportunity, selected.id)
        : enabled;
    if (firstHumanDecision && !firstEnabledDivergence) {
      const path = difference(canonical(ref), canonical(afterChoice));
      if (path !== null) firstEnabledDivergence = { at: firstHumanDecision.at, path };
    }
    const variant = {
      playerId: player.id,
      role: player.slot.position,
      team: player.team,
      disabled: {
        ...disabled,
        firstDivergence: disabled.firstDivergence,
        matchesCanonical: disabled.canonicalHash === reference.canonicalHash,
        matchesRng:
          disabled.randomStreamHash === reference.randomStreamHash &&
          disabled.randomCalls === reference.randomCalls,
        decisionOpportunities: 0,
      },
      enabled: {
        firstHumanDecision,
        firstDivergence: firstEnabledDivergence,
        divergenceBeforeDecision: divergenceBeforeChoice,
        ...(divergenceAtOpportunityBoundary
          ? {
              divergenceAtOpportunityBoundary: true,
              prefixComparedThrough: matchingEnabled.time,
              opportunityBoundaryHashes: {
                reference: hash(canonical(ref)),
                controlled: hash(canonical(enabled)),
              },
            }
          : {}),
        involvementBeforeChoice: enabled.statistics?.players.find((p) => p.playerId === player.id),
        prefixCanonicalHash: hash(canonical(matchingEnabled)),
        referencePrefixCanonicalHash: hash(canonical(matchingRef)),
      },
    };
    if (existingIndex >= 0) variants[existingIndex] = variant;
    else variants.push(variant);
    process.stderr.write(
      `${seed} ${player.id}: disabled ${disabled.firstDivergence ? JSON.stringify(disabled.firstDivergence) : 'parity'}, first human ${firstHumanDecision?.at ?? 'none'}\n`,
    );
    result.elapsedMs = performance.now() - started;
    save();
  }
  result.complete = true;
  save();
}
