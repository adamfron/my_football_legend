# PR174 — Combination Play & Tactical Adaptation

Status: draft; validation in progress. Base: merged PR173 `c499123`.

The implementation connects short, physically observed runs to ordinary passing decisions.
It does not promise a completed return, progression or a shot. Full acceptance and the final
paired cohort results will be recorded here before the task is delivered.

## Audit and work plan

1. Freeze PR173, preserve PR171–173 evidence and reproduce the original cohort/extension runner.
2. Measure the existing coordinated-movement gap in full canonical states.
3. Add one short shared opportunity with at most three participants and two releases.
4. Test movement before changing candidate recognition; retain the intermediate sources/results.
5. Connect existing third-man/flank geometry and let the partner independently rank all options.
6. Extend existing threat memory with bounded completed-possession evidence; test stability,
   execution-versus-decision failure and contextual distance shots.
7. Validate separate reserved seeds, new club/XI/formation/style pairings, human agency,
   JSON continuation, full career accounting, browser behaviour and CPU cost.
8. Run the unchanged `npm run verify`. Do not mark the PR ready unless it passes.

## Existing foundations and confirmed gaps

Reused: tactical positioning/support/depth/flank budgets; ordinary locomotion and fitness;
PR173 momentum-aware intervention; pass launch, projection, interception and reception;
first-time passing; the canonical action resolver; release-time offside; threat-memory
decay, evaluation and persistence; shooting opportunity and canonical shot execution.

The previous build-up assignment was recomputed around the next owner, so the first passer
and a third supporting player had no short shared opportunity spanning the handover.
The stale-return assessment measured movement of the first receiver, not the original passer.
Neither finding justifies a universal progressive-pass or positional bonus.

## Contract and execution

`combinationIntent` and `lastCombination` are optional validated match-state fields. One active
record has stable physical pass IDs, team, initiator/partner/runner, purpose, origin/target,
expiry and observed milestones. It retains no action history. At most two distinct prospective
runners receive a bounded kinematic check at release; there are no hidden canonical rollouts.

Actual release starts the movement opportunity. Existing targets and locomotion execute it.
The partner receives ordinary pass candidates, with normal ability, interception, control,
alternative-action and offside costs. An observed useful runner can avoid the stale-return
penalty only when the independently evaluated current lane is safe. No contact/result override
or fixed combination bonus is applied.

Cancellation covers possession change, failure, unavailable participants, restart/period end,
expiry, unreachable destination, conflicting human movement and a selected alternative.
Human passers are never assigned an automatic run. Human receiving decisions remain pending.

## Evidence discipline

The controlled A/B/C/E/D/F/G stages retain their raw receipts and source snapshots. Early
controlled fixture revisions are retained, including cases in which a named prospective third
player was not actually assigned the existing third-man role. Those cases are not presented
as successful third-man evidence. Variant and mirror fixtures are dependent observations.

Initial 60-variant experiment: baseline losses 21, movement-only 21, recognition variant 18,
two-runner fallback 21. Mean maximum controlled progression: 3.034/5.827/4.072/6.064 m.
These mixed results motivate transparent full-match validation; they do not prove general
improvement. A completed two-pass exchange alone does not count as a coordinated combination.

## Verification status

Production build and strict research-harness TypeScript pass. The focused physical/lifecycle,
PR172/173 and threat-memory regression run passes 85 tests. Full verification, held-out cohorts,
performance measurements and final browser/career evidence are still pending at this checkpoint.

The first complete CI run passed 1817/1818 main tests and exposed the expected complete
telemetry change for seed b. Both pristine PR173 and final full outputs have now repeated
twice per seed in fresh processes; the all-field reference is updated without removing any
assertion, timeout, worker setting or tick. See `PR174-telemetry-reference.json`.

A changed natural senior continuation also exposed a real free-kick soft lock: an encroaching
marker's destination lay behind its own settled wall. The exact retained G state remains in
the evidence archive. A bounded destination search leaves bodies and the ball untouched and
allows the marker to walk around the wall before legal authorisation. The same state stays
blocked for 30 s on G and physically releases after 2.175 s on the final engine, with legal
readiness true and maximum body step 0.05966 m. The initial insufficient angular search is
retained as rejected H. No defender movement or football-law threshold is weakened.

Attacking evidence now distinguishes a transient forward visit followed by backward recycling
from retained controlled progression. Third-man connections may use a purposeful lateral run;
pass-and-go still requires actual forward movement. These cases have dedicated regressions.

## Roadmap

PR175: independent match-reality validation, especially advantage-to-shot conversion and losses.
PR176: generational renewal/world strength. PR177: summary simulation/PlayStyles.
PR178: career/shot UX consolidation. PR179+: world expansion. Order and integer numbering remain.
