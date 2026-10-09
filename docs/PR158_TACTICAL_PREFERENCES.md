# PR158 tactical preferences

The canonical engine accepts an optional `MatchTeamState.tacticalPreferences` vector.
The Zod schema requires six finite values in `[0, 1]`. Omitting the whole vector maps
the existing team style to the defaults below; formation, duties and legacy width/freedom
remain compatible. The vector changes tactical ranking and destinations, never a contact,
passing, tackling, shooting or goalkeeper success probability.

| Axis                 | Concrete effect                                                                         |
| -------------------- | --------------------------------------------------------------------------------------- |
| `blockHeight`        | Preferred defensive line advance and access to an organised engagement.                 |
| `organisedPress`     | Willingness to exploit local pressing triggers; it does not override safe outlets.      |
| `counterpress`       | Weight of the separate, decaying opportunity following a canonical possession loss.     |
| `compactness`        | Defensive width/depth compression, independently of the line's advance.                 |
| `possessionPatience` | Value of a purposeful scan/safe circulation, support distance and decision preparation. |
| `verticality`        | Value of direct/through releases and forward running, independently of pressing.        |

| Existing style    | Height | Organised | Counterpress | Compact | Patience | Vertical |
| ----------------- | -----: | --------: | -----------: | ------: | -------: | -------: |
| balanced          |    .50 |       .50 |          .50 |     .50 |      .50 |      .50 |
| possession        |    .58 |       .58 |          .62 |     .70 |      .85 |      .32 |
| direct            |    .54 |       .45 |          .48 |     .36 |      .25 |      .85 |
| counter_attacking |    .32 |       .28 |          .25 |     .80 |      .35 |      .90 |
| pressing          |    .72 |       .92 |          .90 |     .82 |      .40 |      .70 |

The organised and counterpress axes are deliberately independent. A team can favour an
advanced organised press while retaining a moderate loss reaction, or a selective middle
block with an intense immediate reaction. Compactness does not require a low line, and
vertical possession does not require a high press. The five evidence profiles in
`scripts/pr158TacticalProfiles.ts` exercise these combinations explicitly.

`deriveTacticalSuitability` exposes continuous central-circulation, channel-transition,
pressing-capacity and recovery-cover measurements from the actual eligible XI. It also
exposes the preferred press's capability cost and the preferred line's risk. Effective
preferences modestly adjust pressing commitment/line advance for weak recovery abilities,
and patience/verticality for the relative central-versus-channel capabilities. There are
no attribute eligibility thresholds, role touch quotas, age gates or depleted stamina.

`derivePressingOpportunity` examines bounded nearby outlets and their current receiving
orientation/first-touch readiness, passing corridors, defensive cover, local support,
the touchline, body orientation and heavy ball exposure. Containment can preserve a lane
instead of sending a lone forward into easy centre-back circulation. Existing dangerous
receiver handoffs and local cover still protect a real attack behind the presser.

The transition opportunity follows the canonical loss/change time, rather than the
engine's shorter phase label. Its time component is `exp(-elapsed / 6)` multiplied by
current isolation/numerical opportunity. Reorganised opponents can close the useful
window early; an isolated opponent can remain vulnerable after eight seconds. The six
observational windows are measured separately and never cancel a tactical action.

Economical movement ranks proposed routes using distance, reorientation, current speed,
agility and fixed stamina capability. Press assignment also recognises defensive reading.
A short effective screening destination can therefore compete with unnecessary pursuit.
This is a tactical cost, not current energy exhaustion. A future coach profile can own
this same vector; the existing canonical `CoachProfile.tacticalStyle` continues to map
through the table. PR158 does not expand the coach database or implement a management
career or tactical learning system.

Carry ranking consults the same next-contact window and defender-to-ball access used by
physics. A defender arriving before the next difficult carrier contact reduces the
action's expected value according to exposed/protected geometry. Technique-related timing,
actual turning difficulty and useful escape space remain continuous; there is no carry
quota, compulsory pass or guaranteed skill outcome.

## Reproduction and interpretation

`benchmarkPr158Tactics.ts` compares five explicit vectors across seven squad families,
three paired deterministic seeds, and 600 canonical seconds per row. The families cover
balanced players, fast wings, strong central passers, pressing athletes, slow defensive
cover, a gifted low-stamina playmaker and a stronger-versus-weaker opponent. It exports
actual passing/carrying/defensive/workload statistics plus bounded transition clocks and
one-second tactical samples. Samples are not event-provider pressure events. Mode labels
classify a preference/opportunity; a strong counterpress preference can briefly retain that
label with zero engagement when safe outlets require screening. Actual defensive plans
and independently measured physical pressure clocks remain separate. Baseline
PR157 accepts the attached optional vector as inert fixture data and uses the documented
legacy style fallback. Both revisions are observed with the identical pure diagnostic
code; the baseline's two pressing fallbacks can consequently have identical football.

`benchmarkPr158TacticalScenarios.ts` runs 105 bounded scenario/profile/seed combinations
for 12 seconds each: safe CB circulation, isolated pursuit, covered heavy touch,
coordinated pressure, early/late counterpress and a reorganised opponent. Initial
turnover geometry is explicitly configured; subsequent outcomes use the canonical engine
and are measured without guaranteeing recovery. Synthetic configured losses are not
claimed as naturally observed events. Both tools preserve source fingerprints and
validate machine-readable results. Concurrent timings are not performance evidence.
The compact `docs/performance/PR158-tactics-summary.json` retains all 35 squad/profile
cells and all 35 bounded scenario/profile cells, rather than collapsing different squads
into a single claimed winner. Home-team football totals, both-team workload totals,
initial bounded plans, and observed physical transition clocks have separate definitions.

The 600-second matrix checkpoints each complete row with an atomic file replacement.
`--resume` requires the same duration, revision, engine path, seeds, exact profile vectors,
canonical source fingerprint and observer fingerprint. It rejects duplicate, unexpected
or unfinished rows before continuing. A changed engine therefore requires a fresh after
matrix; partial runs from an earlier implementation are retained only as prototype evidence.

```powershell
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr158Tactics.ts --engine-root=../baseline --revision=PR157 --out=docs/performance/PR158-tactics-before.json
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr158Tactics.ts --out=docs/performance/PR158-tactics-after.json
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr158Tactics.ts --resume --out=docs/performance/PR158-tactics-after.json
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr158TacticalScenarios.ts --engine-root=../baseline --revision=PR157 --out=docs/performance/PR158-tactical-scenarios-before.json
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr158TacticalScenarios.ts --out=docs/performance/PR158-tactical-scenarios-after.json
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/summarizePr158Tactics.ts
```
