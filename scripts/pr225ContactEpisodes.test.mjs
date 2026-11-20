// @vitest-environment node
import { expect, it } from 'vitest';
import { classifyContactEpisodes } from './pr225ContactEpisodes.mjs';

it('counts alternating solver impacts as one episode until canonical clearance is observed', () => {
  const contacts = Array.from({ length: 16 }, (_, i) => ({
    at: 1 + i * 0.0001,
    actorId: 'defender',
    surface: i % 2 ? 'left_shin' : 'right_shin',
    kind: 'limb',
    intended: false,
  }));
  contacts.push({
    at: 2,
    actorId: 'receiver',
    surface: 'right_boot',
    kind: 'boot',
    intended: true,
  });
  const r = classifyContactEpisodes(contacts, [1.5], [1.001]);
  expect(r.observedEpisodes).toBe(2);
  expect(r.solverEvents).toBe(17);
  expect(r.repeatedEpisodes).toBe(1);
  expect(r.simultaneousEpisodes).toBe(1);
  expect(r.solverRepetitionCandidates).toBe(1);
  expect(r.intendedEpisodes).toBe(1);
  expect(classifyContactEpisodes(contacts, []).observedEpisodes).toBe(1);
});
