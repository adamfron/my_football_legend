# PR152 canonical accounting and restart audit

The expanded follow-up supersedes the earlier control/intervention episode and discipline
scope below: incidental contacts without control do not start canonical possession episodes,
loss causes survive distinct restart awards, and active player minutes define agency rates.
Current contracts and calibration evidence:
[PR152_STATISTICS_DISCIPLINE.md](PR152_STATISTICS_DISCIPLINE.md).

## Statistical meanings

`touches` means continuous individual control/contact episodes. Receiving, controlling,
carrying repeatedly, shielding and releasing within the same possession counts once.
A release or uncontrolled ball closes that episode; reclaiming it starts another one.
First-time reception plus shot/pass share one episode and one physical contact identity.
`carries` counts executed carry intents, so multiple carries may legitimately exceed the
number of episodes. Presentation windows and human prompts do not supply these statistics.

`passesReceived` records physically completed teammate passes, using the actual receiver
and realized passing-network edge. Failed/heavy receptions can produce contact episodes
without pass completion. The public invariant requires received passes not to exceed
episodes; it does not equate shots, carries and pass attempts with episode totals.

| Field                 | Canonical source                                                                                      | Exclusions                                                            |
| --------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `tacklesAttempted`    | Exactly-once accepted defensive challenge identity, including a pending physical commitment           | Claims, interceptions, shot blocks and aerial contacts                |
| `tacklesWon`          | Exactly-once `clean_win` challenge result credited to its actor                                       | Labels on possession changes and whichever player owns the ball later |
| `interceptions`       | Opponent delivery acquired through an interception possession-change fact                             | Same-team reception and uncontrolled second-ball claim                |
| `possessionWon`       | A live team possession change credited to its recorded winner                                         | Same-team claims and restart placement                                |
| `possessionLost`      | The previous controlled owner recorded on a team possession change                                    | No invented individual loser during an unowned flight                 |
| `looseBallRecoveries` | Source-recorded acquisition of an uncontrolled ball; includes own-team second balls and keeper claims | Settled ownership, pass receptions and restart placement              |
| `blocks`              | Defender body contact with a canonical shot                                                           | Tackle attempts and keeper saves                                      |
| `duelsWon`            | Clean challenge win or a source-identified aerial win contested by an opponent                        | Uncontested recovery/reception                                        |

Accepted intent and resolved result have separate identity histories. This both counts a
pending attempt honestly and makes copied/revisited results idempotent. A result can no
longer award a teammate a tackle merely because the real challenger released the ball
before the end-of-tick observer ran. `lastPossessionChange` therefore retains winner,
controlled loser (when one existed) and linked challenge identity; first-time opponent
strikes also record the team change before release. `lastBallRecovery` preserves a
recovery through an immediate subsequent action. Old schemas accept absent new evidence;
legacy possession keys are preserved, and existing last challenge evidence seeds the
new identity histories on resume without replaying already counted results.
Absent legacy team totals stay optional through schema parsing, then are rebuilt once
from their existing restart/possession ledgers. Goal-kick totals include both ordinary
`goal_kick` and short `gk_short` setups. Recorded new totals are used directly thereafter.

Possession time includes a team's live spell and legally released restart deliveries.
The old `scenario === open_play` gate omitted goal-kick/throw-in/free-kick flight while
the restart delivery context remained active. PR152 credits `restart.phase === release`
as live time too, while excluding setup, halftime, terminal states and the scored-goal
completion pause. Actual canonical release/physics fixtures cover these intervals and
copied-state idempotence. This changes statistical observation only; it does not change
football actions, physical trajectories or RNG consumption.

`assertMatchStatisticsInvariants` validates passing-network attempts/completions/receptions,
received passes versus episodes, shots/on-target/goals, interceptions versus possession
wins, and successful tackles versus accepted attempts. No display clamp repairs a source
counter. `pr152Statistics.test.ts` exercises acquisition attribution after a same-tick
owner change, copied result histories, separate defensive categories, legacy resume,
restart awards, recovery then shot, interception then repeated carries/pass, and a
first-time reception/pass. Existing contact tests cover first-time shots and full
receive/carry/shield/pass continuity.

## Discipline and boundary causal audit

The canonical chain is `chooseNpcDefensiveChallengeAction` /
`beginDefensiveChallenge` → `resolveDefensiveChallenge` →
`applyChallengeInfringement` / `classifyChallengeFoul` → `showCard` /
`awardFoulRestart`. Context determines standing/committed/slide/tactical intent;
physical ball/opponent contact, rear approach, lateness, relative speed, deterministic
execution error and force determine the outcome. The penalty rectangle is relative to
the defending team. Force/lateness/DOGSO/promising-attack context determines cards.
Advantages keep the original foul identity and defer cards until a stoppage; penalty
awards retain their foul identity. No new foul/card/penalty quota or probability retuning
is introduced.

PR151's cooperative press can recruit a second body after the primary pair is locked.
It remains subject to coverage checks, the same challenge resolver and persistent pair
episode locks. This increases physical opportunities relative to a previously passive
shield, so discipline rates must be interpreted together with attempted challenges and
intent mix. The old controlled-player-only routine safety branch was asymmetric. All
autonomous standing pokes now withdraw on physically unsafe rear/unreachable/fast/late
context; committed NPC and explicitly selected human challenges keep their risk.
Withdrawal does **not** inspect the sampled accidental-mistiming outcome: a genuine
execution error can still foul, and the existing low-risk accidental-foul regression
continues to pass. Human agency policy is enforced at action/step boundaries, outside
the identity-neutral physical resolver.

The paired LB seed `a`, 45-minute diagnostic observes canonical facts through read-only
wrappers and reproduces all four stored state/statistics/timeline/football hashes.
Accepted-attempt and foul coverage matches the canonical counters exactly:

| Evidence | Main | PR152 |
| --- | --- | --- |
| Accepted attempts | 35 | 79 |
| Committed/slide/tactical intents | 9 | 26 |
| Fouls | 7 | 20 |
| Fouls: controlled / teammate / opponent | 0 / 3 / 4 | 4 / 9 / 7 |
| Fouls divided by risky intents | 77.8% | 76.9% |
| Penalties | 2 | 2 |

Every foul is autonomous committed/slide contact; none is standing or DEV-selected.
All seven baseline and 19/20 new fouls occur beyond the technique's ball-reach limit,
and none is ball-first. The remaining new foul has other failed contact context.
All penalties belong to teammate NPC committed challenges, not the controlled actor.
This is consistent with increased risky-contact exposure after the changed autonomous
trajectory, rather than duplicated standing-proximity fouls or fabricated statistical
counts. It also exposes a remaining committed/slide selection and timing calibration
problem in both revisions. The fixture does not isolate PR151's cooperative press or
establish a league-wide rate; do not lower a foul probability from this one seed.
Exact context/counter evidence is retained in
[PR152-discipline-diagnostic.json](performance/PR152-discipline-diagnostic.json), linked
from [PR152-summary.json](performance/PR152-summary.json).

Boundary awards use the first directed segment crossing in `findPitchBoundaryCrossing`
and `matchSimulation.applyBoundaryRestart`, with last-touch team evidence determining
throw-in/corner/goal-kick ownership. This is physical crossing evidence, not an arbitrary
restart lottery. Throw-ins keep their no-second-touch restriction until another real
contact. Canonical restart identity counters record awards exactly once, including
goal kicks, penalties and kickoffs. Team possession-change counters exclude dead-ball
ownership assignment. High rate distributions remain calibration signals; this source
audit does not establish real-world frequency targets from a single seed.

## Hard reset entry points retained for PR153

The position reset is `restartScenarios.applyRestartScenario`: it calls
`restartGeometry.deriveRestartGeometry`, places the ball with the selected taker, then
sets every player's `position`, `target` and `idealTarget` to the restart geometry and
zeros velocity. Geometry is instantaneous canonical setup, not simulated travel.
Relevant callers are:

- `matchSimulation.applyBoundaryRestart` for throw-ins/corners/goal kicks;
- `matchSimulation.finishShotContact` for an out-of-play shot's goal kick;
- the `goalCompletionUntil` branch in `stepTacticalMatchCore` for kickoff after a goal;
- `matchRules.awardFoulRestart` for penalties/free kicks;
- `offside.awardOffsideRestart` for the indirect free-kick setup;
- `matchRules.advanceMatchRules` when a dismissal removes a restart taker;
- `matchSimulation.startSecondHalf` for the second-half kickoff;
- explicit scenario/dev setup calls to `applyRestartScenario`.

A scored goal currently retains a short 0.55-second completion interval before the
kickoff reset. Initial match creation places formation bodies, rather than simulating
their entry. These transitions are unchanged by PR152.

Recommended next scope: **PR153 — Dead Ball & Restart Continuity**: physical
repositioning, goal-reaction state, score/time-sensitive celebration versus urgent
restart, ball retrieval after a late comeback goal, restart readiness and the foundation
for stoppage-time accounting. This PR does not implement those presentation/lifecycle
features.
