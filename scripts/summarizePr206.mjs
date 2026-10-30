import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { hash } from './pr199Evidence.mjs';
const root = 'docs/performance/pr206',
  read = (n) => JSON.parse(gunzipSync(readFileSync(`${root}/${n}.json.gz`)));
const q = read('qualification-final'),
  f = read('factorial-final'),
  rows = f.result.rows;
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const count = (rs, field) => rs.filter((r) => r.outcome[field]).length;
const tally = (rs) => ({
  n: rs.length,
  touch: count(rs, 'directReceiverTouch'),
  control: rs.filter((r) => r.outcome.directReceiverTouch && r.outcome.receiverControl).length,
  retention: rs.filter((r) => r.outcome.directReceiverTouch && r.outcome.teamPossessionAtOneSecond)
    .length,
  censored: count(rs, 'censored'),
  firstTime: rs.filter((r) => r.events.some((e) => e.releaseContact?.actorId === r.prelude.ids.c))
    .length,
});
const metrics = ['directReceiverTouch', 'control', 'retention'];
const value = (r, m) =>
  Number(
    m === 'control'
      ? r.outcome.directReceiverTouch && r.outcome.receiverControl
      : m === 'retention'
        ? r.outcome.directReceiverTouch && r.outcome.teamPossessionAtOneSecond
        : r.outcome[m],
  );
const groups = ['LL', 'LH', 'HL', 'HH'];
const byGroup = (rs) =>
  Object.fromEntries(groups.map((g) => [g, tally(rs.filter((r) => r.group === g))]));
const contrasts = {
  readingLowTouch: ['HL', 'LL'],
  readingHighTouch: ['HH', 'LH'],
  touchLowReading: ['LH', 'LL'],
  touchHighReading: ['HH', 'HL'],
};
const differences = Object.fromEntries(
  Object.entries(contrasts).map(([name, [a, b]]) => [
    name,
    Object.fromEntries(
      metrics.map((m) => {
        const ar = rows.filter((r) => r.primary && r.group === a),
          diffs = ar.map((r) => {
            const peer = rows.find(
              (p) =>
                p.primary &&
                p.group === b &&
                p.family === r.family &&
                p.sample === r.sample &&
                p.window === r.window,
            );
            assert.ok(peer);
            return { seed: r.sample, value: value(r, m) - value(peer, m) };
          });
        return [
          m,
          {
            pairedN: diffs.length,
            mean: mean(diffs.map((d) => d.value)),
            wins: diffs.filter((d) => d.value > 0).length,
            losses: diffs.filter((d) => d.value < 0).length,
            seedMeans: [0, 1].map((seed) => ({
              seed,
              mean: mean(diffs.filter((d) => d.seed === seed).map((d) => d.value)),
            })),
            uncertainty:
              'Two seed clusters and constructed geometries; seed means are sensitivity descriptions, not confidence intervals.',
          },
        ];
      }),
    ),
  ]),
);
const recognition = Object.fromEntries(
  groups.map((group) => {
    const rs = rows.filter((r) => r.group === group);
    return [
      group,
      {
        n: rs.length,
        qualified: rs.filter((r) => r.prelude.qualifies).length,
        commandLatency: mean(
          rs
            .filter((r) => r.prelude.clocks.command !== null)
            .map((r) => r.prelude.clocks.command - 10),
        ),
        bodyAtBRelease: rs.map((r) => ({
          family: r.family,
          sample: r.sample,
          window: r.window,
          ...r.injectedBody,
        })),
      },
    ];
  }),
);
const mediators = Object.fromEntries(
  groups.map((group) => {
    const rs = rows.filter((r) => r.primary && r.group === group && r.exactContact),
      ms = rs.map((r) => {
        const e = r.exactContact,
          p = e.body,
          v = e.ball.velocity ?? { x: 0, y: 0, z: 0 };
        const relativeSpeed = Math.hypot(v.x - p.velocity.x, v.y - p.velocity.y, v.z ?? 0),
          angle = Math.atan2(-(v.x - p.velocity.x), -(v.y - p.velocity.y)) - p.facing;
        return {
          family: r.family,
          sample: r.sample,
          window: r.window,
          contactAt: e.at,
          speed: Math.hypot(p.velocity.x, p.velocity.y),
          relativeSpeed,
          facingError: Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))),
          observedPlanAge: e.plan ? e.at - e.plan.createdAt : null,
          storedPreparation: r.firstContact?.ground?.surfaceContact?.preparationSeconds ?? null,
          surface: r.firstContact?.ground?.surfaceContact?.executed ?? null,
        };
      });
    return [
      group,
      {
        n: ms.length,
        meanSpeed: mean(ms.map((m) => m.speed)),
        meanRelativeSpeed: mean(ms.map((m) => m.relativeSpeed)),
        meanFacingError: mean(ms.map((m) => m.facingError)),
        meanObservedPlanAge: mean(
          ms.filter((m) => m.observedPlanAge !== null).map((m) => m.observedPlanAge),
        ),
        rows: ms,
      },
    ];
  }),
);
const matched = Object.fromEntries(
  [false, true].map((neutral) => [
    neutral ? 'readinessReading55' : 'nativeReadiness',
    Object.fromEntries(
      groups.map((group) => {
        const arms = f.result.execution.map((e) =>
          e.arms.find((a) => a.group === group && a.neutralReadiness === neutral),
        );
        return [
          group,
          {
            n: arms.length,
            finiteContacts: arms.filter((a) => a.ground?.executed).length,
            controlled: arms.filter((a) => a.owner !== null).length,
            meanQuality: mean(arms.map((a) => a.ground?.quality ?? 0)),
            meanRelativeSpeed: mean(arms.map((a) => a.reception?.contact?.relativeSpeed ?? 0)),
          },
        ];
      }),
    ),
  ]),
);
const summary = {
  source: f.result.source,
  qualificationSource: q.result.source,
  qualification: q.result.rows.map((r) => ({
    config: r.config,
    qualifies: r.qualifies,
    clocks: r.clocks,
    outcomes: r.outcomes.map((o) => ({ receiverId: o.contract.receiverId, ...o.outcome })),
  })),
  primary: byGroup(rows.filter((r) => r.primary)),
  exploratoryOrExcluded: byGroup(rows.filter((r) => !r.primary)),
  families: Object.fromEntries(
    [...new Set(rows.map((r) => r.family))].map((family) => [
      family,
      {
        primary: byGroup(rows.filter((r) => r.primary && r.family === family)),
        all: byGroup(rows.filter((r) => r.family === family)),
        releaseDistances: rows
          .filter((r) => r.family === family && r.group === 'HH')
          .map((r) => r.releaseDistance),
      },
    ]),
  ),
  windows: Object.fromEntries(
    ['adequate', 'inadequate'].map((window) => [
      window,
      byGroup(rows.filter((r) => r.primary && r.window === window)),
    ]),
  ),
  recognition,
  mediators,
  differences,
  matched,
  rejected: f.result.rejected.map((r) => ({
    family: r.family,
    sample: r.sample,
    window: r.window,
    reason: r.reason,
  })),
  costs: {
    qualification: q.costs,
    factorial: f.costs,
    maxSaveBytes: Math.max(...rows.map((r) => r.saveBytes)),
  },
  limitations: [
    'No production runtime, physics, default or profile changes.',
    'Only two seed clusters; repeated families/windows are dependent.',
    'Aerial outcomes are exploratory and excluded from primary inference.',
    'Planned window labels do not prove adequate actual contact preparation.',
    'Physical execution checkpoints are selected from actual contacts and do not represent misses.',
    'First-time events and subsequent actions are recorded, not guaranteed successful useful continuation.',
  ],
};
const path = `${root}/summary.json`;
if (process.argv.includes('--check'))
  assert.equal(hash(JSON.parse(readFileSync(path, 'utf8'))), hash(summary));
else writeFileSync(path, JSON.stringify(summary, null, 2) + '\n');
console.log(
  JSON.stringify({
    path,
    primary: summary.primary,
    matched,
    costs: summary.costs,
    rejected: summary.rejected,
  }),
);
