import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { gunzipSync, gzipSync } from 'node:zlib';

const folder = '.benchmark-artifacts/pr226';
const output = process.argv.includes('--record') ? 'docs/performance' : folder;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = (path) => JSON.parse(readFileSync(path));
const unpack = (path) => JSON.parse(gunzipSync(readFileSync(path)));
const matches = ['paired', 'native-a', 'independent'];
const arms = ['D', 'E', 'F'];
const tolerance = 1e-9;
const max = (values) => Math.max(0, ...values);
const key = ({ actorId, detail }) => {
  const { leg } = detail.account.surfaces[0];
  return `${actorId}:${leg.foot}:${leg.region}`;
};

const selectEncounters = (episodes, work) => {
  const rows = episodes.map((episode, index) => {
    const events = work.filter(
      ({ at }) => at >= episode.beganAt - tolerance && at <= episode.endedAt + tolerance,
    );
    const responses = events.map(key);
    const repeats = responses.filter(
      (value, i) => i >= 2 && responses[i - 2] === value && responses[i - 1] !== value,
    ).length;
    const joint = events.some(({ detail }) => detail.solver.startsWith('opposing_'));
    const energetic = max(events.map(({ detail }) => Math.abs(detail.account.residual)));
    return {
      episode: index + 1,
      ...episode,
      incomingBoundary: index === 0 ? 'uncertified' : 'canonical_clearance',
      outgoingBoundary: index === episodes.length - 1 ? 'uncertified' : 'canonical_clearance',
      actualLimbResponses: events.length,
      limbABA: repeats,
      joint,
      largestAbsoluteWorkResidual: energetic,
      prepared: events.some(({ detail }) => detail.entry.pendingStrike),
      recovering: events.some(({ detail }) => detail.entry.recovery),
      ballOnGround: events.some(({ detail }) => detail.entry.ground),
      // Only paired committed constraints certify simultaneous opposing compression.
      classification: joint
        ? 'opposing_constraint_observed'
        : repeats
          ? 'serial_limb_responses_clearance_between_events_uncertified'
          : events.length
            ? 'measured_incidental_response'
            : 'insufficient_limb_evidence',
      events,
    };
  });
  const byVolume = (a, b) => b.solverEvents - a.solverEvents || a.beganAt - b.beganAt;
  const filtered = (predicate, limit = 3) => rows.filter(predicate).sort(byVolume).slice(0, limit);
  const selected = [
    ...filtered((e) => e.solverRepetitionCandidate),
    ...filtered((e) => e.joint, 4),
    ...filtered((e) => e.adjacentSurfaces && e.incidental && e.intended && e.actualLimbResponses),
    ...filtered((e) => e.prepared, 2),
    ...filtered((e) => e.recovering && e.ballOnGround, 2),
    ...rows
      .toSorted((a, b) => b.largestAbsoluteWorkResidual - a.largestAbsoluteWorkResidual)
      .filter((e) => e.actualLimbResponses)
      .slice(0, 2),
  ];
  return [...new Map(selected.map((e) => [e.episode, e])).values()].sort(
    (a, b) => a.episode - b.episode,
  );
};

const archived = matches.flatMap((fixture) =>
  ['D', 'E'].map((arm) => {
    const receipt = json(`docs/performance/pr225-full-${fixture}-${arm}.json`);
    const source = receipt.contacts.episodeArchive;
    assert.equal(hash(readFileSync(source.path)), source.sha256);
    const episodes = unpack(source.path);
    assert.equal(episodes.length, receipt.contacts.observedEpisodes);
    assert.equal(
      episodes.reduce((sum, row) => sum + row.solverEvents, 0),
      receipt.contacts.solverEvents,
    );
    assert.equal(
      episodes.filter((row) => row.solverRepetitionCandidate).length,
      receipt.contacts.solverRepetitionCandidates,
    );
    return { fixture, arm, source, receipt, episodes };
  }),
);
function summarize(fixture, arm, suffix = '', untraced = false) {
  const tag = `${fixture}-${arm}${!suffix && arm === 'F' ? '-final' : ''}${suffix}`;
  const path = `${folder}/${tag}-result.json`;
  if (!existsSync(path)) return { fixture, arm, suffix, status: 'not_run' };
  const result = json(path);
  const work = unpack(`${folder}/${tag}-work.json.gz`).filter((e) =>
    e.source.endsWith('composedLimbWork'),
  );
  const { episodes, ...contacts } = result.contacts;
  if (!suffix && arm !== 'F' && !result.safetyHalt) {
    const historical = archived.find((a) => a.fixture === fixture && a.arm === arm);
    assert.equal(result.terminalHash, historical.receipt.terminalHash, 'historical terminal');
    assert.deepEqual(episodes, historical.episodes, 'historical episode rows');
  }
  return {
    ...result,
    contacts: untraced ? undefined : contacts,
    expectedTerminalHash: arm === 'F' || suffix ? undefined : result.expectedTerminalHash,
    workEvents: untraced ? undefined : work.length,
    work: untraced
      ? undefined
      : {
          positiveEnergy: work.filter(({ detail }) => detail.account.delta > tolerance).length,
          positiveSurfaceWork: work.filter(({ detail }) => detail.account.surfaceWork > tolerance)
            .length,
          residualAboveNanojoule: work.filter(
            ({ detail }) => Math.abs(detail.account.residual) > tolerance,
          ).length,
          maxEnergyGain: max(work.map(({ detail }) => detail.account.delta)),
          maxAbsoluteResidual: max(work.map(({ detail }) => Math.abs(detail.account.residual))),
          legRegions: Object.fromEntries(
            ['shin', 'knee', 'thigh'].map((region) => [
              region,
              work.filter(({ detail }) => detail.account.surfaces[0].leg.region === region).length,
            ]),
          ),
        },
    final: untraced ? { at: result.final.at, ticks: result.final.ticks } : result.final,
    encounters: !suffix && arm !== 'D' ? selectEncounters(episodes, work) : [],
  };
}

const results = matches.flatMap((fixture) => arms.map((arm) => summarize(fixture, arm)));
const bounded = [
  ...matches.map((fixture) => summarize(fixture, 'F', '-120s')),
  summarize('paired', 'E', '-120s'),
  summarize('paired', 'F', '-120s-untraced', true),
];
const [traced, untraced] = [bounded[0], bounded.at(-1)];
if (traced.terminalHash && untraced.terminalHash)
  assert.equal(
    traced.terminalHash,
    untraced.terminalHash,
    'observer must not change the candidate',
  );
const { archives, summary } = {
  archives: results.flatMap((result) =>
    result.encounters?.length
      ? [{ fixture: result.fixture, arm: result.arm, encounters: result.encounters }]
      : [],
  ),
  summary: {
    archived: archived.map(({ fixture, arm, source, receipt }) => {
      const { episodeArchive: _archive, ...contacts } = receipt.contacts;
      void _archive;
      return { fixture, arm, source, terminalHash: receipt.terminalHash, contacts };
    }),
    full: results.map(({ encounters, ...receipt }) => ({
      ...receipt,
      selectedEpisodes: encounters?.map(({ events, ...row }) => ({
        ...row,
        traced: events.length,
      })),
    })),
    bounded: bounded.map(({ encounters: _encounters, ...row }) => row),
  },
};
const trace = gzipSync(JSON.stringify(archives));
writeFileSync(output + '/pr226-contact-encounters.json.gz', trace);
writeFileSync(
  output + '/pr226-match-comparison.json',
  JSON.stringify({ ...summary, encounterArchiveSha256: hash(trace) }, null, 2) + '\n',
);
process.stdout.write(
  JSON.stringify(
    results.map(({ fixture, arm, final, status, safetyHalt, work }) => ({
      fixture,
      arm,
      time: final?.at,
      status: final?.status ?? status,
      halt: safetyHalt?.reason,
      work,
    })),
  ) + '\n',
);
