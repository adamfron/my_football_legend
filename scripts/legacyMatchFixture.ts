import { createTacticalMatch } from '../src/core/matchSimulation/matchSimulation';

/** Historical regression geometries and utility scales keep their declared policy.
 * New-match defaults and five-policy physical authority are exercised separately. */
export const createLegacyMatchFixture: typeof createTacticalMatch = (session) =>
  createTacticalMatch({
    ...session,
    setup: { ...session.setup, decisionPolicy: session.setup.decisionPolicy ?? 'legacy-pr176' },
  });
