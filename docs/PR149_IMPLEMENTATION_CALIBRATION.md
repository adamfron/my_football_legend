# PR149 — Match Readability, Animation & Match Centre v2

## Problem and implementation order

PR148 is the canonical baseline: main `a16e16c6ad7744d0a0dd663a590b9e385ca0cf46`,
tree `69e628554d22c7cbed8f294eae5a30b9f38e9ee3` (identical to PR148 head `fa2909a`).
The work was divided into cadence/baseline, canonical possession and reception, accounting,
permanent events, Match Centre, semantic animation, bounded replay, and verification.
No dependency was added. One root integrated the core contracts; parallel implementation had
separate ownership of possession, statistics/benchmarks, and UI.

## Possession audit and canonical preparation

The visible 4–6-second pause had two distinct causes. `chooseNpcRoutineAction` waits for
`npcPossessionDecisionDelay = 6 - pressure³ × 4.8` seconds; `movementPhysics` previously
pinned an ordinary owner to their current position. `onBallPreparation.readyAt` describes the
shorter physical settling requirement, rather than that entire tactical scan.

PR149 preserves the major-decision delay and readiness gates. The existing preparation gains
an explicitly validated `micro` intent: controlling, directional touch, turning, adjusting,
scanning, shielding or recovering, with phase start, origin, local target, orientation,
passing angle, ball offset, pressure and reason. Bounded corrective movement and canonical
body/ball placement express that interval. Phase changes do not increment the major-decision
index, start a conventional carry episode, count a fictional contact each tick, or create a
human menu. Committed human/NPC movement retains priority over routine preparation.
After a committed carry/movement or own loose-ball recovery, the local micro origin is
rebased to the current position. Possession/readiness timestamps remain intact; stale
reception coordinates cannot pull a player back toward their earlier position.
Directional first-touch ball offsets follow the recorded touch direction even when the receiver
is looking back at the passer, preserving the physical contact across owner-maintenance ticks.

## Reception audit and consequences

The ground-contact path cleared incoming velocity/height before the reception resolver.
This hid pass difficulty. The contact now retains physical arrival evidence and evaluates
pressure around the actual receiver. Reception quality includes first touch, technique,
composure, concentration, preparedness, facing, speed, height and weak-foot difficulty.
Evidence is recorded with the outcome for calibration. Clean/directional controls remain
ownership; heavy/failed control creates a physical loose ball and recovery requirement.
Failure never fabricates ownership. No per-match error quota or extra UI RNG exists.

The original model could produce imperfect receptions: the clean PR148 weak/strong 45-minute
fixture has 25 heavy and 9 failed controls. Its balanced ten-minute fixture has none.
Restoring contact evidence initially over-penalized ordinary side-on reception; the final
calibration therefore distinguishes reachable, prepared ground control from awkward/difficult
contacts rather than simply imposing mistakes.
Throw-in release ends at the first other physical contact even when that contact is heavy;
it does not promise immediate ownership. Separate clean/heavy regressions preserve the
restart restriction, real loose-ball reclaim and subsequent ordinary-pass contracts.

## Accounting audit

Two causes of missing received passes were found. First, a queued receive-and-pass action
replaced the incoming diagnostic before observers could credit it. `lastResolvedPass` now
preserves that result, including first-time finishes. Second, an actual teammate other than
the selected target could control the pass while its diagnostic said `unclaimed`. Successful
physical teammate control records `actualReceiverId`; completed/received, contact, network,
assist and feedback accounting use that identity. Loose heavy/failed controls remain errors.

Attempts belong to the selected passer→target network edge. Completions belong to the actual
passer→receiver edge. Consequently a realized edge can have zero attempts and one completion;
per-edge completion≤attempt is intentionally not an invariant. Player/team attempts and
completions and global completed=received remain reconcilable without inventing attempts.
The flow observer follows the same resolved-contact identity and aggregate network invariant,
including an immediate outgoing action after reception.

Stable team membership includes dismissed players. Canonical team accounting tracks blocked
shots, offside offences and restart awards with exactly-once IDs. Possession is elapsed
canonical live time credited to the established team spell, including its pass/loose-ball
intervals; dead-ball setup and halftime are excluded. The denominator is the sum of both
credited live totals. It is not ball ownership sampled from UI frames or active-body-only
time. Percentages are omitted before that denominator exists.

## Event feed and Match Centre

`matchEventFeed.ts` observes both canonical stepping entry points after rules and action
evidence. Permanent `state.matchEvents` stores goals, yellows, second-yellow dismissals,
straight reds, actual penalty awards, fouls and internal kickoffs. IDs and references include
canonical time, side, actors, score when relevant, contact/action reference and replay key.
Short-lived `actionEvents` and persistent match facts have separate retention semantics.
The feed depends on neither React nor `TacticalMatchSandbox` and consumes no RNG.

The Polish Match Centre always projects the live complete canonical match, including hidden
football under all five watch policies and during historical playback. It shows the score,
events, shots/on-target/blocked, possession, attempted/completed passes and completion rate,
fouls, yellow/red cards, offside, corners, free kicks, throw-ins, challenge attempts/wins and
interceptions. Second yellow counts as another yellow and one dismissal; restart counts are
awards, not completed deliveries. Names come from the initial session roster after dismissal.

## Semantic animation and feedback

Canonical preparation maps to body, feet, head turns and shielding/recovery poses. Carry
execution overrides historical preparation. Live, lead-in and event replay use their own
recorded frame time. Canonical micro ball placement reaches the renderer; the existing cosmetic
toe position is retained for committed carry. Passing, shooting, receiving, tackling,
sliding and goalkeeper cues remain evidence projections. Animation never advances football.

Feedback has at most three short labels, with priorities, actor/kind suppression, team colours,
screen collision handling and stable phase IDs. Important contacts supersede routine states;
scanning avoids repetitive text. A slide/interception or poor control can explain a lost ball
without DEV telemetry or another decision interruption.

## Recorded replay storage

`MatchReplayHistory` lives in core and optionally observes canonical state without invoking
the renderer. Normal match UI records it during hidden as well as visible ticks. It keeps
5 Hz compact presentation snapshots for 12 seconds (≤64 samples), with exact samples for
new important events and period boundaries. Goal/card/penalty windows contain up to six seconds
before and three seconds after the event, ≤50 samples each; at most eight windows survive.
Old feed entries remain after their footage is evicted and have no replay button.

Snapshots retain geometry, orientation, velocity, active roster/dismissal boundaries,
preparation/carrying and short action evidence, rather than full simulation/profile/history
objects. Returned windows are copies. Replay uses sampled geometry with short-gap interpolation
and discontinuity guards; it neither resimulates outcomes nor mutates/rewinds live state.
Ready event buttons reuse the existing playback surface. Replay observation errors are
isolated from canonical progression. This is a sampled foundation, not cinematic or per-tick
reconstruction. Estimated serialized UTF-16 bytes are reported separately from actual heap/RSS.

## Verification and calibration evidence

Final runs use `PR149-final-continuity-verified`, 25 ms steps and deterministic explicit DEV
choices at actual opportunity boundaries. The browser was blank during serial timing. Baseline
measurements were preserved from the clean PR148 engine; no old or interrupted post-change
measurement is presented as final. Compact aggregated results and source fingerprints are in
[PR149-results.json](performance/PR149-results.json), without raw per-tick snapshots or ledgers.
The readability matrix uses seed `a` for each scenario; the two ten-minute repetitions verify
determinism and timing variation, rather than providing independent football samples.

| Fixture            | Attempts PR148 → PR149 | Completed = received |     Touches | Human decisions | Fouls / yellow / red |
| ------------------ | ---------------------: | -------------------: | ----------: | --------------: | -------------------- |
| Balanced 10 min    |                78 → 95 |              57 → 69 |   218 → 210 |           3 → 3 | 4/3/0 → 5/2/0        |
| Balanced 45 min    |              386 → 410 |            262 → 299 |   944 → 963 |          10 → 8 | 10/3/0 → 7/4/0       |
| Weak–strong 45 min |              434 → 426 |            215 → 193 | 1024 → 1135 |           1 → 0 | 2/0/0 → 1/1/0        |
| Balanced 90 min    |              779 → 840 |            531 → 604 | 1894 → 1944 |         18 → 21 | 12/4/0 → 9/6/0       |

Balanced 90-minute attempts increase 7.8%, touches 2.6%, and meaningful decisions 18 → 21.
Possession changes are 312 → 206, shots/on-target 9/4 → 3/2, and score 2–0 → 1–0.
The preparation timer law is unchanged; physical control and geometry change trajectories and
opportunities. These figures do not establish an identical outcome or a league-wide distribution.
Short ten-minute attempts rise 21.8% while touches fall 3.7%; no count is scaled for display.

| Fixture            | Mean hold s PR148 → PR149 | Median hold s | PR149 p95 s |  Maximum hold s |
| ------------------ | ------------------------: | ------------: | ----------: | --------------: |
| Balanced 10 min    |             4.490 → 4.574 | 4.775 → 4.775 |       5.725 |  23.400 → 8.400 |
| Balanced 45 min    |             4.310 → 4.746 | 4.750 → 4.800 |       5.750 | 23.400 → 17.650 |
| Weak–strong 45 min |             4.697 → 4.924 | 4.825 → 4.775 |       5.225 | 32.550 → 21.750 |
| Balanced 90 min    |             4.295 → 4.700 | 4.775 → 4.775 |       5.700 | 23.400 → 17.650 |

Baseline p95 exists only for the clean ten-minute run (6.000 s); older 45/90 reports did not
retain it. Active canonical micro episodes exclude outgoing flight, committed carry/movement
and restart placements. Balanced 90-minute net preparation displacement has median 0.635 m,
p75 0.649 m. Baseline displacement is omitted because it included unrelated movement and is
not comparable. Physical tests explicitly traverse control → turn/adjust → scan → action
without renewed contacts or decision popups; local intent targets remain bounded.

| Fixture            | Clean PR148 → PR149 | Directional |   Heavy | Failed |
| ------------------ | ------------------: | ----------: | ------: | -----: |
| Balanced 10 min    |             53 → 64 |       4 → 5 |   0 → 5 |  0 → 0 |
| Balanced 45 min    |           245 → 260 |     15 → 31 |  2 → 27 |  0 → 2 |
| Weak–strong 45 min |           180 → 170 |      10 → 6 | 25 → 95 | 9 → 56 |
| Balanced 90 min    |           494 → 528 |     32 → 56 |  5 → 65 |  0 → 4 |

Reception outcomes are physical contacts, not a renamed completion counter. Balanced receivers
mostly retain control; the weak fixture has a substantially higher error share. Controlled CM
received passes become 0 → 5/10/32 after 10/45/90 minutes, matching actual teammate contacts
previously marked unclaimed. In final 90 minutes the CM has 141 touches and 44 completed passes.
The actual left-back fixture has 16 touches, five completed and seven received passes, all seven
intended physical receptions; eight pass/contact outcomes include one intended failed delivery.
The weak striker has no received-pass contacts and no meaningful decision in this seed, so its
zero is an observed lack of opportunities. Large role/league samples remain future calibration.

| Serial timing               |         PR148 s |         PR149 s | PR149 canonical speed |
| --------------------------- | --------------: | --------------: | --------------------: |
| Balanced 10 min, two runs   | 11.323 / 12.562 | 13.365 / 12.641 |         44.9× / 47.5× |
| Balanced 45 min             |          55.445 |          50.023 |                 54.0× |
| Weak–strong 45 min          |          41.833 |          33.593 |                 80.4× |
| Balanced 90 min             |         104.541 |         109.350 |                 49.4× |
| Balanced 10 min with replay |               — |          12.893 |                 46.5× |

The two short-run means are 11.942 → 13.003 s (+8.9%); long 90-minute cost is +4.6%.
Single-run 45-minute decreases and replay overhead within short-run noise are not optimization
claims. Timing includes the engine/accounting/agency observer, excludes export/hash/storage
estimation, and remains sensitive to warm-up and GC. The baseline first half ends at 45.145 min
after a committed incident; final first halves end at 45.000. Final full time is 90.0075 min
after committed incident completion. All are actual canonical period boundaries.

The separate PR146 observer-mode harness (`pr146-performance:balanced:a`, ten minutes) gives
release-minimal 12.509 s / 48.0×, normal 12.481 s / 48.1× and DEV 13.440 s / 44.6×.
All canonical, player, statistics, major-event and RNG-evidence hashes are identical; late/early
cost ratios are 1.01, 1.04 and 0.95. Background renderer calls are zero in every timed run.
Normal observation keeps 61 context samples and zero debug frames, rather than full DEV history.

Replay-enabled ten minutes exactly matches both no-replay canonical/state statistics hashes:
state `b39378bb1f42c164f8b062648be0ddd59fefe25d2101eff384ddc96f3409b19d`, statistics
`eaf08da77f64dc0bea510ff109e5864ecafcf3e4dce0effbf2ed66060d9691c4`.
Its recorder retains 61 rolling samples, two card windows and 151 distinct samples,
2,124,472 estimated serialized UTF-16 bytes (2.03 MiB). Storage is explicitly capped at
64 rolling samples plus eight windows of ≤50 samples. This estimate is not JavaScript heap
usage or a measured peak. Final 90-minute raw process heap/RSS deltas are +130.74/+220.92 MiB;
the older long baseline does not contain comparable memory measurements. GC-sensitive process
deltas do not establish retained replay cost or a leak.

All 13 final accounting invariants pass: completed≤attempts, on-target≤shots, received=completed,
aggregate network totals, goal feed=score, yellow/red feed=discipline, historic team membership,
team/player pass and shot totals, canonical possession sums and nonnegative restart counts.

`npm run verify` passed on the integrated source: ESLint, 129 main test files / 885 tests,
one full-career file / 5 tests, generated-world validation, TypeScript build and Vite production
build (Node 24.19.0, `VITEST_MAX_WORKERS=2`). The production build retains existing chunk-size
and mixed static/dynamic career-storage import warnings. There are no new dependencies.
Focused regressions cover physical clean/directional/heavy/failed control; unchanged cadence;
carry/recovery origin and directional ball continuity; actual/queued receive accounting;
physical goals, discipline, dismissed-player totals; feed/replay isolation, retention/gaps;
labels/animation; hidden publication; and session/DEV resets during replay and decisions.
Replay callbacks are synchronously invalidated on reset, preventing an already queued old
callback from restoring a historical clock/image before React cleans up its effect.
The final run after this guard passed with exit 0: main test duration 84.09 s and full-career
duration 49.35 s (890 tests overall).

The whole-field PR146 observer reference is now frozen to PR149's intentional physical
trajectory and actual-receiver accounting. Both 2,400-tick seeds were independently repeated
before updating hashes; the full-output assertion, schemas and invariants remain intact,
and prior PR148 hashes remain in the test comments.

Before the interruption, P0–P8 implementation, baseline and targeted verification were present.
The resumed work completed the reset lifecycle regressions, directional-contact continuity,
explicit clean/heavy throw regressions, telemetry-reference refresh and full repository
verification, then finalized measurements, browser checks, documentation and publication.

### Browser smoke and playtest limits

Local Vite/IAB automation used the actual generated world and unchanged canonical engine.
Normal `pr149-browser-balanced` play showed readable pass/control labels and preparation poses.
Switching to key-player viewing then advanced a complete first half with the pitch hidden:
45:00, score 0–0, four yellows/five fouls, 188/224 attempts and 134/176 completions. The permanent
panel and replay buttons remained available. Card playback from 36:51 showed recorded shielding
and geometry while Match Centre retained 45:00 and all current counters.

Controlled CM Jan Sikora (69 OVR), `pr149-browser-cm`, limited match moments retained a real
goal at 01:18 and a straight red at 00:51, including the dismissed player's name. At the 12:47
human boundary, goal replay showed 01:12 geometry while the live panel kept 12:47 and score 0–1.
Reset during paused replay cleared facts/choices and returned both clocks to 00:00. This browser
check also found the queued-callback clock race; its narrow guard has a deterministic regression.

Left-back Tomasz Lis (73 OVR), `pr149-browser-lb`, showed two received passes and three contacts
at 01:23. A real pitch target and `Podaj do nogi` selection advanced to four contacts, one of two
completed passes and the corresponding team totals. Winger Tomasz Król (66 OVR),
`pr149-browser-winger`, reached 13:10 with 12 contacts, one received pass, three of four completed
passes and three interceptions, with extended match events and score 1–1. A 38 OVR winger,
Adam Baran of Ślęza Wrocław, was also probed against Górnik Brzeziny. All five watch-policy
selectors were exercised. These short probes do not establish winger pressure/error frequencies;
controlled pressure/recovery tests and weak–strong fixtures provide the mechanical evidence.

Screenshots: [hidden full-match overview](performance/PR149-hidden-centre.jpg),
[recorded card/preparation](performance/PR149-event-replay.jpg),
[recorded goal with live Match Centre](performance/PR149-goal-replay.jpg).
Browser console errors/warnings were absent. Extended human playtesting remains deferred.

### Reproduction

From the repository with Node 24 and installed locked dependencies:

```sh
npm run verify
npm run benchmark:readability -- --minutes=10 --repeats=2 --revision=PR149 --output=work/normal10.json
npm run benchmark:readability -- --minutes=45 --scenarios=balanced-balanced,weak-strong --revision=PR149 --output=work/45.json
npm run benchmark:readability -- --minutes=90 --revision=PR149 --output=work/90.json
npm run benchmark:readability -- --minutes=10 --replay=true --revision=PR149 --output=work/replay10.json
npm run benchmark:readability -- --minutes=10 --position=left_back --revision=PR149 --output=work/lb10.json
npm run benchmark:performance -- --minutes=10 --modes=release_minimal,normal,dev --seed=pr146-performance:balanced:a
```

For PR148 comparison, add `--engine-root=/absolute/path/to/clean/pr148` to the readability
observer command. Keep seeds/default fixture and sequential timing; do not render or run tests
during timed measurements. The supported role probe accepts CM, left-back and striker only;
an unsupported winger fixture is rejected rather than silently substituted.

## Known limitations and deferred work

- The seed matrix is calibration evidence, not a representative league distribution.
- Animation remains lightweight parametric poses. No final art, tunnel or stadium work.
- Eight recent important replay windows are retained; evicted footage cannot be reconstructed.
- Sampled replay does not capture every 25 ms contact pose or final cinematic goalkeeper motion.
- Initial legacy kickoff ownership can lack a preparation object until the first acquisition;
  the ordinary reception path is explicitly covered by the new preparation tests.
- Old serialized tactical snapshots do not retroactively gain a complete event history.
- No substitutions, injuries, VAR, stamina or referee/weather model is introduced.
- Extended manual playtesting and league-scale reception/role calibration remain valuable.

## Recommended PR150

Keep PR150 primarily focused on stamina and physical persistence: workload/fitness/recovery,
canonical fatigue effects and career integration, with deterministic calibration. It should
reuse the explicit reception, preparation, event and statistics evidence introduced here.
Richer replay direction, additional animation polish, stable seeded stadium archetypes and
longer league/playtest samples are separate later work.
