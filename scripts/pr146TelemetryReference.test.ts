import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from './createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../src/core/singleMatch';
import {
  createTacticalMatch,
  FIXED_MATCH_DT,
  stepTacticalMatch,
} from '../src/core/matchSimulation/matchSimulation';
import {
  assertTelemetryInvariants,
  createMatchFlowTelemetry,
  matchFlowTelemetrySchema,
  observeMatchFlow,
} from '../src/core/matchSimulation/matchFlowTelemetry';

describe('PR149 complete telemetry reference (PR146 observer contract)', () => {
  // PR149 intentionally changes physical preparation/reception trajectories and records
  // completed passes against the actual receiver, including retained queued-action resolutions.
  // Freeze the entire output with the same seeds/2,400 ticks and unchanged all-field hash assertion.
  // Both new hashes were reproduced in two independent runs. The previous PR148 hashes were
  // 454cd1932bf4c3c06f40de67b67dc564f11732f13432263c31b41f22c8e07753 (a) and
  // 7e8216d5b559b36b2abed73de5704a5025515f68e311271c4f8c1fa0aa66f90b (b).
  // PR148 changed touches, cadence, defensive episodes, cards, locomotion and ball episodes.
  // The previous PR147 hashes were
  // 2766af2ddef26ddbe30072b38f7904ef8104e8a01562c392314ef5137db34d0d (a) and
  // b2f91e381b5d77e4a5dff30da7d684c56e4026b73e7360f0190a4c2335d13c0e (b). The historical
  // PR145→146 equivalence evidence remains in docs/performance/PR146-results.json; its old hashes
  // were 015e6495f4560e3f5cc5b9f579679dc79db7c5948443ab1d1637ad776ff2e9e1 (a) and
  // 8dc0c4e14544e549659965b3a941a46918fd90cea026d789f8b4afe3518eb88c (b).
  it.each([
    ['pr146-flow-reference:a', '206edf94d099b58f896a2237a68922174f02d087102549f31870d44bbefb0b9c'],
    ['pr146-flow-reference:b', 'a0f1910e310ffc75edae7ef888e77dac2accb7ba8c4e66547e3222111a4ba54a'],
  ])('preserves every exported canonical telemetry field for %s', (seed, expectedHash) => {
    const world = createCanonicalWorldDatabase();
    let state = createTacticalMatch(
      createSingleMatchSession(world, {
        homeClubId: world.clubs[0]!.id,
        awayClubId: world.clubs[1]!.id,
        seed,
        control: { mode: 'spectator' },
      }),
    );
    let telemetry = createMatchFlowTelemetry(seed);
    for (let tick = 0; tick < 2_400; tick++) {
      const previous = state;
      state = stepTacticalMatch(state, FIXED_MATCH_DT);
      telemetry = observeMatchFlow(telemetry, previous, state);
    }
    assertTelemetryInvariants(telemetry);
    matchFlowTelemetrySchema.parse(telemetry);
    const stableJson = JSON.stringify(telemetry, (_key, value: unknown) =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, (value as Record<string, unknown>)[key]]),
          )
        : value,
    );
    expect(createHash('sha256').update(stableJson).digest('hex')).toBe(expectedHash);
  });
});
