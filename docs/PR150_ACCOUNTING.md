# PR150 — Public accounting and workload audit

## Public touches and internal evidence

A public **touch** is one continuous possession/control episode. A meaningful reception,
interception, loose-ball claim, attempted control, deliberate block or first-time action starts
an episode. Carry samples, shielding, turning, further dribble contacts and the eventual pass
or shot remain part of that episode. Release, ownership loss, dead-ball setup and a period/match
boundary close it. A subsequent recovery starts another episode, including recovery by the same
player after a genuinely loose ball.

Consequently reception → carry → shield → pass produces one public touch. A first-time pass or
shot produces one touch, as does meaningful failed control. Mere restart placement and ordinary
ownership-maintenance ticks produce none. Public touches are used consistently by player match
statistics, team projections, player summaries and completed-match career summaries.

`contactEvidence.ts` retains separate exactly-once physical/action evidence: pass release and
reception, shot release, flight contact, acquisition, delivery release and executed carry
contact. These are **not** public touches. `observedContactIds` continues to protect low-level
event accounting; `activeControlEpisode` stores only the current player, start and latest contact
time. No additional growing episode history is introduced. A carry is a discrete executed
movement intention, while contact evidence can include the associated control contact.

The final accounting review found two contact-identity gaps. Repeated failed receptions at the
same point could disappear when a restart had cleared preparation. A copied failed-reception
snapshot could also reuse the old pass contact time for a genuine subsequent recovery, causing
deduplication to omit that new touch. Reception evidence now recognizes a newly resolved delivery
by canonical pass ID, resolution time and result, and requires its outcome/contact point to match
the current reception. Freshness uses those canonical values rather than object identity. A
regression covers repeated failed contacts, unchanged copies and a copied subsequent recovery.

## Passing network

PR149 deliberately placed attempts on the selected passer → intended-target edge and completions
on the passer → actual-receiver edge. Its documentation explicitly allowed completion-only
edges. That explains observed completed > attempted relationships; it is a mismatch between
two endpoint definitions, rather than evidence that the engine physically completed more
passes than it attempted.

PR150 uses one consistent **realized relationship** for completed network edges. At release,
the original attempt belongs to the intended target. When a different teammate physically
completes that pass, exactly that original attempt is moved to the actual receiver's edge, and
the completion is credited there. Failed/unclaimed attempts remain on their intended-target
edges. The original selection remains in the canonical diagnostic as `intendedReceiverId`,
separately from `actualReceiverId`; no extra pass attempt is invented. Empty edges are removed.

An own recovery is not a public pass to oneself. It retains physical contact evidence, without
creating a passing edge, pass attempt, pass completion or received-pass statistic. Spatial pass
execution selects a canonical runner at release, so unsuccessful/out-of-play passes still have
an attributable target. There is currently no separate no-target public pass category.

Hard invariants are validated by schemas and explicit benchmark/test checks:

- Every edge has 0 ≤ completed ≤ attempted and distinct passer/receiver IDs.
- Outgoing edge attempts and completions equal each player's public passing totals.
- Incoming edge completions equal each player's received-pass total.
- Completed passes have canonical physical contact evidence and a resolution time.
- Reception events do not create a second attempt or completion.
- Exactly-once identities preserve copied snapshots, retries, replay observation and branches.

Both statistics and flow telemetry observe the last resolved incoming pass and any newly
released outgoing pass. This preserves a first-time return/pass made within the same physics
step. Public statistics remain authoritative for live telemetry; snapshot-only legacy flow
fixtures use the same endpoint accounting.

## Other public counters

Team projections additionally expose received passes, public touches, carries and possession
won/lost. Player summaries include those possession counts, fouls, yellow/red cards and offsides.
Disciplinary counts come from canonical accumulated evidence and retain dismissed players.
Offside offences and restart awards use exactly-once canonical identities. Possession time
continues to include a team's live in-flight/loose-ball spell and excludes dead-ball setup and
halftime. No count is scaled down or injected to make a distribution appear plausible.

## Sprint telemetry audit

The existing movement integrator already accounts for every human-controlled and autonomous
player through the same physical speed classifier. There is no control-status or possession
branch bypassing workload accumulation. Public distance/sprint values are copied directly from
canonical locomotion telemetry.

Sprint classification uses actual speed divided by the athlete's maximum speed, with 0.82
entry, 0.70 exit, a 0.65-second sustained burst requirement and 1.2-second recovery hysteresis.
Short peaks can therefore produce a high maximum speed with little sprint distance and no
mature sprint burst. The suspicious controlled-player sample is consistent with ordinary
human movement/carry selecting jogging/running or slow technical execution, followed by only
brief high-speed peaks. The new explicit sprint intention must reach sustained sprint speed;
changing the statistics classifier solely to inflate that player's totals would misrepresent
physical workload. Movement-mode implementation and its regressions belong to the intent layer.

The benchmark checks that walk + jog + run + sprint distance equals total integrated distance.
Conditioning, injuries and substitution systems are deferred to PR151.

## Benchmark interpretation and limitations

`scripts/benchmarkPr150.ts` extends the established readability fixture policy and accepts an
earlier pristine checkout via `--engine-root`. It exports public player/team totals, controlled
touch/pass/received shares, sprint workload, network failures, actual opportunity resolutions,
decisions per 45/90 minutes and decisions per controlled touch. `--allow-known-failures=true`
records PR149's known edge failures without hiding them; final runs fail violated invariants.

The runner resolves meaningful opportunities using explicit deterministic DEV AI selections
at their canonical tick boundaries. Its prompt count is the number of those resolutions,
**not** a captured count of React menu renders or a human's chosen movement style. That input
policy supports reproducible before/after comparisons but cannot reproduce every manual
playtest's decisions, including prolonged deliberate carrying.

Presented episodes are an observational estimate: canonical moment candidates are sampled at
4 Hz and at every decision, clustered using the existing `appendMomentCandidate` semantics,
and filtered by the `key_player` policy. This does not execute UI lead-ins, visibility windows,
proxy decisions or episode aborts, so decisions per presented episode must be labelled with
that observation policy. Actual rendered playtests remain necessary for the final UX claims.

This harness does not import or invoke a renderer. Its background renderer-call count is zero
by construction; separate observer-mode and renderer-parity tests provide independent evidence.
Hashes are computed outside timing. Comparisons must use the same seed, role, team fixture,
step size and deterministic input policy; timing runs must be serial. Match-wide physical
outcomes may legitimately change after new reception, movement and passing semantics.

Final numeric evidence belongs to the integrated PR150 calibration report. Suspicious zero
throw-ins, offside rates, low shot volume, concentrated participation or workload samples must
remain visible in that report, with their fixture context. They are not corrected by artificial
restart or sprint quotas.
