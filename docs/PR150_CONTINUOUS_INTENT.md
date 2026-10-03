# PR150 — Continuous Ball Control, Intent-Based Play & Space Passing

## Architecture and implementation plan

The baseline is merged PR149 main `feed7f11ff7064f05d484d17592fab5b4695fa5d`.
PR147–149 rule, cadence, preparation, reception, statistics, presentation and replay
contracts were audited before implementation. The existing fixed 25 ms canonical engine
remains authoritative; React/Three observe it. No dependency or stamina system is added.

Four parallel owners implemented the coupled scope: accounting/touch episodes/network/
workload; human intent/reception/movement; spatial passing/execution/offside; and integration/
UI/restarts/benchmark verification. Shared state schemas have a single owner. Existing
passing cadence is preserved rather than globally slowed.

## Public football statistics

A public touch is one continuous meaningful ball-control/intervention episode, not a
physical contact count. Receive → carry → shield → pass and interception → carry → shot
each count once. Release, loss, another player's intervention or a restart ends that
episode. A failed reception or isolated deliberate intervention still counts. Carry
samples, micro footwork and ticks do not add touches. Internal contact evidence and carry
telemetry remain available. See [accounting audit](PR150_ACCOUNTING.md).

Every pass attempt is credited exactly once. Failed deliveries keep their intended edge;
if another teammate actually controls a completed pass, that original attempt moves to
the actual receiver's edge together with the completion. Diagnostics retain intended
and actual identities. Thus every edge satisfies `0 <= completed <= attempted`, no self
edge exists, and outgoing attempts/completions plus incoming completions reconcile with
public player/team totals. A reception never creates a second attempt.
Out-of-play deliveries close as failed/unclaimed at the canonical boundary time before
the restart; no boundary crossing is fabricated as a player's contact.

## Persistent football intent and receptions

`humanPossessionEpisode` now records a validated control/carry/sprint/dribble/retain intent,
target and canonical progress. It persists through ordinary preparation and micro actions.
Meaningful completion, blocked progress, possession instability, pressure/support or
shooting changes can reopen agency; a micro contact alone cannot. Progress observation
occurs after canonical advancement, so a paused UI cannot advance or rewrite the contract.
Retain can reopen for genuinely new short support under nearby pressure; minor free-space
lane oscillation does not. Selected incoming control completes only after preparation and
then offers an already credible settled chance without repeating routine control choices.

The optional `carry.movementMode` distinguishes balanced progression, fast larger touches,
technical opponent evasion and retention where destination is secondary. The target menu
offers modes according to distance/pressure; execution details come from context/attributes.
Existing NPC carry decisions retain their established calibration.

Reception quality records retained velocity. Bounded canonical continuation uses that
momentum, then rebases local preparation at the new position. Heavy/failed reception
remains a real loose-ball result, including legal touchline exits. Incoming-ball decisions
use reaction time and distinct football choices. Normal/directional control, first-time
pass and existing first-time shot/header options share a stable flight identity; a queued
routine control does not immediately trigger a redundant possession menu.

## Play into space and execution

`space_pass` expresses a pitch location. `spacePassing` performs bounded release-time
analysis of teammate motion/arrival, opponent motion/arrival, lane obstruction, keeper
reach and technical ability, then uses the existing physical pass pipeline. The UI exposes
“Zagraj tutaj”; it does not select a trick. Moving teammates can chase ground lead/through
balls, with lofted through balls for credible runs behind a high line and blocked lanes.

`passExecution` records the context-driven execution type on the canonical diagnostic,
ball provenance and action event: normal, weighted ground, ground/lofted through, chip,
driven, cross-field, backheel, outside/weak foot, first-time or turning pass. Ability,
pressure and orientation influence quality/error. Spatial error is not clipped back
inside the pitch, so out-of-play outcomes can arise naturally. These are seeded outcomes,
not timing/aim mastery or guaranteed exploit actions.

## Offside, restarts and presentation

Offside positions are frozen when the ball is played. Actual meaningful competition/
contact penalizes an attacker from that launch snapshot even if a defender subsequently
steps or the attacker returns onside. A passive offside position alone is insufficient.
Goal kicks, corners and throws retain their law exemptions. Offside awards an indirect
free kick, canonical offence/statistics, a permanent Match Centre entry and replayable
action evidence. Detailed passive obstruction/deliberate-play law edges remain simplified.
An actual first-time release after a goal kick/throw closes the original restart and captures
a fresh non-exempt offside phase. Direct shot/header attempts at an indirect restart are
rejected at canonical commit, even when supplied through DEV rather than the legal UI menu.

Advanced free kicks use near/central/far targets ahead of the ball, short and edge options,
recycle support and at least two rest defenders in a full side. Deterministic mirrored
templates preserve taker/wall/marker/keeper responsibility and work from the actual restart
location. A restart clears obsolete human movement/reception/preparation contracts.

Decision frames display bounded arrows from current observed velocity only. They never
read future AI targets; the controlled player's current motion is also named in Polish.
Foul actor text uses canonical event side to show the team, including historic/dismissed
players. Canonical execution evidence supplies concise special-pass/offside labels.

## Validation and evidence

Frozen-core verification passed ESLint, 937 main tests, 5 career tests, TypeScript and the production build. Final calibration, limitations and timing evidence are in [PR150_CALIBRATION.md](PR150_CALIBRATION.md), [PR150-results.json](performance/PR150-results.json) and [PR150-performance.json](performance/PR150-performance.json). All twelve matched final fixtures pass accounting; 10/90-minute replay comparisons and 10-minute A-D / 90-minute A-B observer comparisons preserve canonical hashes.
The compact matrix uses existing deterministic fixtures and explicit DEV choices at exact
canonical decision boundaries. This is reproducible simulation evidence, not a human
playtest, league distribution or an arbitrary decision-count quota.

## Limits and follow-up

Incoming control/pass/shot/header architecture is implemented; a dedicated dummy/leave,
exceptional-skill control and self-push action remain future extensions. Physical field
location and ball flight remain simplified; execution metadata is a foundation for richer
animation/commentary. Sampled replay retains PR149's explicit storage bounds and cannot
reconstruct evicted footage. Broad role/league calibration and extended human testing remain
valuable, with anomalous fixtures reported rather than hidden.

Recommended next scope: **PR151 — Fatigue, Injury Risk, Added Time & Substitution Intelligence**.
Its conditioning systems should consume the same canonical workload for human and NPC
players. Fatigue, injuries, substitution AI, added time, benches/coaches/referees are not
implemented here.
