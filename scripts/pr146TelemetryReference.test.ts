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

describe('PR160 complete telemetry reference (PR146 observer contract)', () => {
  // PR160 changes actual workload, reserve-dependent movement/contact and physically demanding
  // execution. Both pristine PR159 references and new complete 2,400-tick outputs were
  // reproduced twice per seed in fresh Node processes: PR160-telemetry-reference.json.
  // Preserve all 80 exported fields, full sorted hashes, schemas and identity-ledger assertions.
  // PR158 changes finite contact, exposed-ball challenges and tactical selection.
  // Reproduced the pristine PR157 and new complete 2,400-tick outputs twice per seed.
  // All exported fields and ledgers remain checked: PR158-telemetry-reference.json.
  // PR157 changes physical pressing/carrier choices, shooting uncertainty and goal-ray geometry.
  // Both complete 2,400-tick outputs were reproduced twice against the frozen final source;
  // both pristine PR156 references were independently reproduced twice first. Full telemetry,
  // all-field comparisons, schemas and identity invariants: PR157-telemetry-reference.json.
  // PR156 changes physical passing uncertainty, expected-outcome selection and live
  // receiver adjustment. Both complete 2,400-tick outputs were independently repeated.
  // Previous PR155 references remain in docs/performance/PR155-validation.json.
  // PR155 changes support geometry, incoming passing and canonical contested ownership.
  // The previous PR154 complete hashes are retained in docs/performance/PR155-validation.json.
  // Keep the complete all-field identity/invariant assertion and reproduce both seeds twice.
  // PR154 changes actual football selection/contact geometry and adds pass-selection facts.
  // Retain every exported field, identity ledger and invariant in these regenerated hashes.
  // Expanded PR152 intentionally separates football loss causes from restart awards.
  // These full-output hashes retain every exported field, including identity ledgers;
  // both seeds are reproduced in focused validation and the complete verify suite.
  // Previous PR151 hashes: 0b4a6d4b2dd6eb0327dd1e6089423449eaa73b85deaf99cb14470fa685d048b6 (a),
  // ac8983f8eaed1ddeb2a69b535bbc95b6f5ba57850551d368f8adbb47e1737021 (b).
  // PR151 intentionally changes attribute-based movement, reactive team positioning and
  // presentation cadence. Reproduced both complete hashes twice after 2,400 identical ticks;
  // the pristine PR150 checkout independently reproduced both previous reference hashes.
  // Repeated both seeds twice after response localization (unchanged), then again after
  // cooperative contact/goalward-cover changes, then their contextual slow-scan guard.
  // Both revisions intentionally changed the hashes and reproduced each seed twice.
  // Prior localization hashes: d49916e35b2f6fe774fc4877649eb559f1b8f15dd257279129c159fd5a105b6e (a),
  // 654d8bbcd8c8768745e3653fae6e792cbd7a1f1436e8338a830193cb5ca99bfe (b).
  // Keep the complete sorted all-field assertion and schema/invariant checks; see PR151 report.
  // Previous PR150: 3ced1597287169d8941900f27ad4ac6ef274ea40398fca84a8d1535668ec5dba (a),
  // 1a5102f3ebc44473c3378dd71a9f512a00e0dda24744138a198690a5df08cfb8 (b).
  // PR150 intentionally changes momentum-preserving reception, attribute/context pass execution,
  // launch-time offside, resolved out-of-play failures and realized-edge accounting.
  // Full-output hashes were reproduced twice
  // and independently compared with pristine PR149 using identical seeds and 2,400 ticks.
  // Previous PR149: 206edf94d099b58f896a2237a68922174f02d087102549f31870d44bbefb0b9c (a),
  // a0f1910e310ffc75edae7ef888e77dac2accb7ba8c4e66547e3222111a4ba54a (b).
  // Keep the complete sorted all-field assertion and schema/invariant checks; see PR150 report.
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
    ['pr146-flow-reference:a', 'ced0737b03698f104bd1134a570f07497749ec1da53a32757875f90b41673468'],
    ['pr146-flow-reference:b', 'b245012ab69a7176d043866f0bb0002dd3724e6c440d88044905efe1a03335b6'],
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
    expect(telemetry.turnoverCauses).not.toHaveProperty('restart');
    expect(Object.values(telemetry.turnoverCauses).reduce((sum, count) => sum + count, 0)).toBe(
      telemetry.observedPossessionLossIds.length,
    );
    expect(telemetry.restartAwards).toBe(telemetry.observedRestartAwardIds.length);
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
