import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import console from 'node:console';
import process from 'node:process';
import { RandomGenerator } from '../src/core/random/RandomGenerator.ts';
import { pr172SourceHash } from './pr172Evidence.ts';
import { stringifyPr178Receipt } from './pr178ReceiptJson.mjs';

const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const mean = (xs) => (xs.length ? sum(xs) / xs.length : null);
const quantile = (xs, p) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b),
    i = (s.length - 1) * p;
  return s[Math.floor(i)] + (s[Math.ceil(i)] - s[Math.floor(i)]) * (i % 1);
};
const distribution = (xs) => ({
  n: xs.length,
  mean: mean(xs),
  median: quantile(xs, 0.5),
  p10: quantile(xs, 0.1),
  p90: quantile(xs, 0.9),
  min: xs.length ? Math.min(...xs) : null,
  max: xs.length ? Math.max(...xs) : null,
});
const tally = (xs) =>
  Object.fromEntries([...new Set(xs)].map((key) => [key, xs.filter((x) => x === key).length]));
const emit = (name, value) =>
  writeFileSync(`docs/performance/PR178-${name}.json`, stringifyPr178Receipt(value));
const policies = ['legacy-pr176', 'risk-ablation-v1', 'state-value-v1'];
const rows = [],
  details = [];
for (const split of ['development', 'validation'])
  for (const policy of policies) {
    const root = `../pr178-${split}-${policy}`;
    if (!existsSync(root)) continue;
    for (const name of readdirSync(root).filter(
      (n) => n.endsWith('.json') && !n.includes('failure'),
    )) {
      const r = read(`${root}/${name}`);
      if (r.status !== 'full_time') throw new Error(`Incomplete fixture ${name}`);
      const raw = JSON.parse(
        gunzipSync(readFileSync(`${root}/${name.replace('.json', '-raw.json.gz')}`)),
      );
      const o = raw.observations,
        passes = o.passes,
        episodes = o.episodes,
        choices = o.choices,
        shots = o.shots;
      const teams = Object.values(r.official),
        players = r.statistics.players;
      const totals = (key) => sum(teams.map((t) => t[key] ?? 0));
      const credible = choices.filter((c) =>
        ['credible', 'high_value'].includes(c.opportunity.category),
      );
      const selected = choices.filter(
        (c) =>
          c.selected?.type === 'shot' ||
          (c.selected?.type === 'header' && c.selected.intent === 'header_shot'),
      );
      const exposed = raw.transitions.filter((t) => t.exposure.active);
      const pressured = passes.filter(
        (p) =>
          p.result === 'completed' &&
          (p.controlledProgress ?? 0) > 3 &&
          choices.find((c) => c.id === p.choiceId)?.opportunity.pressure >= 0.45,
      );
      const shotChoices = new Map(selected.map((c) => [c.id, c]));
      const metrics = {
        passes: totals('passesAttempted'),
        completed: totals('passesCompleted'),
        completion: totals('passesCompleted') / Math.max(1, totals('passesAttempted')),
        passingMetres: sum(passes.map((p) => p.metres)),
        forwardPasses: passes.filter((p) => p.intendedProgress > 3).length,
        backwardPasses: passes.filter((p) => p.intendedProgress < -3).length,
        sidewaysPasses: passes.filter((p) => Math.abs(p.intendedProgress) <= 3).length,
        reciprocal: passes.filter((p) => p.reciprocal).length,
        controlledForwardPasses: passes.filter(
          (p) => p.result === 'completed' && (p.controlledProgress ?? 0) > 3,
        ).length,
        controlledForwardMetres: sum(
          passes
            .filter((p) => p.result === 'completed')
            .map((p) => Math.max(0, p.controlledProgress ?? 0)),
        ),
        progressUnderPressure: pressured.length,
        possessionEpisodes: episodes.length,
        meanPossessionSeconds: mean(episodes.map((p) => p.end - p.start)),
        longestPossessionSeconds: Math.max(0, ...episodes.map((p) => p.end - p.start)),
        episodesOver60Seconds: episodes.filter((p) => p.end - p.start > 60).length,
        episodesOver120Seconds: episodes.filter((p) => p.end - p.start > 120).length,
        holdChoices: choices.filter((c) => c.selected?.type === 'hold').length,
        progressionEpisodes: episodes.filter((p) => p.stages.includes('physical_progression'))
          .length,
        finalThirdEntries: episodes.filter((p) => p.stages.includes('final_third_control')).length,
        boxEntries: episodes.filter((p) => p.stages.includes('penalty_area_control')).length,
        credibleEpisodes: episodes.filter((p) => p.stages.includes('credible_opportunity')).length,
        credibleChoices: credible.length,
        credibleOwnerChoices: credible.filter((c) => c.controlled && !c.incoming).length,
        credibleIncomingChoices: credible.filter((c) => c.incoming).length,
        credibleReleaseContexts: shots.filter((s) =>
          ['credible', 'high_value'].includes(s.opportunity.category),
        ).length,
        openPlayShots: shots.filter((s) => s.diagnostic.context === 'open_play').length,
        penaltyShots: shots.filter((s) => s.diagnostic.context === 'penalty').length,
        headerShots: shots.filter((s) => s.diagnostic.contact === 'header').length,
        choicesWithShots: choices.filter((c) => c.shotCandidates > 0).length,
        executableShotChoices: choices.filter((c) => c.executableShots > 0).length,
        selectedShots: selected.length,
        shots: totals('shots'),
        goals: totals('goals'),
        onTarget: totals('shotsOnTarget'),
        blocks: totals('blockedShots'),
        saves: sum(players.map((p) => p.saves)),
        corners: totals('corners'),
        throwIns: totals('throwIns'),
        freeKicks: totals('freeKicks'),
        fouls: totals('fouls'),
        offsides: totals('offsides'),
        losses: totals('possessionLost'),
        liveSeconds: o.counts.liveSeconds ?? 0,
        stoppedSeconds: o.counts.stoppedSeconds ?? 0,
        exposedRecoveries: exposed.length,
        transitionAttempts: exposed.filter((t) => t.firstForwardAction).length,
        transitionsGaining10m: exposed.filter((t) => t.maxControlledProgress >= 10).length,
        transitionsFailing5m: exposed.filter(
          (t) => t.firstForwardAction && t.maxControlledProgress < 5,
        ).length,
        defenceRecovered: exposed.filter(
          (t) => t.exposure.cover < 5 && t.defensiveRecoveryAt !== null,
        ).length,
        contacts: r.statistics.observedContactIds.length,
      };
      metrics.forwardShare = metrics.forwardPasses / Math.max(1, passes.length);
      metrics.backwardShare = metrics.backwardPasses / Math.max(1, passes.length);
      metrics.sidewaysShare = metrics.sidewaysPasses / Math.max(1, passes.length);
      metrics.goalKicks = o.restarts.filter((restart) => restart.scenario === 'goal_kick').length;
      metrics.penalties = o.restarts.filter((restart) => restart.scenario === 'penalty').length;
      metrics.injuries = totals('injuries');
      metrics.aerialContacts = raw.aerials ? raw.aerials.length : null;
      const zonedLosses = (raw.losses ?? []).filter((loss) => loss.attackingDepth !== undefined);
      metrics.lossesDefensiveThird = zonedLosses.length
        ? zonedLosses.filter((loss) => loss.attackingDepth < 35).length
        : null;
      metrics.lossesMiddleThird = zonedLosses.length
        ? zonedLosses.filter((loss) => loss.attackingDepth >= 35 && loss.attackingDepth < 70).length
        : null;
      metrics.lossesAttackingThird = zonedLosses.length
        ? zonedLosses.filter((loss) => loss.attackingDepth >= 70).length
        : null;
      const row = {
        split,
        policy,
        design: r.design,
        inputHash: r.inputHash,
        source: r.manifest,
        status: r.status,
        score: r.score,
        elapsed: r.time,
        finalHash: r.finalHash,
        metrics,
        cpuMs: r.cpuMs,
        wallMs: r.wallMs,
        peakRss: r.peakRss,
        peakHeap: r.peakHeap,
      };
      rows.push(row);
      const cadence = [];
      for (const team of ['home', 'away']) {
        const releases = passes
          .filter((p) => p.team === team)
          .map((p) => p.releasedAt)
          .sort((a, b) => a - b);
        for (let i = 1; i < releases.length; i++) cadence.push(releases[i] - releases[i - 1]);
      }
      const shotFailures = credible.map((c) => ({
        id: c.id,
        episodeId: c.episodeId,
        at: c.at,
        actorId: c.actorId,
        opportunity: c.opportunity,
        reason:
          c.executableShots === 0
            ? c.shotCandidates === 0
              ? 'no generated physically executable shot'
              : 'candidate not currently executable'
            : shotChoices.has(c.id)
              ? 'selected shot'
              : 'another action ranked higher',
        selected: c.selected,
        shotRank: c.shotRank,
        shotScore: c.shotScore,
        selectedScore: c.selectedScore,
      }));
      const linkedReleases = shots.filter((s) => s.choiceId && shotChoices.has(s.choiceId));
      const roleRows = (raw.roles ?? []).map((role) => {
        const player = players.find((p) => p.playerId === role.id),
          ps = passes.filter((p) => p.actorId === role.id),
          received = passes.filter(
            (p) => p.result === 'completed' && (p.actualReceiverId ?? p.receiverId) === role.id,
          );
        const cs = choices.filter((c) => c.actorId === role.id);
        return {
          ...role,
          statistics: player,
          progressivePasses: ps.filter((p) => p.intendedProgress > 3).length,
          receivingRecords: received.length,
          shotOpportunityChoices: cs.filter((c) =>
            ['credible', 'high_value'].includes(c.opportunity.category),
          ).length,
          selectedCarries: cs.filter((c) => c.selected?.type === 'carry').length,
          interpretation:
            'Role time is measured from the actual runtime slot. Whole-player statistics are not apportioned between roles when a player has multiple roles.',
        };
      });
      details.push({
        split,
        policy,
        id: r.design.id,
        teams: teams.map((t, index) => ({ side: index ? 'away' : 'home', ...t })),
        passing: {
          cadence: distribution(cadence),
          receptionDelay: distribution(
            passes.flatMap((p) =>
              p.nextReleaseAfterReception === null ? [] : [p.nextReleaseAfterReception],
            ),
          ),
          outcomes: tally(passes.map((p) => p.result)),
          contacts: tally(passes.map((p) => p.contact)),
          spatial: passes
            .filter(
              (p) => p.executionType === 'ground_through' || p.executionType === 'lofted_through',
            )
            .map((p) => ({
              id: p.id,
              result: p.result,
              metres: p.metres,
              controlledProgress: p.controlledProgress,
              receiverMovement: p.receiverMovement,
            })),
          episodes: distribution(episodes.map((p) => p.end - p.start)),
          longPossessions: episodes
            .filter((p) => p.end - p.start > 60)
            .map((episode) => ({
              ...episode,
              selections: tally(
                choices
                  .filter((c) => c.episodeId === episode.id)
                  .map((c) => c.selected?.type ?? 'none'),
              ),
            })),
          progress: distribution(episodes.map((p) => p.maxDepth - p.startDepth)),
        },
        funnel: {
          credibleChoices: credible.length,
          credibleOwnerChoices: credible.filter((c) => c.controlled && !c.incoming).length,
          credibleIncomingChoices: credible.filter((c) => c.incoming).length,
          credibleReleaseContexts: shots.filter((s) =>
            ['credible', 'high_value'].includes(s.opportunity.category),
          ).length,
          releaseContexts: tally(shots.map((s) => s.diagnostic.context)),
          releaseContacts: tally(shots.map((s) => s.diagnostic.contact)),
          selected: selected.length,
          releases: shots.length,
          linkedReleases: linkedReleases.length,
          unlinkedReleaseIds: shots
            .filter((s) => !linkedReleases.includes(s))
            .map((s) => s.diagnostic.shotId),
          selectedWithoutLinkedRelease: selected
            .filter((c) => !shots.some((s) => s.choiceId === c.id))
            .map((c) => c.id),
          failures: shotFailures,
        },
        shooting: {
          distance: distribution(shots.map((s) => s.diagnostic.distance)),
          outcomes: tally(shots.map((s) => s.diagnostic.outcome ?? 'unresolved')),
          goals: o.goals,
          shots,
        },
        transitions: raw.transitions.map(({ opponents, firstForwardAction, ...transition }) => {
          delete transition.ballRecovery;
          const action = firstForwardAction?.action;
          return {
            ...transition,
            firstForwardAction: action
              ? {
                  at: firstForwardAction.at,
                  type: action.type,
                  actorId: action.actorId,
                  target: action.target,
                  receiverId: action.receiverId,
                  intent: action.intent,
                  executionType: action.deliveryPlan?.executionType,
                }
              : null,
            rawOpponentCount: opponents?.length ?? 0,
            rawEvidence: `${split}/${policy}/${r.design.id}:transitions`,
          };
        }),
        defence: {
          exposedRecoveries: exposed.length,
          initiallyUnderFiveCover: exposed.filter((t) => t.exposure.cover < 5).length,
          recoveredFiveCover: exposed.filter(
            (t) => t.exposure.cover < 5 && t.defensiveRecoveryAt !== null,
          ).length,
          recoveryDelay: distribution(
            exposed.flatMap((t) =>
              t.exposure.cover < 5 && t.defensiveRecoveryAt !== null
                ? [t.defensiveRecoveryAt - t.at]
                : [],
            ),
          ),
          failedFiveMetreTransitions: exposed
            .filter((t) => t.firstForwardAction && t.maxControlledProgress < 5)
            .map((t) => ({
              at: t.at,
              outcome: t.outcome,
              maxControlledProgress: t.maxControlledProgress,
            })),
        },
        losses: {
          count: (raw.losses ?? []).length,
          causes: tally((raw.losses ?? []).map((loss) => loss.cause ?? 'unknown')),
          attackingDepth: distribution(
            (raw.losses ?? [])
              .map((loss) => loss.attackingDepth)
              .filter((depth) => depth !== undefined),
          ),
          samples: (raw.losses ?? []).slice(0, 8),
          rawEvidence: `${split}/${policy}/${r.design.id}:losses`,
        },
        restarts: o.restarts,
        roles: roleRows,
        combinations: o.combinations,
      });
    }
  }
if (process.argv.includes('--partial')) {
  console.log(
    JSON.stringify(
      rows.map((r) => ({ split: r.split, policy: r.policy, id: r.design.id, metrics: r.metrics })),
    ),
  );
  process.exit(0);
}
for (const policy of policies)
  if (rows.filter((r) => r.policy === policy && r.split === 'validation').length !== 12)
    throw new Error(`Missing 12 final validation matches ${policy}`);
const distributions = [];
for (const split of ['development', 'validation'])
  for (const policy of policies) {
    const subset = rows.filter((r) => r.split === split && r.policy === policy);
    distributions.push({
      split,
      policy,
      independentDesigns: subset.length,
      metrics: Object.fromEntries(
        Object.keys(subset[0].metrics).map((k) => [
          k,
          distribution(subset.map((r) => r.metrics[k]).filter((n) => n !== null)),
        ]),
      ),
    });
  }
const paired = [];
for (const split of ['development', 'validation'])
  for (const policy of policies.slice(1)) {
    const baseline = rows.filter((r) => r.split === split && r.policy === policies[0]);
    const differences = baseline.map((a) => {
      const b = rows.find(
        (r) => r.split === split && r.policy === policy && r.design.id === a.design.id,
      );
      if (a.inputHash !== b.inputHash) throw new Error('Unpaired fixture');
      return {
        id: a.design.id,
        metrics: Object.fromEntries(
          Object.keys(a.metrics).map((k) => [
            k,
            b.metrics[k] === null || a.metrics[k] === null ? null : b.metrics[k] - a.metrics[k],
          ]),
        ),
      };
    });
    const intervals = Object.fromEntries(
      Object.keys(differences[0].metrics).map((key) => {
        const xs = differences.map((r) => r.metrics[key]).filter((value) => value !== null),
          rng = RandomGenerator.fromSeed(`pr178-bootstrap:${split}:${policy}:${key}`),
          sampleMeans = [];
        if (!xs.length) return [key, { n: 0, available: false }];
        if (xs.length < 2)
          return [
            key,
            {
              ...distribution(xs),
              pairedMeanBootstrap95: null,
              inference: 'One diagnostic design; no interval',
            },
          ];
        for (let n = 0; n < 4000; n++)
          sampleMeans.push(mean(xs.map(() => xs[rng.int(0, xs.length - 1)])));
        return [
          key,
          {
            ...distribution(xs),
            pairedMeanBootstrap95: [quantile(sampleMeans, 0.025), quantile(sampleMeans, 0.975)],
          },
        ];
      }),
    );
    paired.push({ split, policy, versus: policies[0], differences, intervals });
  }
const method =
  'One independent fixture is the resampling unit. Team rows, frames, decisions, episodes and reflected orientations are not independent samples. Fixed heterogeneous strata are descriptive, not league estimates. 4000 deterministic paired fixture bootstrap draws give exploratory uncertainty; small n and fixed designs limit generalisation. First outcomes and final outcomes may differ for one canonical shot ID. A generated/executable option and a model credible category are separate; neither is calibrated real-world xG.';
emit('policy-comparison', {
  sourceHash: pr172SourceHash(),
  method,
  rows,
  distributions,
  paired,
  teamMatchRows: details.flatMap((d) =>
    d.teams.map((t) => ({ split: d.split, policy: d.policy, id: d.id, ...t })),
  ),
  teamMatchDistributions: ['development', 'validation'].flatMap((split) =>
    policies.map((policy) => {
      const teamRows = details
        .filter((d) => d.split === split && d.policy === policy)
        .flatMap((d) => d.teams);
      return {
        split,
        policy,
        independentMatches: teamRows.length / 2,
        dependentTeamRows: teamRows.length,
        metrics: Object.fromEntries(
          [
            'passesAttempted',
            'passesCompleted',
            'shots',
            'goals',
            'shotsOnTarget',
            'possessionPercentage',
            'fouls',
            'corners',
            'throwIns',
            'possessionLost',
          ].map((key) => [key, distribution(teamRows.map((t) => t[key]))]),
        ),
      };
    }),
  ),
});
for (const [name, key] of [
  ['possession-to-shot-funnel', 'funnel'],
  ['shooting-outcomes', 'shooting'],
  ['passing-and-reception', 'passing'],
  ['counterattacks', 'transitions'],
  ['defensive-recovery', 'defence'],
  ['stoppages', 'restarts'],
  ['positional-involvement', 'roles'],
  ['combinations', 'combinations'],
  ['turnovers', 'losses'],
])
  emit(name, {
    method,
    rows: details.map((d) => {
      if (key !== 'transitions')
        return { split: d.split, policy: d.policy, id: d.id, [key]: d[key] };
      const exposed = d.transitions.filter((t) => t.exposure.active);
      const examples = [
        exposed.find((t) => t.maxControlledProgress >= 10),
        exposed.find((t) => t.firstForwardAction && t.maxControlledProgress < 5),
        exposed.find((t) => t.defensiveRecoveryAt !== null),
      ].filter(Boolean);
      return {
        split: d.split,
        policy: d.policy,
        id: d.id,
        transitions: {
          allRecoveries: d.transitions.length,
          exposedRecoveries: exposed.length,
          forwardAttempts: exposed.filter((t) => t.firstForwardAction).length,
          gainingTenMetres: exposed.filter((t) => t.maxControlledProgress >= 10).length,
          failingFiveMetres: exposed.filter(
            (t) => t.firstForwardAction && t.maxControlledProgress < 5,
          ).length,
          progress: distribution(exposed.map((t) => t.maxControlledProgress)),
          firstForwardDelay: distribution(
            exposed.flatMap((t) => (t.firstForwardAction ? [t.firstForwardAction.at - t.at] : [])),
          ),
          recoveryDepth: distribution(exposed.map((t) => t.depth)),
          outcomes: tally(exposed.map((t) => t.outcome)),
          examples,
          rawEvidence: `${d.split}/${d.policy}/${d.id}:transitions`,
          interpretation:
            'Complete physical opponent positions, actions and every transition remain once in the indexed compressed match evidence. Examples are selected illustrations, not independent validation samples.',
        },
      };
    }),
  });
console.log(
  JSON.stringify({
    matches: rows.length,
    validation: rows.filter((r) => r.split === 'validation').length,
    sourceHash: pr172SourceHash(),
  }),
);
