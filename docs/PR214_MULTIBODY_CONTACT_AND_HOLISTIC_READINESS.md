# PR214 — Multi-body contact and holistic match readiness

Base: merged PR213, `ac2b238b749fdf88de381a50fb7236cfe1141f41`.
Research change: opt-in **`upright-cluster-dev-v1`** extends the existing pending/standing
canonical interval to sequential and simultaneous contacts among **up to four upright
outfield players**, including unilateral player movement edges. Local result: two body
impacts followed by an actual prepared pass and defensive foot contact within one 25ms
step; four-body support; deterministic saved continuations. Integration effect: the
nearest pair-remainder gap improves, but continuous whole-match body authority and
clinch geometry remain incomplete. Promotion: **RETAIN_EXPERIMENTAL; holistic match
BLOCKED_FOR_HOLISTIC_MATCH**. Maintained PR201, default B, 40Hz, 28 permanent attributes,
historical profile identities and sealed independent confirmation remain unchanged.

## Execution order and source audit

Work order was: (1) merged source/evidence audit, (2) interval ownership, (3) bounded
constraint response and canonical continuation, (4) edges/continuity/laws, (5) source-bound
positive and negative laboratories, (6) mechanism/compatibility inventory, (7) exact
configuration and first-match protocol, (8) required verification and historical replay.

Read the PR207–213 reports, architecture/candidates/dependencies/assumptions, formal
REALISM_PROGRESS/EVIDENCE, PROJECT_STATE and ROADMAP. Traced the actual source contracts
below; neither documentation nor selector presence is treated as execution proof.

| Authority | Current source / ordering |
| --- | --- |
| Decisions, human menu, laws, medical availability | `matchSimulation.stepCanonicalMatch` → `stepTacticalMatchCore`; `playerDecision`, `matchActions`, `matchRules`, `matchInjuries` |
| Motor budget, physical velocity, movement | `canonicalMovement.integrateCanonicalMovement`, `locomotion`, `lowerBodyGeometry`; one finite actuator update before drift |
| Pair/cluster proposals and persistence | `playerBodyContact`, `multiBodyContact`; existing 0.34m torso core, real `profile.weightKg`, `continuousPlayerContacts` |
| Prepared pass and standing attempt | `pendingStrike`, `pendingStrikeInterval`, `sharedContactTimeline`, `defensiveChallenges` |
| Feet, ball contact, secure control | `footContact`, `ballContactGeometry`, `ballAcquisition`, `matchSimulation.changePossession` |
| Ball trajectory and persistent body support | `ballPhysics.integrateBallFlight`, `ballFlight`, `ballContactResolution.supportContinuousBodyContacts` |
| Player movement limits | Existing live `[0.4,104.6] × [0.4,67.6]` area, distinct from stopped-play retrieval area and keeper goal-line exception |
| Whole-ball exit / goal / restart | `pitchBoundary` and existing boundary/referee consumers; legal terminal events win equal-time ties |
| Selection, save identity, policies | `matchState`, `integrationProfile`, `integrationMechanisms`; ordinary Zod save validation remains authoritative |

The invalidation point in PR213 was **after its first impulse**: replacement endpoints
could meet a third body or player edge, and the pair-only executor stopped. PR214 extends
that same candidate loop. It does not integrate another world, spend acceleration again,
or run the PR209 120ms laboratory executor as a live action.

The cluster's connected broad phase starts at the pending striker/standing pair and
nominates potentially reachable bodies for this interval. Those supported pairs bypass
the competing position-only personal-space projection while this interval owns their
torso cores. Actual impact, continuous support, player movement edge and whole-ball exit
remain different events. Unsupported nearby keepers/poses remain detectable uncertainty;
they are not silently removed to allow a corrected trajectory through them.

## Bounded approximation and conservation

`upright-pair-dev-v1` remains independently selectable. The new literal requires the same
standing-contact, low-pass and event-v1 selections. Historical profiles reject mixing
and clear the new selection, contact evidence and latches through their existing API.

At each earliest body/edge event, gather the touching connected component, sort stable
player/pair IDs with codepoint order, then perform at most **32 sequential impulse sweeps**.
This is an approximation to simultaneous unilateral constraints, **not exact multi-body
rigid-body dynamics**. Each approaching pair uses PR213's inverse-mass equal-and-opposite
normal impulse. A newly contacting pair may use `e=0.05` once; a latched pair and subsequent
sweeps use `e=0`. Tangential friction is zero. No angular momentum, articulated shoulder,
support-polygon failure or anatomical injury model is claimed.

For each pair, momentum is conserved and passive kinetic energy does not increase.
For the whole component, `P_after − P_before = J_player_edge`, within floating-point
residuals. An edge sets only the outward normal velocity to zero, preserving tangent
velocity and dissipating energy. The external edge impulse is recorded explicitly;
cluster momentum is not falsely claimed conserved against an external constraint.

Motor work has already changed the nominal velocity before these measurements start.
Every impulse stores its actual pre/post velocity, mass, energy and momentum. The drift
remainder records `locomotionWorkAfter=0`: it never invokes the actuator. Frame-to-frame
energy also includes active locomotion and other existing consumers and must not be
labelled passive collision energy. No contact delta-v is converted into an extra motor
acceleration budget; actual path accounting replaces the discarded nominal distance.
Each component also records `motorWorkAt` and per-actor pre-tick/nominal actuator velocities
and kinetic work. Deduplicate these by actor and canonical tick: two impacts do not spend
or earn that same actuator work twice. This is kinetic actuator work, not a metabolic cost.

Limits: four bodies/component, 32 sweeps, 16 shared events/interval, at most 231 pair
checks per component gather (22 players), six component constraints, at most 192 positive
pair-impulse witnesses/component, 22 persistent pair episodes, eight compact current-step
pair summaries and 16 current-step component records. Foot search retains 160 evaluations
per actor/foot, boundary refinement 32 evaluations. No unbounded history is persisted.
The connected broad phase has at most 22 passes over 22×22 candidates per invocation;
the new saved selection rejects oversized or duplicate-ID rosters. An initially outside
player is unresolved at time zero, never teleported by the shallow-overlap correction.

Shallow initial interpenetration up to **2mm** receives one finite inverse-mass position
projection, without changing velocity or inventing a fresh restituting impact. Residual
penetration is measured. Deeper overlap, tangency, unsupported pose, storage/body/event/
iteration exhaustion and post-impact speed outside the 12m/s supported envelope remain
explicit unresolved states. Previous valid impulses remain applied; no velocity clamp,
teleport to a winning contact or fictional owner resolves them.

## Canonical evidence and chronology

[Full receipt](performance/pr214/canonical-final-v3.json.gz),
[summary](performance/pr214/summary-final-v3.json) and [source binding](performance/pr214/source.json)
contain **25 canonical scenes and 100 schema-reload comparisons**, initial states, every
25ms frame, body/foot vectors, impulses, spin, latches, control/acquisition facts, laws,
unresolved cases and terminal hashes. The receipt includes four separately labelled
combined-configuration local continuations, not disconnected snapshots called a match.

| Scene | Actual event times (seconds) / result |
| --- | --- |
| Sequential three-player line | impact 10.010102980 → impact 10.017906159; both physical trajectories then support a third-body component |
| Third approaching | second impact occurs earlier; stationary/absent/away/late controls retain their actual event differences |
| Four-body line | three distinct new pair impacts at 10.000; subsequent sweeps are non-restituting support |
| Within-tick rearming | an already contacting pair genuinely clears >1cm; an unequal-mass third-body impact reverses motion, allowing a new pair impact in the same interval |
| Prepared pass after two body impacts | body 10.075843161 → body 10.078302530 → pass 10.080603132 → standing foot 10.091975545; all inside `[10.075,10.100]` |
| Completed pass before later impacts | pass 10.078915781 → body 10.080999323 → standing foot 10.081341162 → body 10.083405374 |
| Player edge | body 10.002491026 → player edge 10.004313052 → renewed support/edge 10.004517437; ball remains unrelated |
| Actual touchline exit during contest | body/edge constraints then whole-ball exit; existing boundary consumer awards throw-in |
| Near-edge foot/body | foot 10.053717345 → body 10.074781444; later actual boundary remains authoritative; this scene does **not** establish all three events inside one tick |

The matched isolated PR213 reference preserves exact impact time, impulse, participant-
identified post velocities and completed pass impulse. Pair tuple orientation may reverse
under sorted cluster IDs; the observer compares each velocity by actor ID. Its initial
orientation-only failed comparison is retained. The original PR213 receipt separately
runs unchanged against its exact source, not against intentionally modified runtime.

Maximum resolved component closing residual is **1.100e−9m/s**, momentum residual
**1.141e−13kg·m/s**, penetration **3.664e−15m**; no positive passive cluster energy residual
above rounding occurs. Maximum observed component size is four; a deliberate five-body
input is rejected. Maximum observed component events/tick is five. Exact vectors and all
small support impulses remain available rather than replacing them with rounded prose.

## Continuity, controls and clinch

`continuousFootContacts`, `continuousPlayerContacts`, `ball.continuousBodyContacts`,
`defensiveEpisodes`, `recentDuel` and retained finite control remain separate contracts.
Player-pair rearming requires real >1cm clearance and renewed approach; owner/ball-episode
changes do not rearm a touching surface. Completed strokes retain their prepared path.
Pair clearance is checked at each shared event, including within a tick; a distinct
third-body reversal after clearance is not falsely treated as the old resting contact.
The same-actor once/interval and existing motor recovery remain disclosed limitations.
Independent players can make two genuine foot impulses only milliseconds apart.

The two two-second stationary scenes each retain four distinct finite foot contacts and
one new control; the whole 25-scene corpus has **zero unexplained acquisitions**. This is
scoped regression evidence, not proof that every historical keeper/high-ball route or
every possible stationary oscillation is repaired. Acquisition validates actual available
finite control separately from nomination and does not award a collision winner.

The old eight-pass two-surface ball-support apparatus remains preserved by PR212/213
exact-source replay. Introducing the third player in the new canonical scene reveals an
important geometry mismatch: centres 0.50m apart in that apparatus **already overlap the
0.68m solid upright torso cores**. It is not a valid resting three-body upright fixture.
PR214 reports `initial_body_overlap` at 10.000, retains the unresolved ball/body state and
does not eject the ball, award possession, invent a foul or stop play by a new rule.
Coupling a physically admissible clinch to the torso/foot geometry remains **BLOCKED**.
The eight-pass ball solver is not expanded merely to conceal this incompatible apparatus.

## Laws, human authority, balance and negative results

Fresh contact of the selected standing pair still reaches its existing referee diagnostic,
independent of later foot contact. An actual foul stops later cluster travel at its own
time: the new edition no longer restores a future endpoint through a third body/edge after
that interruption. Neutral apparatus scenes remove the defensive intention while retaining
an unreachable prepared pass to own the ordinary canonical interval. This separates
passive mechanics from legitimate referee stoppages without suppressing the referee.
Incidental third-body contact has no new charging/holding classifier; broader law coverage
must be assessed when extending interval ownership.

PR210 physical action readiness and whole-world menu pause remain authoritative; new
tests use a real offered shot decision and test the pending pass's single-release owner.
The pending actor cannot obtain a replacement menu while its canonical swing continues.
The real offered-menu freeze test is a separate playable shot snapshot: a concurrent
other-human menu during an unfinished strike was not exercised by this corpus. Gate Q
therefore retains that explicit coverage limit rather than inventing an offered menu.
Fitness/injury/career/referee consumers remain intact. Existing bounded balance response
receives actual specific impulses; low plant balance is never interpreted as a fallen
pose. No fall, injury-rate change or new permanent attribute is introduced.

Negative evidence: deep overlap and clinch overlap; >4-body component; exact tangent in
the direct interval contract (the canonical near-tangent scene is a real miss after motor
motion); original foot-search uncertainty; unsupported keeper; original pair-array observer
mistake; an initially routine human fixture offering no meaningful menu; sandbox cache,
generated-world and unpacked-npm setup failures. Failed logs and reconstructible source
archives remain separate from final successful results.

## Local gates and integration decision

| Gate | Decision / exact scope |
| --- | --- |
| A: ownership audit | PASS; extension stays on existing interval, no extra motor integration |
| B: 2–4 body response | LOCAL PASS for upright torso constraints, passive energy/momentum and bounded residuals |
| C: canonical third-body remainder | PASS; two body impacts and both actual feet in one 25ms interval; earlier completed pass unchanged |
| D: edges / overlap / tangent | PARTIAL; valid player edges/ball law coexist; shallow correction, deep/tangent uncertainty; no all-events-in-one-tick edge claim |
| E: episodes/control | SCOPED PASS; geometric persistence/rearming and zero unexplained corpus acquisitions; universal continuity not claimed |
| F: clinch intervention | BLOCKED; historical spherical support apparatus conflicts with solid torso geometry |
| G: balance/injury/human/laws | Existing scoped contracts retained; true falls and incidental charging/holding remain outside scope |
| H: source/save/performance | See verification receipt; deterministic local saves and matched reference; no universal collision or cross-platform long-match claim |
| Holistic full-match gate | BLOCKED; narrow interval coverage, admissible clinch coupling and complete consumer activation witnesses remain |

The [inventory](match-engine/HOLISTIC_MECHANISM_INVENTORY.md),
[compatibility matrix](match-engine/HOLISTIC_COMPATIBILITY_MATRIX.md) and
[PR215 protocol](match-engine/HOLISTIC_MATCH_PROTOCOL.md) distinguish structural selection,
local validation, empirical calibration and whole-match evidence. The unprofiled development
recipe loads and replays without weakening historical save checks. It is **not promoted**
to a historical profile or a new default. The short integration smoke is **NOT RUN**, because
mandatory coverage/activation gates remain incomplete; the local combined scenes are not
renamed as that smoke or the first holistic match.

## Cost, verification and reproduction

Final-v3 corpus recording on Windows / Node24.22.1: **7.731s wall / 10.484s process CPU**,
peak RSS **572640KiB**, including full retained evidence, 100 reloads and matched timing.
The matched no-frame observer measures 512 canonical ticks/arm from 64 identical pair
inputs: old pair **0.593s wall / 0.984s CPU**, cluster **0.554s / 0.719s**. This single
ordered local sample is not a speedup claim or a complete-match overhead estimate; process
RSS is shared. Maximum serialized paired terminal tactical state is **120672 / 120701B**;
contact-rich saved checkpoints can be larger (164380B in the named pass scene).

Required verification and retained attempts are recorded in
[verification](performance/pr214/verification.json). PR195–213 evidence bytes and assertions
remain unchanged; the current-source guard advances independently and PR213 now has its own
real-file historical export. The existing consolidated job family is retained.

| Verification phase | Completed result |
| --- | --- |
| Full `npm run verify` | PASS: 2589 unit + 56 integration + 4 career-contract + 5 full-career = 2654 tests, lint, TypeScript and production build |
| Frozen publication source | PASS: **2591 unit tests**, **87 focused contracts**, final lint, exact current replay, schema/full-roster and pass-first/actuator-work supplements |
| Historical/current CI checks | **21/21 PASS**, including unchanged original PR203–213 source replays, manifest, workflow, six CI contracts and deliberate corruption rejection |
| Source archives | **6/6** reconstruct every manifest entry against merged PR213 |

The full verify invocation started before the final selected-cluster-only roster/edge and
within-tick rearming follow-ups. Its unit phase is not falsely rebound to the later source:
the separate 2591-test publication rerun covers that frozen source; later TypeScript/build,
focused contracts and historical replays also pass. All phase identities and failed attempts
remain in the verification index. Existing Vite mixed-import/chunk-size warnings remain;
hosted CI belongs to the published head and is assessed separately.

[Supplementary source-bound checks](performance/pr214/additional-checks-v2.json) retain
44 complete roster profiles, 28 attributes each, exact unchanged pass-first impulse,
136 unique actuator work witnesses and 66 repeated-witness consistency checks, plus the
actual pending/no-replacement and offered-shot/frozen-world snapshots. Its separately hashed
method is retained beside the receipt. The initial observer's undefined-versus-JSON comparison
failure is preserved; serialization normalization changes no physical vector or assertion
about the real pause.

```text
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr214.mjs --check
node scripts/ci/replayPr213Check.mjs
node scripts/ci/buildManifest.mjs --check
node --test scripts/ci/contracts.mjs
node scripts/ci/renderWorkflow.mjs --check
node scripts/realismProgress.mjs --check
npm run verify
```

## Five required final answers

1. **Yes, within the named existing intervals and ≤4-body upright scope.** Real sequential
   and simultaneous impulses/remainders work without undoing prior events or duplicating
   one surface's restitution. This is not whole-match or universal rigid-body support.
2. **Yes for the tested corpus, with explicit limits.** Foot/body latches and finite control
   retain genuine repeated contacts, zero unexplained acquisitions and no invented winner.
   Unifying every ordinary carry/loose/delivery and keeper route remains open.
3. **25 live experimental/agency families + one laboratory primitive**, four explicitly
   catalogued historical alternatives, nine shared canonical consumer groups. Ten families
   are structurally compatible/locally evidenced for a limited B development combination;
   this is not ten fully calibrated mechanisms or a completion percentage. Exact rows and
   exclusions are in the inventory/matrix; the 135-issue evidence counts remain separate.
4. **Yes for schema construction and the recorded local continuations.** Historical
   fingerprints and their constraints are unchanged. Full autonomous match replay of the
   proposed recipe has not been established.
5. **Not yet for the requested holistic match.** First extend this single contact-interval
   owner across ordinary carry/loose/delivery continuation while preserving keeper/law
   authority; resolve the admissible clinch geometry and complete selected-consumer
   activation witnesses. The frozen inputs and diagnostic protocol are ready for that
   dependency; zero formally COMPLETE issues is not the reason for this decision.
