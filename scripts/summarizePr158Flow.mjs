import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import process from 'node:process';
import console from 'node:console';

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...value] = arg.replace(/^--/, '').split('=');
    return [key, value.join('=')];
  }),
);
const prefix = args.get('prefix') ?? '../pr158-flow';
const read = (revision) => {
  const parts = ['a', 'b', 'c'].map((group) =>
    JSON.parse(readFileSync(`${prefix}-${revision}-${group}.json`, 'utf8')),
  );
  const first = parts[0];
  for (const part of parts) {
    assert.equal(part.canonicalSourceHash, first.canonicalSourceHash);
    assert.equal(part.observerSourceHash, first.observerSourceHash);
    assert.deepEqual(part.config, first.config);
  }
  const rows = parts.flatMap((part) => part.results);
  assert.equal(rows.length, 18, `${revision}: require six fixtures by three seeds`);
  assert.equal(new Set(rows.map((row) => `${row.fixture}:${row.seed}`)).size, 18);
  for (const row of rows) {
    assert.ok(row.time >= 5400 && row.time < 5400.1);
    assert.ok(['full_time', 'second_half'].includes(row.status));
    assert.equal(row.players.length, 22);
    assert.equal(row.contactsAndTactics.workload.length, 22);
  }
  return { ...first, results: rows };
};
const before = read('before'),
  after = read('after');
const keys = (data) => data.results.map((row) => `${row.fixture}:${row.seed}`).sort();
assert.deepEqual(keys(before), keys(after));
assert.equal(before.observerSourceHash, after.observerSourceHash);
const sum = (values) => values.reduce((total, value) => total + value, 0);
const mergeCounts = (records) => {
  const result = {};
  for (const record of records)
    for (const [key, value] of Object.entries(record)) {
      if (typeof value === 'number') result[key] = (result[key] ?? 0) + value;
      else if (Array.isArray(value) && value.every((item) => typeof item === 'number'))
        result[key] = value.map((item, index) => (result[key]?.[index] ?? 0) + item);
    }
  return result;
};
const totals = (rows) => {
  const observations = rows.map((row) => row.contactsAndTactics);
  const observation = mergeCounts(observations);
  const clocks = mergeCounts(observations.flatMap((item) => Object.values(item.clocks)));
  const workload = mergeCounts(observations.flatMap((item) => item.workload));
  const attempts = sum(rows.map((row) => row.defence?.attempted ?? 0));
  const shooting = {
    attempts: sum(rows.map((row) => row.shooting.attempts)),
    onTarget: sum(rows.map((row) => row.shooting.onTarget)),
    blocked: sum(rows.map((row) => row.shooting.blocked)),
    saves: sum(rows.map((row) => row.shooting.saves)),
    goals: sum(rows.map((row) => row.shooting.goals)),
    firstTime: sum(rows.map((row) => row.shooting.firstTime)),
    distanceBins: mergeCounts(rows.map((row) => row.shooting.distanceBins)),
    families: mergeCounts(rows.map((row) => row.shooting.families)),
  };
  return {
    matches: rows.length,
    canonicalMinutes: sum(rows.map((row) => row.time / 60)),
    ticks: sum(rows.map((row) => row.ticks)),
    attempts,
    cleanWins: sum(rows.map((row) => row.defence?.cleanWins ?? 0)),
    looseChallengeResults: sum(rows.map((row) => row.defence?.looseBalls ?? 0)),
    reachableOverAttempted: observation.reachableAttempts / attempts,
    reachableOverResolved: observation.reachableAttempts / observation.resolvedChallenges,
    observation,
    clocks,
    workload,
    shooting,
    passing: mergeCounts(rows.map((row) => row.passing)),
    possession: mergeCounts(rows.map((row) => row.possession)),
    lossCauses: mergeCounts(rows.map((row) => row.possession.turnoverCauses)),
    attackingFlow: mergeCounts(rows.map((row) => row.attackingFlow ?? {})),
    threatFlow: mergeCounts(rows.map((row) => row.attackingFlow?.threatFlow ?? {})),
    releasedShotExpectations: {
      samples: sum(rows.map((row) => row.attackingFlow?.releasedShotExpectations.samples ?? 0)),
      sum: sum(rows.map((row) => row.attackingFlow?.releasedShotExpectations.sum ?? 0)),
    },
    pressureCarrier: mergeCounts(rows.map((row) => row.carrier.underPressure)),
    pressureCarrierLossCauses: mergeCounts(
      rows.map((row) => row.carrier.underPressure.lossesByCause),
    ),
    carrier: mergeCounts(rows.map((row) => row.carrier)),
    pressing: mergeCounts(rows.map((row) => row.pressing)),
    pressureOutcomes: mergeCounts(rows.map((row) => row.pressing.outcomes)),
    physicalContacts: rows.every((row) => row.physicalContactControl !== null)
      ? mergeCounts(rows.map((row) => row.physicalContactControl))
      : null,
    fouls: sum(rows.map((row) => row.fouls)),
    yellowCards: sum(rows.map((row) => row.yellowCards)),
    redCards: sum(rows.map((row) => row.redCards)),
    roles: [...new Set(rows.flatMap((row) => row.players.map((player) => player.role)))]
      .sort()
      .map((role) => ({
        role,
        appearances: sum(
          rows.map((row) => row.players.filter((player) => player.role === role).length),
        ),
        ...mergeCounts(rows.flatMap((row) => row.players.filter((player) => player.role === role))),
        maxSpeed: Math.max(
          ...rows.flatMap((row) =>
            row.players.filter((player) => player.role === role).map((player) => player.maxSpeed),
          ),
        ),
      })),
  };
};
const table = (records, columns = Object.keys(records[0] ?? {})) => ({
  columns,
  values: records.map((record) => columns.map((column) => record[column])),
});
const compactRow = (row) => {
  const playerIndex = new Map(row.players.map((player, index) => [player.playerId, index]));
  return {
    fixture: row.fixture,
    seed: row.seed,
    time: row.time,
    status: row.status,
    ticks: row.ticks,
    score: row.score,
    formations: row.formations,
    styles: row.styles,
    canonicalHash: row.canonicalHash,
    possession: row.possession,
    passing: row.passing,
    carrier: row.carrier,
    attackingFlow: row.attackingFlow ?? null,
    defence: Object.fromEntries(
      Object.entries(row.defence).filter(([key]) => !['byPlayer', 'byTechnique'].includes(key)),
    ),
    fouls: row.fouls,
    yellowCards: row.yellowCards,
    redCards: row.redCards,
    shooting: row.shooting,
    contactsAndTactics: {
      ...row.contactsAndTactics,
      workload: table(row.contactsAndTactics.workload),
      rotationTraces: table(row.contactsAndTactics.rotationTraces),
    },
    physicalContactControl: row.physicalContactControl,
    pressing: {
      ...row.pressing,
      retainedEpisodes: row.pressing.retainedEpisodes
        .slice(0, 3)
        .map(({ samples: _samples, ...episode }) => {
          void _samples;
          return episode;
        }),
    },
    players: table(
      row.players.map(({ locomotion: _locomotion, possessionLossCauses: _loss, ...player }) => {
        void _locomotion;
        void _loss;
        return player;
      }),
    ),
    passingNetwork: table(
      row.passingNetwork.map((edge) => {
        const passerIndex = playerIndex.get(edge.passerId),
          receiverIndex = playerIndex.get(edge.receiverId);
        assert.notEqual(passerIndex, undefined);
        assert.notEqual(receiverIndex, undefined);
        return { passerIndex, receiverIndex, attempted: edge.attempted, completed: edge.completed };
      }),
      ['passerIndex', 'receiverIndex', 'attempted', 'completed'],
    ),
  };
};
const fixtures = [...new Set(before.results.map((row) => row.fixture))];
const report = {
  experiment: 'PR158 paired spectator full-match contact and tactical flow',
  baseCommit: before.base,
  fixedStepSeconds: 0.025,
  methodology:
    'Six fixture families x three identical seeds x 90 canonical minutes in each frozen revision; agency disabled; both halves explicitly started. Identical current bounded read-only observers. Fixture attribute overrides replace profiles, preserving the shared world. Simulation ran concurrently, so elapsed wall times are excluded from performance evidence.',
  definitions: {
    lowProgress180:
      'Accumulated body rotation >180 degrees with net owned displacement <2 metres in one continuous carrier episode.',
    lowProgress360:
      'Accumulated body rotation >360 degrees with net owned displacement <3 metres in one continuous carrier episode.',
    carrierEpisodes:
      'All uninterrupted ownership episodes including ordinary preparation and shielding; not only deliberate named dribbles.',
    reachableAttempts:
      'Resolved challenge with previous or current challenge metadata ballReachable; separate denominators for initiated intents and resolved challenges. Baseline metadata does not reconstruct torso access.',
    pressureRelease:
      'PR157 pressure episode ending; not necessarily a successful forward escape. New progressiveEscapes is a distinct signed-displacement measure.',
    clocks:
      'Bins <=1,1-3,3-5,5-8,8-10,>10 seconds. Loss->pressure, loss->regain, pressure->regain, regain->progression/released-shot/goal are distinct; interruptions censor pending transitions.',
    workload:
      'Open-play observations only; distances in metres. Accelerations/decelerations are speed-bin crossings, bodyContacts formal resolved challenges, exposedTransitionSamples legacy short transition geometry; no fatigue depletion.',
    horizon:
      'Stop at the identical 5400-second canonical horizon (possible 25 ms crossing). Native period-end completion can still be pending; each row retains its actual status. This is not added-time or a fabricated full-time whistle.',
    columnTables:
      'Each compact table declares columns and aligned values; passing-network indices refer to that match players.values row order. All22 player participation, workload records and realized pass edges are retained.',
  },
  provenance: {
    before: {
      canonicalSourceHash: before.canonicalSourceHash,
      observerSourceHash: before.observerSourceHash,
    },
    after: {
      canonicalSourceHash: after.canonicalSourceHash,
      observerSourceHash: after.observerSourceHash,
    },
    seeds: before.config.seeds,
  },
  totals: { before: totals(before.results), after: totals(after.results) },
  byFixture: fixtures.map((fixture) => ({
    fixture,
    before: totals(before.results.filter((row) => row.fixture === fixture)),
    after: totals(after.results.filter((row) => row.fixture === fixture)),
  })),
  rows: { before: before.results.map(compactRow), after: after.results.map(compactRow) },
};
const output = resolve(args.get('output') ?? 'docs/performance/PR158-flow-summary.json');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(report) + '\n');
console.log(
  JSON.stringify({
    output,
    before: report.totals.before.attempts,
    after: report.totals.after.attempts,
    matches: 36,
  }),
);
