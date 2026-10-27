import console from 'node:console';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { read, args, finish, sourceIdentity } from './pr198Evidence.mjs';
import { continueRelease } from './pr198Laboratory.mjs';
const options = args(),
  identity = sourceIdentity(),
  start = performance.now(),
  cpu = process.cpuUsage(),
  rows = [];
const factors = [
  'unchanged',
  'awareness_early',
  'awareness_late',
  'facing_away',
  'sprinting_toward',
  'lateral_velocity',
  'retreating',
  'accelerating',
  'unbalanced',
  'first_touch_20',
  'first_touch_100',
  'agility_20',
  'cognition_20',
  'pressure_near',
];
const frozen = read('docs/performance/pr198/releases-v1.json.gz').result.rows.filter(
  (r) =>
    ['short_ground', 'long_lofted', 'moving_lead', 'cross_field'].includes(r.family) &&
    [20, 80].includes(r.skill) &&
    r.sample < 2,
);
for (const entry of frozen)
  for (const factor of factors)
    for (const synchronized of [false, true]) {
      const intervention = (s) => {
        const receiver = s.players.find((p) => p.id === entry.contract.receiverId),
          prep = s.receptionPreparation;
        if (factor === 'awareness_early' && prep) prep.awarenessAt = s.time;
        if (factor === 'awareness_late' && prep) prep.awarenessAt = s.time + 0.8;
        if (factor === 'facing_away') receiver.facingAngle += Math.PI;
        const sign = entry.sample ? 1 : -1;
        if (factor === 'sprinting_toward') receiver.velocity = { x: -6, y: 0 };
        if (factor === 'lateral_velocity') receiver.velocity = { x: 0, y: sign * 6 };
        if (factor === 'retreating') receiver.velocity = { x: 6, y: 0 };
        if (factor === 'accelerating') receiver.velocity = { x: -2, y: 0 };
        if (factor === 'unbalanced')
          receiver.plantBalance = {
            balance: 0.3,
            load: 0.7,
            support: receiver.profile.dominantFoot,
          };
        if (factor === 'first_touch_20') receiver.profile.attributes.firstTouch = 20;
        if (factor === 'first_touch_100') receiver.profile.attributes.firstTouch = 100;
        if (factor === 'agility_20') receiver.profile.attributes.agility = 20;
        if (factor === 'cognition_20') {
          receiver.profile.attributes.gameReading = 20;
          receiver.profile.attributes.concentration = 20;
        }
        if (factor === 'pressure_near') {
          const opponent = s.players
            .filter((p) => p.team !== receiver.team && p.slot.position !== 'goalkeeper')
            .sort(
              (a, b) =>
                Math.hypot(a.position.x - receiver.position.x, a.position.y - receiver.position.y) -
                Math.hypot(b.position.x - receiver.position.x, b.position.y - receiver.position.y),
            )[0];
          opponent.position = { x: receiver.position.x + 1.2, y: receiver.position.y };
          opponent.target = { ...opponent.position };
        }
      };
      const result = continueRelease(
        entry,
        {
          experimentalDefensiveReception: true,
          experimentalHeightAwarePassing: true,
          experimentalReceiverAnticipation: true,
          experimentalReceiverSynchronisation: synchronized,
          experimentalCanonicalArrival: false,
        },
        intervention,
      );
      const { frames, final, ...compact } = result;
      void final;
      rows.push({
        family: entry.family,
        skill: entry.skill,
        sample: entry.sample,
        factor,
        synchronized,
        ballHash: entry.ballHash,
        releaseHash: entry.releaseHash,
        ...compact,
        frames:
          entry.skill === 80 &&
          entry.sample === 0 &&
          ['awareness_late', 'sprinting_toward', 'unbalanced'].includes(factor)
            ? frames
            : undefined,
      });
      if (rows.length % 56 === 0) console.log('sensitivity', rows.length);
    }
const paired = rows
  .filter((r) => r.synchronized)
  .map((after) => {
    const before = rows.find(
      (r) =>
        !r.synchronized &&
        r.family === after.family &&
        r.skill === after.skill &&
        r.sample === after.sample &&
        r.factor === after.factor,
    );
    return {
      family: after.family,
      skill: after.skill,
      sample: after.sample,
      factor: after.factor,
      destroyedTouch:
        before.outcome.directReceiverTouch === true && after.outcome.directReceiverTouch === false,
      gainedTouch:
        before.outcome.directReceiverTouch === false && after.outcome.directReceiverTouch === true,
      controlBefore: before.outcome.receiverControl,
      controlAfter: after.outcome.receiverControl,
    };
  });
finish(
  `docs/performance/pr198/sensitivity-${options.get('version') ?? 'v1'}.json.gz`,
  {
    schema: 'pr198-receiver-sensitivity-v1',
    source: identity,
    method:
      '16 frozen actually released balls × 14 prescribed initial receiver/pressure conditions × two controllers. Every branch asserts unchanged actual ball. Incoming speed/height are stratified by delivery, not relabelled as independent same-ball interventions. Independent second-contact scheduling is unavailable; actual finite recovery and later contest remain canonical.',
    rows,
    paired,
  },
  {
    milliseconds: performance.now() - start,
    cpu: process.cpuUsage(cpu),
    maxRSSKiB: process.resourceUsage().maxRSS,
  },
);
console.log(
  'sensitivity completed',
  rows.length,
  'destroyed',
  paired.filter((r) => r.destroyedTouch).length,
  'gained',
  paired.filter((r) => r.gainedTouch).length,
);
