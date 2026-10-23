import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import console from 'node:console';

// Keep inspectable small receipts beside losslessly archived detailed observations.
// Re-running this after a reporter refresh replaces archives with that fresh output.
const compact = (name, project) => {
  const path = `docs/performance/${name}.json`;
  const archive = `pr183-evidence/${name}-details.json.gz`;
  let full = readFileSync(path);
  const parsed = JSON.parse(full);
  if (parsed.detailArchive) {
    if (!existsSync(`docs/performance/${archive}`)) throw Error('Missing detail archive');
    full = gunzipSync(readFileSync(`docs/performance/${archive}`));
  }
  const data = JSON.parse(full);
  writeFileSync(`docs/performance/${archive}`, gzipSync(full));
  writeFileSync(
    path,
    JSON.stringify(
      {
        ...project(data),
        detailArchive: archive,
        uncompressedDetailSha256: createHash('sha256').update(full).digest('hex'),
        uncompressedDetailBytes: full.length,
      },
      null,
      2,
    ) + '\n',
  );
};
const policyRow = ({ defensive, substitutions, flow, ...row }) => {
  void defensive;
  void flow;
  return { ...row, substitutionCount: substitutions.length };
};
compact('PR183-policy-comparison', (data) => ({
  ...data,
  rows: data.rows.map(policyRow),
  beforeAfter: data.beforeAfter.map((pair) => ({
    ...pair,
    before: policyRow(pair.before),
    after: policyRow(pair.after),
  })),
}));
compact('PR183-coach-substitution-reasons', (data) => ({
  ...data,
  rows: data.rows.map(({ substitutions, ...row }) => ({
    ...row,
    count: substitutions.length,
    firstByTeam: ['home', 'away'].map((team) => substitutions.find((s) => s.team === team) ?? null),
  })),
}));
compact('PR183-passing-and-width', (data) => ({
  ...data,
  rows: data.rows.map(({ windows, spatial, ...row }) => ({
    ...row,
    fiveMinuteWindows: windows.length,
    totals: windows.reduce((totals, window) => {
      for (const [key, value] of Object.entries(window))
        if (key !== 'index') totals[key] = (totals[key] ?? 0) + value;
      return totals;
    }, {}),
    spatial: {
      samples: spatial.samples,
      sampled: spatial.sampled,
      crossTypes: spatial.crossTypes,
      aerialOutcomes: spatial.aerialOutcomes,
      secondBallTeams: spatial.secondBallTeams,
      sprintDistance: spatial.sprintDistance,
    },
  })),
}));
compact('PR183-r3-retreat-reproductions', (data) => ({
  ...data,
  rows: data.rows.map(({ teammateDisplacement, ...row }) => ({
    ...row,
    teammateDisplacementCount: teammateDisplacement.length,
  })),
}));
compact('PR183-carry-recovery', (data) => ({
  ...data,
  rows: data.rows.map(({ trajectory, ...row }) => ({
    ...row,
    trajectorySamples: trajectory.length,
  })),
}));
console.log('Five compact receipts and lossless detail archives written.');
