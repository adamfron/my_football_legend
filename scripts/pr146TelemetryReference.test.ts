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

describe('PR146 complete telemetry equivalence', () => {
  // Captured from the frozen, verified PR145 implementation before any PR146 optimization.
  it.each([
    ['pr146-flow-reference:a', '015e6495f4560e3f5cc5b9f579679dc79db7c5948443ab1d1637ad776ff2e9e1'],
    ['pr146-flow-reference:b', '8dc0c4e14544e549659965b3a941a46918fd90cea026d789f8b4afe3518eb88c'],
  ])('preserves every exported PR145 telemetry field for %s', (seed, expectedHash) => {
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
