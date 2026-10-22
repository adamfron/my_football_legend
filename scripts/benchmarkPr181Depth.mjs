import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import console from 'node:console';
import process from 'node:process';
import { URL } from 'node:url';
import { z } from 'zod';
import { configureMatchPolicy } from '../src/core/matchSimulation/roleExperiment.ts';
import {
  stepTacticalMatchAfterDecisionProbe,
  startSecondHalf,
} from '../src/core/matchSimulation/matchSimulation.ts';
import { secondLastOpponentLine } from '../src/core/matchSimulation/offside.ts';
import {
  attacksRight,
  distance,
  pitchPointSchema,
  physicalPointSchema,
} from '../src/core/matchSimulation/matchSpace.ts';
import { isMatchGoalkeeper } from '../src/core/matchSimulation/matchGoalkeeper.ts';
import { canParticipatePhysically } from '../src/core/matchSimulation/matchInjuries.ts';
import { assertMatchStatisticsInvariants } from '../src/core/matchSimulation/playerMatchStats.ts';
import { pr172SourceHash } from './pr172Evidence.ts';
const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.join('=')];
  }),
);
const policy = args.get('policy') ?? 'phase-role-hybrid-v1',
  out = args.get('out') ?? '../pr181-lineage';
mkdirSync(out, { recursive: true });
const sourceHash = pr172SourceHash(),
  harnessHash = createHash('sha256')
    .update(readFileSync(new URL(import.meta.url)))
    .digest('hex');
const hash = (s) => createHash('sha256').update(JSON.stringify(s)).digest('hex');
const recordSchema = z.object({
  passId: z.string(),
  passerId: z.string(),
  team: z.enum(['home', 'away']),
  dir: z.union([z.literal(-1), z.literal(1)]),
  intendedReceiverId: z.string(),
  releasedAt: z.number(),
  releaseLine: z.number(),
  snapshotMatched: z.boolean(),
  target: physicalPointSchema,
  targetBehind: z.boolean(),
  intendedOffside: z.boolean().optional(),
  outcome: z.string(),
  resolvedAt: z.number().optional(),
  actualReceiverId: z.string().optional(),
  contact: pitchPointSchema.optional(),
  contactBeyondReleaseLine: z.boolean().optional(),
  contactBeyondCurrentDefence: z.boolean().optional(),
});
const carryEpisodeSchema = z.object({
  actorId: z.string(),
  team: z.enum(['home', 'away']),
  defenderId: z.string(),
  startAt: z.number().nonnegative(),
  endAt: z.number().nonnegative(),
  start: pitchPointSchema,
  end: pitchPointSchema.optional(),
  dir: z.union([z.literal(-1), z.literal(1)]),
  passedMarkerWithControl: z.boolean(),
  peakSpeed: z.number().nonnegative().finite(),
  peakBallSeparation: z.number().nonnegative().finite(),
  result: z.string(),
});
const fixtures = JSON.parse(
  gunzipSync(readFileSync('docs/performance/pr181-evidence/development.json.gz')),
);
for (const input of fixtures) {
  const resultPath = `${out}/${input.design.id}-${policy}.json.gz`;
  if (args.has('resume') && existsSync(resultPath)) {
    const saved = JSON.parse(gunzipSync(readFileSync(resultPath))),
      original = JSON.parse(
        gunzipSync(
          readFileSync(`../pr181-final-v4/${policy}/${input.design.id}-${policy}.json.gz`),
        ),
      );
    if (
      saved.sourceHash !== sourceHash ||
      saved.inputHash !== input.inputHash ||
      saved.finalHash !== original.finalHash ||
      saved.ticks !== original.ticks ||
      saved.status !== 'full_time' ||
      saved.policy !== policy ||
      saved.design.id !== input.design.id ||
      !saved.observerReplayEqual
    )
      throw Error('Cannot resume inconsistent lineage artifact');
    saved.records.forEach((r) => recordSchema.parse(r));
    saved.carryEpisodes.forEach((e) => carryEpisodeSchema.parse(e));
    console.log(JSON.stringify({ id: input.design.id, policy, resumed: true }));
    continue;
  }
  let state = configureMatchPolicy(globalThis.structuredClone(input.state), policy),
    ticks = 0;
  const passes = new Map();
  const carryEpisodes = [];
  let activeCarry;
  const finishCarry = (result) => {
    if (!activeCarry) return;
    const actor = state.players.find((p) => p.id === activeCarry.actorId);
    carryEpisodes.push({ ...activeCarry, endAt: state.time, end: actor?.position, result });
    activeCarry = undefined;
  };
  while (!['full_time', 'abandoned'].includes(state.status) && state.time < 7200) {
    if (state.status === 'half_time') state = startSecondHalf(state);
    const previous = state;
    state = stepTacticalMatchAfterDecisionProbe(state, 0.025);
    ticks++;
    const owner = state.players.find((p) => p.id === state.ball.ownerId);
    if (activeCarry) {
      const actor = state.players.find((p) => p.id === activeCarry.actorId);
      const marker = state.players.find((p) => p.id === activeCarry.defenderId);
      const released = (state.actionEvents ?? []).some(
        (e) =>
          e.at > previous.time - 1e-6 &&
          e.actorId === activeCarry.actorId &&
          ['pass', 'through_pass', 'cross', 'shot'].includes(e.kind),
      );
      if (actor) {
        activeCarry.peakSpeed = Math.max(
          activeCarry.peakSpeed,
          Math.hypot(actor.velocity.x, actor.velocity.y),
        );
        if (state.ball.ownerId === actor.id) {
          activeCarry.peakBallSeparation = Math.max(
            activeCarry.peakBallSeparation,
            distance(actor.position, state.ball),
          );
          if (
            marker &&
            activeCarry.dir * (actor.position.x - marker.position.x) > 1 &&
            distance(actor.position, activeCarry.start) > 1
          )
            activeCarry.passedMarkerWithControl = true;
        }
      }
      if (released) finishCarry('deliberate_release');
      else if (state.restart || ['half_time', 'full_time', 'abandoned'].includes(state.status))
        finishCarry('stoppage');
      else if (owner && owner.team !== activeCarry.team) finishCarry('opponent_control');
      else if (owner && owner.id !== activeCarry.actorId) finishCarry('teammate_control');
      else if (!actor) finishCarry('player_departed');
      else if (!owner && state.time - activeCarry.lastOwnedAt > 1.5) finishCarry('loose');
      else if (owner?.id === activeCarry.actorId) activeCarry.lastOwnedAt = state.time;
    }
    if (
      !activeCarry &&
      owner &&
      state.ballCarrierIntent?.actorId === owner.id &&
      Math.abs(owner.position.y - 34) > 15 &&
      !state.restart &&
      !state.postGoal &&
      state.status !== 'full_time'
    ) {
      const dir = attacksRight(owner) ? 1 : -1;
      const marker = state.players
        .filter(
          (p) => p.team !== owner.team && !isMatchGoalkeeper(p) && canParticipatePhysically(p),
        )
        .sort(
          (a, b) => distance(a.position, owner.position) - distance(b.position, owner.position),
        )[0];
      if (
        marker &&
        distance(marker.position, owner.position) <= 8 &&
        dir * (owner.position.x - marker.position.x) <= 1
      )
        activeCarry = {
          actorId: owner.id,
          team: owner.team,
          defenderId: marker.id,
          startAt: state.time,
          lastOwnedAt: state.time,
          start: { ...owner.position },
          dir,
          passedMarkerWithControl: false,
          peakSpeed: Math.hypot(owner.velocity.x, owner.velocity.y),
          peakBallSeparation: distance(owner.position, state.ball),
        };
    }
    for (const p of [state.lastPassDiagnostic, state.lastResolvedPass].filter(Boolean)) {
      let record = passes.get(p.passId);
      if (!record) {
        const passer =
          state.players.find((x) => x.id === p.passerId) ??
          previous.players.find((x) => x.id === p.passerId);
        if (!passer) throw Error('Unknown passer');
        const dir = attacksRight(passer) ? 1 : -1,
          snapshot = state.offsideSnapshot;
        const snapshotMatched = Boolean(
          snapshot &&
            snapshot.passerId === p.passerId &&
            Math.abs(snapshot.releasedAt - p.releasedAt) < 1e-6,
        );
        const rawLine = snapshotMatched
          ? snapshot.offsideLineX
          : dir > 0
            ? Math.max(previous.ball.x, secondLastOpponentLine(previous, passer.team))
            : Math.min(previous.ball.x, secondLastOpponentLine(previous, passer.team));
        const releaseLine = dir > 0 ? Math.max(52.5, rawLine) : Math.min(52.5, rawLine),
          target = p.physicalTarget ?? p.predictedReceptionPoint;
        record = {
          passId: p.passId,
          passerId: p.passerId,
          team: passer.team,
          intendedReceiverId: p.intendedReceiverId,
          releasedAt: p.releasedAt,
          releaseLine,
          snapshotMatched,
          target,
          targetBehind: dir * (target.x - releaseLine) > 0.5,
          ...(snapshotMatched
            ? { intendedOffside: snapshot.offsidePlayerIds.includes(p.intendedReceiverId) }
            : {}),
          outcome: 'unresolved',
          dir,
        };
        passes.set(p.passId, record);
      }
      if (p.finalResult && record.resolvedAt === undefined) {
        record.outcome = p.finalResult;
        record.resolvedAt = p.resolvedAt ?? state.time;
        if (p.actualReceiverId) record.actualReceiverId = p.actualReceiverId;
        if (p.actualContactPoint) {
          record.contact = { x: p.actualContactPoint.x, y: p.actualContactPoint.y };
          record.contactBeyondReleaseLine =
            record.dir * (record.contact.x - record.releaseLine) > 0.5;
          record.contactBeyondCurrentDefence =
            record.dir * (record.contact.x - secondLastOpponentLine(state, record.team)) > 0.5;
        }
      }
    }
  }
  finishCarry('unresolved_at_full_time');
  const episodes = carryEpisodes.map((e) => carryEpisodeSchema.parse(e));
  const observed = JSON.parse(
    gunzipSync(readFileSync(`../pr181-final-v4/${policy}/${input.design.id}-${policy}.json.gz`)),
  );
  const finalHash = hash(state);
  if (
    state.status !== 'full_time' ||
    finalHash !== observed.finalHash ||
    ticks !== observed.ticks ||
    passes.size !== observed.passes.unique ||
    pr172SourceHash() !== sourceHash
  )
    throw Error(`Canonical replay/identity mismatch ${input.design.id}/${policy}`);
  assertMatchStatisticsInvariants(state.statistics, state);
  const records = [...passes.values()].map((r) => recordSchema.parse(r)),
    targeted = records.filter((r) => r.targetBehind);
  const count = (rows, predicate) => rows.filter(predicate).length;
  const summary = {
    attempts: records.length,
    targetedBehind: targeted.length,
    completedBeyondReleaseLine: count(
      targeted,
      (r) => r.outcome === 'completed' && r.contactBeyondReleaseLine === true,
    ),
    completedBeforeOrAtReleaseLine: count(
      targeted,
      (r) => r.outcome === 'completed' && r.contactBeyondReleaseLine === false,
    ),
    completedWithoutContactEvidence: count(
      targeted,
      (r) => r.outcome === 'completed' && r.contactBeyondReleaseLine === undefined,
    ),
    failed: count(targeted, (r) => !['completed', 'unresolved'].includes(r.outcome)),
    unresolved: count(targeted, (r) => r.outcome === 'unresolved'),
    completedBeyondCurrentDefence: count(
      targeted,
      (r) => r.outcome === 'completed' && r.contactBeyondCurrentDefence === true,
    ),
    snapshotFallbacks: count(records, (r) => !r.snapshotMatched),
    outcomes: Object.fromEntries(
      [...new Set(targeted.map((r) => r.outcome))].map((k) => [
        k,
        count(targeted, (r) => r.outcome === k),
      ]),
    ),
    carryEpisodes: carryEpisodes.length,
    carriesPastMarkerWithControl: carryEpisodes.filter((e) => e.passedMarkerWithControl).length,
    carriesLostToOpponent: carryEpisodes.filter((e) => e.result === 'opponent_control').length,
    carryEpisodeOutcomes: Object.fromEntries(
      [...new Set(carryEpisodes.map((e) => e.result))].map((k) => [
        k,
        carryEpisodes.filter((e) => e.result === k).length,
      ]),
    ),
  };
  if (
    summary.completedBeyondReleaseLine +
      summary.completedBeforeOrAtReleaseLine +
      summary.completedWithoutContactEvidence +
      summary.failed +
      summary.unresolved !==
    summary.targetedBehind
  )
    throw Error('Depth outcomes do not reconcile');
  writeFileSync(
    resultPath,
    gzipSync(
      JSON.stringify({
        schema: 'mfl-pr181-depth-lineage-v1',
        sourceHash,
        harnessHash,
        policy,
        design: input.design,
        inputHash: input.inputHash,
        status: state.status,
        ticks,
        finalHash,
        observerReplayEqual: true,
        summary,
        records,
        carryEpisodes: episodes,
        method:
          'Exact frozen original match replay with external diagnostic reads only. Physical pass target and actual contact are separate. Behind means >0.5m goalward of the legal defender/ball/halfway line captured at release; current-defence comparison excludes the ball. Fallback line uses the preceding 0.025s frame and is counted explicitly. Identical full canonical state, tick and official pass identities required against the original observed cohort.',
      }),
    ),
  );
  console.log(JSON.stringify({ id: input.design.id, policy, equal: true, ...summary }));
}
