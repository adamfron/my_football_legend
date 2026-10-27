import { readFileSync, writeFileSync } from 'node:fs';
import console from 'node:console';
import { read } from './pr196Evidence.mjs';
const path = 'docs/match-engine/ASSUMPTIONS_REGISTER.md',
  s = read('docs/performance/pr196/summary.json');
let text = readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
if (text.includes('PR196 development update'))
  throw Error('Preserve existing PR196 updates; review edits explicitly');
const ids = [
  'MEAS-011',
  'PASS-001',
  'PASS-006',
  'PASS-007',
  'DEF-001',
  'DEF-002',
  'DEF-003',
  'DEF-004',
  'DEF-005',
  'FIT-002',
  'DEC-003',
  'DEC-004',
];
const descriptions = {
  'MEAS-011':
    'Versioned original-delivery-v2 contract including live released-restart context, canonical contact deltas, original pass/shot identities, any-player interruption, explicit rejected/absent/unresolved states, separate endpoint/continuous retention, saved-state and mutating-observer regressions. Historical apparatus is preserved.',
  'PASS-001':
    '336 ground/aerial requests compare old and corrected ETA consumers on the same physical outcomes; unfitted completion claims retain their limits and can worsen in individual strata. No probability multiplier or success roll changed.',
  'PASS-006':
    'Direct touch, deflected touch, receiver ownership, one-second team endpoint and uninterrupted retention are distinct. Original PR195 long inputs still give zero direct receiver touches; reception capacity alone does not rescue the frozen original delivery.',
  'PASS-007':
    'All opposing contact/control witnesses are now observed, including other defenders; disruption without control remains separate. Named-defender-only evidence must not be generalized to an entire opposition.',
  'DEF-001':
    'The common subjective envelope is audited and measured separately; it is NOT replaced using hidden opponent attributes. B/R3 remain historical full-world consumers; bounded O/H/J scenes and choices retain hidden-rating invariance.',
  'DEF-002': `360 prescribed-body trials: held-out development MAE ${s.movement.held_out_development.old.mae.toFixed(6)} -> ${s.movement.held_out_development.corrected.mae.toFixed(6)} seconds. Opt-in projector reuses canonical turning, plant balance, directional speed and braking; actual bodies/contacts are unchanged.`,
  'DEF-003':
    '0.8m positional arrival, sampled finite-foot access, real ground/body contact and possession are not interchangeable. Ground/aerial traces retain ball height, motion, finite-foot access and contact witnesses; no interception is granted from ETA.',
  'DEF-004':
    'Bad-pass and two-defender controls still produce genuine defensive success. Contacts, trajectory disruption and ownership are recorded separately; useful-clearance and second-ball tactical value remain uncalibrated.',
  'DEF-005':
    'Twelve initial movement/orientation conditions at abilities 20–100, three distances and mirrors isolate momentum and body orientation. The predictor freezes fitness and assumes a prescribed target; real tactical reorientation and recovery lifecycle remain separate gates.',
  'FIT-002':
    'The forecast now reuses existing finite body integration in an opt-in branch; no movement capability/fitness/turn constant is changed. Actual lab movement integrates fitness and sprint episodes; short-forecast residual error and CPU cost are reported.',
  'DEC-003':
    'Native sampled candidate menus and thresholds are retained. Present-but-unadmitted, absent from bounded menu, full-world diagnostic alternative and rejected physical request remain separate; generation thresholds are not rewritten.',
  'DEC-004': `${s.harvest.captures} states from 15 autonomous 600-second WW/SS/SW development prefixes; ${s.counterfactual.uniqueRequests} unique one-action continuations from ${s.counterfactual.states} selected states. Actual next-tick traces and snapshot policy inspection are labelled separately.`,
};
for (const id of ids) {
  const re = new RegExp(`(^### ${id} [\\s\\S]*?)(?=^#{2,3} |$(?![\\s\\S]))`, 'm');
  text = text.replace(re, (block) => {
    const old = block.match(/- \[ \] ([A-Z_]+)/)?.[1];
    if (['LAB_REQUIRED', 'REFACTOR_REQUIRED'].includes(old) && id !== 'DEC-003')
      block = block.replace(`- [ ] ${old}`, '- [ ] LAB_ACTIVE');
    return (
      block.trimEnd() +
      `\n\n- **PR196 development update (historical PR195 status: ${old}):** ${descriptions[id]}\n` +
      '- **PR196 evidence / layers / status:** [PR196 report](../PR196_CANONICAL_OUTCOME_SEMANTICS_DEFENSIVE_REACH_AND_MATCH_STATE_CALIBRATION.md), [versioned summary](../performance/pr196/summary.json), original source archives and paired receipts. I/F: scoped contracts and canonical experiments; E: development diagnostics only; T/M: seven paired matches reported per policy, no global promotion; C: sealed/unrun. OPEN, no COMPLETE claim.\n\n'
    );
  });
}
const discovery = `### MEAS-012 — A designated defender is not the entire opposition in action attribution.\n\n- [ ] LAB_ACTIVE\n- **Category / subsystem:** Measurement, attributes and performance.\n- **Classification / priority / severity:** \`ENGINEERING_GUARD\`; **P0**; team-level contact claims can be invalid.\n- **Implementation:** [canonicalOutcome.ts](../../src/core/matchSimulation/canonicalOutcome.ts), [long-pass laboratory](../../scripts/benchmarkPr196LongPass.mjs).\n- **Current rule / discovery:** PR195 observed the named primary defender. Its zero named-defender contacts do not establish zero opposition contacts. PR196's exact 28 original long-pass inputs yield ${s.longPass.allOpponentContacts} all-opponent contact episodes and ${s.longPass.allOpponentControls} all-opponent control episodes; direct receiver touch remains ${s.longPass.directTouches}/28.\n- **Origin / provenance:** Discovered during PR196, building on merged PR195 34f1a9aa5c04c5517d81f63ba581f6c3b4e4f9cd. Historical receipts are immutable.\n- **Existing evidence:** [long-pass-v4.json.gz](../performance/pr196/long-pass-v4.json.gz), [summary](../performance/pr196/summary.json), original pass IDs and canonical contact/ownership witnesses.\n- **Validation layers:** I/F: canonical observer and negative attribution tests; E/T/M: only development evidence, no real-world rate; C: sealed/unrun.\n- **Dependencies / affected policies:** MEAS-011, PASS-001/006/007, DEF-003/004; all calibration consumers.\n- **Proposed laboratory / acceptance:** all-player contact attribution with substitutions, simultaneous within-tick events, body surfaces and independent replay; do not infer team-wide absence from a selected actor.\n- **Status rationale / remaining gates:** scoped discovery measured; simultaneous sub-tick ordering and full opportunity denominators remain open.\n- **Closure PR / commit / evidence:** PR196 source manifests and report; OPEN.\n\n`;
text = text.replace('## Shared physical response\n', discovery + '## Shared physical response\n');
writeFileSync(path, text);
console.log('PR196 register updates appended without deleting historical IDs');
