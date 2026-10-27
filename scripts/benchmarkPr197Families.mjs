import process from 'node:process';
import console from 'node:console';
import { createCalibrationFixture } from '../src/core/matchSimulation/assumptionCalibration.ts';
import { evaluatePassDecision } from '../src/core/matchSimulation/passDecision.ts';
import { resolveMatchAction } from '../src/core/matchSimulation/matchActions.ts';
import { scoreCalibration } from '../src/core/matchSimulation/calibrationMetrics.ts';
import { runCanonicalOutcomeTrial } from '../src/core/matchSimulation/canonicalOutcome.ts';
import { argumentsMap, finish, sourceIdentity, hash } from './pr197Evidence.mjs';
import { performance } from 'node:perf_hooks';
const args = argumentsMap(),
  version = args.get('version') ?? 'v1',
  identity = sourceIdentity();
const families = [
  'short_ground',
  'medium_ground',
  'progressive_ground',
  'through_ball',
  'long_ground',
  'long_lofted',
  'moving_lead',
  'cross_field',
  'first_time',
  'remote_contact',
  'high_contact',
];
const rows = [],
  costs = [];
for (const family of families)
  for (const skill of [20, 40, 60, 80, 100])
    for (const sample of [0, 1, 2, 3]) {
      const mirror = sample % 2 === 1,
        seed = `pr197-${sample < 2 ? 'development' : 'evaluation'}-${Math.floor(sample / 2)}`;
      const f = createCalibrationFixture({
        scenario: family.includes('long')
          ? 'long_pass'
          : family === 'through_ball'
            ? 'through_ball'
            : 'safe_pass',
        attacker: skill,
        defender: 60,
        mirror,
        seed,
      });
      const actor = f.state.players.find((p) => p.id === f.actorId),
        r = f.state.players.find((p) => p.id === f.receiverId);
      const span =
        family === 'short_ground'
          ? 7
          : family === 'medium_ground'
            ? 19
            : family === 'progressive_ground'
              ? 25
              : family === 'moving_lead'
                ? 25
                : family === 'cross_field'
                  ? 40
                  : null;
      if (span !== null) {
        r.position = {
          x: actor.position.x + span,
          y: family === 'cross_field' ? (mirror ? 58 : 10) : actor.position.y,
        };
        r.target = { ...r.position };
        r.anchor = { ...r.position };
        r.neutralAnchor = { ...r.position };
        f.action.target = { ...r.position };
      }
      f.action.delivery =
        family === 'long_lofted' || family === 'cross_field' ? 'lofted' : 'ground';
      f.action.intent =
        family === 'moving_lead'
          ? 'lead'
          : family === 'progressive_ground'
            ? 'progressive'
            : f.action.intent;
      if (family === 'moving_lead') r.velocity = { x: 4, y: mirror ? 2 : -2 };
      if (['first_time', 'remote_contact', 'high_contact'].includes(family)) {
        delete f.state.ball.ownerId;
        f.state.ball.velocity = { x: 4, y: mirror ? -1 : 1, z: 0 };
        f.state.ball.travelKind = 'pass';
        f.state.ball.lastTouchPlayerId = r.id;
        f.action.firstTime = true;
        if (family === 'remote_contact') f.state.ball.x = actor.position.x + 4;
        if (family === 'high_contact') f.state.ball.height = 3.5;
      }
      const models = args.get('models')?.split(',') ?? [
        'baseline',
        'defence',
        'height',
        'receiver',
        'combined',
      ];
      for (const model of models) {
        const s = globalThis.structuredClone(f.state);
        if (['defence', 'combined'].includes(model)) s.experimentalDefensiveReception = true;
        if (['height', 'combined'].includes(model)) s.experimentalHeightAwarePassing = true;
        if (['receiver', 'combined'].includes(model)) s.experimentalReceiverAnticipation = true;
        const start = performance.now(),
          requestedForecast = evaluatePassDecision(
            s,
            s.players.find((p) => p.id === actor.id),
            s.players.find((p) => p.id === r.id),
            f.action.target,
            f.action.intent,
            f.action.delivery,
            undefined,
            !!f.action.firstTime,
          );
        const result = runCanonicalOutcomeTrial(s, f.action, 8, undefined, 'original-delivery-v3'),
          released = resolveMatchAction(globalThis.structuredClone(s), f.action);
        // This is the executor's estimate of the ideal selected launch BEFORE technical error.
        // A moving-run request can be projected to a different intended meeting point.
        const q =
          released.lastPassDiagnostic?.passId !== s.lastPassDiagnostic?.passId
            ? released.lastPassDiagnostic.selectionQuality
            : requestedForecast;
        const conditionalControl = Math.max(
          0,
          Math.min(1, ((q.expectedReceptionQuality ?? 0) - 0.25) / 0.5),
        );
        const o = result.outcome;
        rows.push({
          family,
          skill,
          sample,
          split: sample < 2 ? 'development' : 'held_out_development',
          model,
          inputHash: hash(s),
          action: f.action,
          launchHash: hash(released.ball),
          forecast: q,
          requestedForecast,
          contracts: {
            directTouch: q.expectedCompletion,
            directControl: q.expectedCompletion * conditionalControl,
            directRetained: q.expectedRetainedPossession,
            qualification:
              'Existing unfitted heuristic probability claims; control uses the existing quality map. No parameter is fitted, deflected routes are separate.',
          },
          outcome: o,
          directControl:
            o.directReceiverTouch === null || o.receiverControl === null
              ? null
              : o.directReceiverTouch && o.receiverControl,
          directRetained:
            o.directReceiverTouch === null || o.teamPossessionAtOneSecond === null
              ? null
              : o.directReceiverTouch && o.teamPossessionAtOneSecond,
          contact: result.final.lastReceptionOutcome ?? null,
          finalHash: hash(result.final),
          samplesHash: hash(result.samples),
        });
        costs.push({ family, model, milliseconds: performance.now() - start });
      }
      if (rows.length % 100 === 0) console.log('families', rows.length, family);
    }
const score = (xs, event, forecast) =>
  scoreCalibration(
    xs
      .filter((r) => r[event] !== null && r.outcome.released)
      .map((r) => ({ probability: r.contracts[forecast], outcome: r[event] })),
  );
const summaries = Object.fromEntries(
  [...new Set(rows.map((r) => r.model))].map((model) => {
    const xs = rows
      .filter((r) => r.model === model)
      .map((r) => ({ ...r, touch: r.outcome.directReceiverTouch }));
    return [
      model,
      {
        requested: xs.length,
        released: xs.filter((r) => r.outcome.released).length,
        censored: xs.filter((r) => r.outcome.censored).length,
        touch: score(xs, 'touch', 'directTouch'),
        control: score(xs, 'directControl', 'directControl'),
        retained: score(xs, 'directRetained', 'directRetained'),
        heldOut: {
          touch: score(
            xs.filter((r) => r.split === 'held_out_development'),
            'touch',
            'directTouch',
          ),
          control: score(
            xs.filter((r) => r.split === 'held_out_development'),
            'directControl',
            'directControl',
          ),
          retained: score(
            xs.filter((r) => r.split === 'held_out_development'),
            'directRetained',
            'directRetained',
          ),
        },
      },
    ];
  }),
);
finish(
  `docs/performance/pr197/families-${version}.json.gz`,
  {
    schema: 'pr197-families-v1',
    source: identity,
    uncertainty:
      'Mirrors and shared seeds are dependent. Wilson intervals from scoreCalibration are descriptive, not independent confirmation.',
    rows,
    summaries,
  },
  { rows: costs, cpu: process.cpuUsage(), memory: process.memoryUsage() },
  args.has('check'),
);
console.log(JSON.stringify(summaries));
