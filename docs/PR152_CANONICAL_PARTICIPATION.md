# PR152 — Canonical Player Participation, Statistical Invariants & Match Sanity

Base: latest merged `main`, `a9f1d123a3bae655e9bea9e8f4bd2ec0d643e393`, including PR150/151.
The implementation uses a fresh `codex/pr152-canonical-participation` branch.

## Architecture contract

Canonical participation, human agency and visible footage are separate responsibilities.
Every active footballer participates in the same fixed-step simulation throughout hidden and
visible play. A controlled identity is not a passing preference, touch quota or reason to remove
the player from normal positioning, reception, possession and defensive systems. A meaningful
pending human choice pauses the canonical snapshot; an accepted human intent owns its physical
execution until the existing football boundary. Outside those boundaries, shared autonomous
policy supplies ordinary football actions. Presentation observes those facts and selects footage.

Many canonical possession episodes can therefore coexist with few human prompts. PR152 does
not impose role-specific touch targets or increase the PR151 presentation selection frequency.
Warnings identify suspicious distributions without changing football outcomes or consuming RNG.

Public `touches` means a possession/control or intervention episode. Receive → control → carry
→ dribble → pass remains one episode. Release, loss, another actor's intervention and restart
setup close it. First-time pass/shot combines the incoming contact and release into one episode;
claims and interceptions use physical acquisition evidence. Detailed contacts and executed carries
remain separate internal/action counters, so carries need not equal public touches.

## Controlled-player audit

| Path | Finding / contract |
| --- | --- |
| Visible human choice | Exact meaningful opportunity freezes canonical time, movement and RNG; selected possession intent retains ownership |
| Visible autonomous live play / hidden football | The same canonical integrator and NPC action policy execute routine play; visibility is not an action-policy input. Historical lead-in replays earlier footage while the canonical decision snapshot remains frozen |
| Passing targets / support / formation | No controlled-identity exclusions were found in receiver ranking, network allocation, formation anchors or ordinary support targets |
| Loose ball / possession changes | Normal physical race and acquisition apply; source facts now retain the acquisition actor across an immediate release |
| Incoming contact | The old identity-wide first-time-finishing exclusion could suppress a playable finish even when the short contact window correctly produced no prompt |
| Shot / cross | The old resolver reserved these actions by identity; the guard now tests a real pending choice |
| Restart | A controlled taker without a pending decision now releases at the normal setup boundary instead of waiting solely because of identity |
| Defence | Shared intent ranking and physical standing-safety rules replace controlled-only exclusions; a real pending human decision still owns the boundary |

`playerAgencyEnabled: false` is a validated explicit no-intervention mode for headless comparison;
it keeps the measured player identity, role, attributes and XI. The default enabled path is also
tested: a quiet hidden CM reception and ordinary circulation match the NPC without prompts.
First-time contact, delegated terminal actions/restarts, selected intent preservation and three-role
comparison fixtures are in `pr152Participation.test.ts`. No passing participation weight or quota
was added. Accounting definitions, source evidence, invariants and discipline causal paths are in
[PR152_ACCOUNTING.md](PR152_ACCOUNTING.md).

## Benchmark collection and reproduction

`npm run benchmark:sanity` runs the shipped key-player agency, moment and consequence-window
laws with explicit DEV decisions at exact canonical boundaries. It also supports an autonomous
controlled-player variant and a cloned NPC variant, preserving the same XI/role/attributes/tactics/
seed. Normal mode does not invoke detailed flow or agency observers. The cheap tracker uses
scalar statistic deltas and does not collect tactical histories or render hidden frames.

Possession starts are attributed to the visibility at their canonical start; a hidden reception
later shown to the player remains a hidden canonical episode. The export separately counts actual
human prompts and visible sequences involving the player. Shares use the player's own team;
per-90 rates use actual canonical duration, with dismissal-time player minutes kept separately.
Missing older recovery/block/duel evidence is null with partial defensive-coverage metadata.
Legacy missing restart counts derive from canonical award identities, without inventing events.
Previously saved impossible tackle totals cannot be reconstructed from a single legacy challenge;
they remain preserved and flagged, rather than clamped. Fresh canonical evidence prevents that
combination. A fresh DEV scenario resets current-run presentation and participation scalars.

The surfaced driver resolves opportunities with explicit DEV policy rather than reproducing a
human's choices. Incoming/off-ball/defensive/keeper choices delegate to ordinary autonomy;
on-ball and restart choices use the existing action ranking. Visible involvement counts connected
sequences, which can contain several prompts and possessions. Defensive involvement is the sum
of attempts, interceptions, recoveries and blocks, not a deduplicated defensive possession count.
Hidden coverage describes canonical advancement; lead-in/replay can later show those events.
The driver uses shipped window laws but omits browser scheduling, so a noninteractive safety-bound
visibility transition can differ by one tick without changing canonical football.

```sh
npm run verify
npm run benchmark:sanity -- --minutes=45,90 --seeds=a,b,c --output=.benchmark-artifacts/cm.json
npm run benchmark:sanity -- --minutes=90 --seeds=a --variants=controlled_autonomous,npc --output=.benchmark-artifacts/parity.json
npm run benchmark:sanity -- --minutes=90 --seeds=a --observer-modes=normal,dev --repeats=2 --output=.benchmark-artifacts/replay-observers.json
npm run benchmark:sanity -- --minutes=45 --scenarios=weak-strong --position=striker --seeds=a,b --output=.benchmark-artifacts/weak-striker.json
npm run benchmark:sanity -- --minutes=45 --position=left_back --seeds=a --output=.benchmark-artifacts/fullback.json
```

For the baseline, add `--engine-root=/path/to/latest-main --revision=main-a9f1d123`
and `--allow-invariant-failures` to retain evidence of existing accounting failures. Full fixture
duration, requested/actual position, slot/formation, statistical failures, hashes, positional
involvement and collection scope accompany every row. Repeats compare complete non-timing
results; normal/DEV compare canonical hashes; autonomous controlled/NPC compares statistics,
positioning and physical football rather than control/source metadata.

Headless timing includes the canonical driver, in-loop timeline hashing, invariant checking and
selected observations. It excludes React, renderer, human thinking, historical lead-in playback
and final export/fingerprint serialization. Concurrent correctness runs carry contended timing
metadata; only separate sequential matched runs support before/after performance comparisons.
Archived PR151 timing used a different harness and is not directly compared with these times.

The supplied human playtest's seven-touch half has no exact seed, XI/configuration or human
choice history attached. The new fixtures test the shipped engine and source contracts; they
do not establish a reproduction or a numerical seven-touch-to-new-total improvement for that
specific playthrough. The cheap normal export is intended to retain that evidence next time.

## Before/after evidence

The checked-in [PR152-summary.json](performance/PR152-summary.json) contains 28 correctness
rows and four isolated timing rows. All 32 reach their requested duration; none is abandoned.
The baseline is the exact merged main above. Measurements completed on 4 October; evidence
consolidation after the interruption is dated separately. Normal/DEV each repeat the full
90-minute seed `a` twice with identical canonical-state, statistics and action-timeline hashes.

Balanced central-midfielder results, in seed order `a, b, c`:

| Duration | Possession episodes before → after | Human prompts before → after |
| --- | --- | --- |
| 45 minutes | 67, 59, 69 → 67, 58, 69 | 11, 13, 8 → 11, 14, 8 |
| 90 minutes | 117, 102, 93 → 117, 107, 142 | 13, 24, 19 → 13, 16, 22 |

Canonical involvement therefore stays separate from sparse agency. There is no uniform
increase in every seed and no role-based target. The autonomous controlled player and cloned
NPC in seed `a` at 90 minutes have exact football/statistics/position equality: 115 episodes,
80 received passes, 87 attempted passes, three carries and 5872.8 metres, with zero prompts.
After the change, hidden possession starts are 66/56/68 at 45 minutes and 116/105/139
at 90 minutes. Visible starts add the remaining 1/2/1 and 1/2/3 episodes respectively;
coverage partitions exactly. Later footage can still show those earlier hidden actions.

Selected balanced-CM rates per 90, shown as minimum / median / maximum across three seeds.
The full JSON also retains attempts/success, interceptions, possession changes, possession
shares, corners, offsides, distance, sprint and raw team/player totals:

| Metric | Before 45 | After 45 | Before 90 | After 90 |
| --- | --- | --- | --- | --- |
| Attempted passes, both teams | 809.9 / 814 / 848 | 796 / 809.9 / 830 | 807 / 814 / 827 | 802 / 807 / 823 |
| Shots | 2 / 10 / 16 | 2 / 10 / 16 | 6 / 7 / 11 | 6 / 6 / 13 |
| Shots on target | 0 / 4 / 6 | 0 / 2 / 6 | 2 / 2 / 6 | 1 / 2 / 4 |
| Fouls | 20 / 24 / 34 | 20 / 20 / 38 | 19 / 20 / 27 | 20 / 20 / 22 |
| Yellow cards | 4 / 6 / 10 | 4 / 4 / 6 | 3 / 5 / 6 | 2 / 5 / 7 |
| Red cards | 0 / 2 / 2 | 0 / 2 / 2 | 0 / 1 / 1 | 0 / 1 / 1 |
| Penalties | 0 / 2 / 2 | 0 / 0 / 2 | 0 / 1 / 1 | 0 / 0 / 1 |
| Throw-ins | 26 / 34 / 44 | 16 / 34 / 44 | 31 / 40 / 43 | 24 / 39 / 40 |
| Goal kicks | 4 / 10 / 10 | 4 / 8 / 10 | 6 / 8 / 9 | 5 / 5 / 6 |
| Free kicks | 12 / 12 / 12 | 12 / 14 / 14 | 10 / 10 / 14 | 10 / 10 / 12 |

All new rows have zero statistical invariant failures. The baseline exposes impossible
tackle counts in CM seed `c` and LB seed `a`; that LB has one attempt but two wins. New
accounting observes accepted commitment/result identities and their actors rather than
fabricating a tackle from a possession-change label. It does not clamp old saved counters.

Role/stress fixtures show residual calibration concerns. Weak-team striker seeds `a/b`
have 12/11 episodes after the change, zero received passes and zero shots despite team
circulation. Balanced LB seed `a` changes from 57 to 49 episodes and 8 to 9 prompts, but
team fouls rise from seven to 20 in the half. Autonomous CM/NPC parity has 29 fouls and
five penalties over 90 minutes in both variants. These are diagnostic signals; identity
parity and correct accounting do not establish globally realistic attacking/discipline rates.
The hash-preserving LB diagnostic attributes the rise to more risky contacts: 35→79
accepted attempts and 9→26 risky intents, with fouls/risky-intent ratio 77.8%→76.9%.
All fouls are autonomous committed/slide contacts, none standing or DEV-selected.
The source/context findings and remaining reach/timing concern are in
[PR152_ACCOUNTING.md](PR152_ACCOUNTING.md).

Isolated matched 45-minute timing uses one process on the same hardware and driver:

| Seed | Main | PR152 | Change |
| --- | --- | --- | --- |
| a | 48.451 s | 47.716 s | −1.5% |
| b | 53.187 s | 56.009 s | +5.3% |

Both isolated rows reproduce their contended correctness hashes. The two-seed aggregate
is about 2.1% slower; seed `b` also has a changed football trajectory. This is a limited
matched-runtime observation, not an observer-only overhead measurement or an optimization
claim. The normal path still makes zero detailed observer calls and stores only scalar
coverage. Contended durations are excluded from performance conclusions.

During collection, the app panel's current-run telemetry reset was corrected. That panel
is not imported by this headless driver. Per-file checks prove the other 232 runtime/runner
files stayed unchanged; the report records both full hashes and the equal scoped hash
`dc5c262d159cdb9833ca6db7c1760e32c09396b47d800f59964101b4d7ba3775`.

## Verification

Full `VITEST_MAX_WORKERS=2 npm run verify`, using the existing CI worker budget, passes
ESLint, 1005 main tests across 145 files, five full-career tests,
TypeScript and the production build. Existing dynamic-import and bundle-size build warnings
remain. The fixed physics step, RNG APIs, replay storage and renderer suppression code are
unchanged. Headless renderer-call counts are zero because the renderer is absent; this benchmark
does not measure browser render cost or claim to replace the existing renderer tests.

## Restart continuity audit for PR153

The authoritative hard-positioning entry is `restartScenarios.ts:applyRestartScenario`.
`restartGeometry.ts:deriveRestartGeometry` selects the taker and legal target geometry. The
scenario application immediately replaces the ball with the taker's placement, clears action,
movement/reception and human-possession state, then maps every active player to the geometry
target, assigns the same `target`/`idealTarget` and sets velocity to zero. This is a teleport,
including for players far from their new positions. The setup movement branch in
`matchSimulation.ts:stepTacticalMatchCore` holds velocities at zero; it does not walk players
to those targets. The setup delay and watchdog concern release, not physical readiness.

Production entry paths into that reset:

| Trigger | Canonical entry |
| --- | --- |
| Ball crosses touchline/goal line | `matchSimulation.ts:applyBoundaryRestart` → throw-in/corner/goal kick |
| Shot crosses outside goal | `matchSimulation.ts:finishShotContact` → goal kick |
| Goal | `finishShotContact` sets `goalCompletionUntil = time + 0.55` and `pendingKickoffTeam`; `stepTacticalMatchCore` applies kickoff when the interval ends |
| Foul / penalty / recalled advantage | `matchRules.ts:awardFoulRestart` → free kick / penalty |
| Delayed-card roster adjustment during setup | `matchRules.ts:advanceMatchRules` rebuilds the scenario geometry |
| Offside participation | `offside.ts:awardOffsideRestart` → indirect free kick |
| Second-half start | `matchSimulation.ts:startSecondHalf` → away kickoff |
| Explicit DEV scenario selection | `TacticalMatchSandbox.tsx` directly calls `applyRestartScenario` |

`createTacticalMatch` initially places players at formation anchors; that is initial match setup,
not a live-play restart. The 0.55-second goal interval integrates residual ball movement, but
has no goal-reaction/celebration/retrieval state. The half/full-time wrapper finishes committed
physics and clears transient state; it does not yet model accumulated stoppage time. Restart
position replacement must continue to be excluded from locomotion distance.

Next recommended scope: **PR153 — Dead Ball & Restart Continuity**:

- ordinary physical repositioning from current coordinates toward legal restart targets;
- canonical goal-reaction state and celebration versus urgent restart based on score/time;
- retrieving the ball after a late comeback goal;
- restart readiness from player/ball availability rather than a geometry teleport;
- a foundation for stoppage-time accounting, with canonical dead-ball reasons and duration.

PR152 only audits these paths. It adds no celebration, ball retrieval, bench, referee, substitution,
stadium, injury or accumulating stamina system.
