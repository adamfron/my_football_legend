import console from 'node:console';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { read, identity, finish, options, hash } from './pr199Evidence.mjs';
import { runPhysicalReception } from './pr199PhysicalLab.mjs';
import { familyFixture } from './pr198Fixtures.mjs';
import { cueFor, truthFlight } from './pr199FlightLab.mjs';
const source = identity(),
  start = performance.now(),
  cpu = process.cpuUsage();
const mode = options.get('mode') ?? 'visibility',
  rows = [],
  references = [];
const entries = read('docs/performance/pr198/releases-v1.json.gz').result.rows.filter(
  (e) =>
    ['short_ground', 'long_lofted', 'moving_lead', 'cross_field'].includes(e.family) &&
    e.skill === 60 &&
    e.sample < 2,
);
for (const e of entries) {
  const cue = cueFor(familyFixture(e.family, e.skill, e.sample).state, e.contract.actorId);
  const flight = truthFlight(e.state.ball),
    apex = flight.rows.reduce((a, b) => (a.ball.position.z > b.ball.position.z ? a : b)).at;
  const tapes = {};
  if (mode === 'attributes' && ['v2', 'v3'].includes(options.get('version')))
    for (const controller of ['S', 'M']) {
      const reference = runPhysicalReception(e, {
        controller,
        condition: 'FULL',
        cues: false,
        apex,
      });
      const until = reference.firstInteractionAt ?? e.state.time + 8;
      tapes[controller] = {
        sensorTape: reference.acquisitions.filter((a) => a.sighting.at < until - 1e-8),
        sensorTapeUntil: until,
      };
      references.push({
        family: e.family,
        sample: e.sample,
        controller,
        sensoryTape: tapes[controller],
        ...reference,
      });
    }
  const configs =
    mode === 'visibility'
      ? ['R', 'S', 'M'].flatMap((controller) => [
          ...[
            'FULL',
            'EARLY',
            'APEX',
            'LATE',
            'INTERMITTENT',
            'INITIAL_OCCLUSION',
            'CUE_ONLY',
            'NONE',
          ].map((condition) => ({
            controller,
            condition,
            cues: condition === 'CUE_ONLY',
            cue,
            apex,
          })),
          { controller, condition: 'EARLY', cues: true, cue, apex },
        ])
      : ['S', 'M'].flatMap((controller) => [
          ...['gameReading', 'concentration', 'agility', 'firstTouch', 'composure'].flatMap(
            (attribute) =>
              [20, 40, 60, 80, 100].map((level) => ({
                controller,
                condition: 'FULL',
                cues: false,
                attribute,
                level,
                apex,
              })),
          ),
          ...[1.2, 3, 8].map((pressureDistance) => ({
            controller,
            condition: 'FULL',
            cues: false,
            pressureDistance,
            apex,
          })),
        ]);
  for (const config of configs) {
    const tape = ['agility', 'firstTouch', 'composure'].includes(config.attribute)
      ? tapes[config.controller]
      : undefined;
    const result = runPhysicalReception(e, tape ? { ...config, ...tape } : config);
    rows.push({
      family: e.family,
      sample: e.sample,
      seed: e.seed,
      config,
      sensorTapeHash: tape ? hash(tape.sensorTape) : null,
      ...result,
    });
    if (rows.length % 24 === 0) console.log('PR199 receivers', mode, rows.length);
  }
}
// A hostile consumer receives copies, never canonical mutable state.
const control = entries[0],
  neutralConfig = { controller: 'M', condition: 'FULL', cues: false };
const quiet = runPhysicalReception(control, neutralConfig),
  hostile = runPhysicalReception(control, { ...neutralConfig, hostileObserver: true });
if (quiet.finalHash !== hostile.finalHash || quiet.samplesHash !== hostile.samplesHash)
  throw Error('Observer changed football');
const summary = Object.fromEntries(
  ['R', 'S', 'M'].map((controller) => {
    const list = rows.filter((r) => r.config.controller === controller);
    return [
      controller,
      {
        eligible: list.length,
        noUsefulEstimate: list.filter((r) => r.firstUseful === null).length,
        touch: list.filter((r) => r.outcome.directReceiverTouch).length,
        control: list.filter((r) => r.outcome.directReceiverTouch && r.outcome.receiverControl)
          .length,
        retained: list.filter(
          (r) => r.outcome.directReceiverTouch && r.outcome.teamPossessionAtOneSecond,
        ).length,
        censored: list.filter((r) => r.outcome.censored).length,
      },
    ];
  }),
);
finish(
  `receivers-${mode}-${options.get('version') ?? 'v1'}.json.gz`,
  {
    schema: 'pr199-physical-reception-v1',
    source,
    mode,
    method:
      'Actual frozen releases and canonical 40Hz match/contact/control/continuation. Laboratory-only R, S and M observation adapters. M extrapolation preserves true sighting age and uncertainty, retains a bounded old commitment, and shares the existing own-body projection. No live match import or success grant.',
    rows,
    references,
    sensoryControl:
      'V2 attributes: agility, firstTouch and composure receive the same actual reference acquisition tape until the first canonical interaction (or the reference interaction time). Natural sensing resumes after collision divergence; cognitive sweeps keep natural acquisition variable. All 16 reference continuations and outcomes remain included separately.',
    summary,
    observerNeutrality: {
      finalHash: quiet.finalHash,
      samplesHash: quiet.samplesHash,
      hostileEqual: true,
    },
  },
  {
    milliseconds: performance.now() - start,
    cpu: process.cpuUsage(cpu),
    maxRSSKiB: process.resourceUsage().maxRSS,
  },
);
console.log(summary);
