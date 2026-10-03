# PR148 defensive realism and cadence calibration

`npm run benchmark:discipline-calibration -- --minutes=45 --seeds=a,b,c`
runs the canonical 0.025-second engine with three deterministic fixture families:

- `balanced-balanced`: existing canonical benchmark clubs 0 and 1; controlled central midfielder.
- `weak-strong`: canonical clubs 63 and 0; controlled weak-side striker.
- `aggressive-defenders`: clubs 0 and 1, away outfield aggression 95 and composure 35;
  controlled home left back. This changes component attributes in a copied session,
  without changing the canonical world database or introducing a match quota.

`--scenarios=balanced-balanced --minutes=90 --position=central_midfielder` selects a
full-match agency fixture. `--position=left_back` or `--position=striker` selects another
controlled role when present in the XI. Every match records its actual controlled role,
configuration hash, seed, requested/reached duration and terminal state. Abandonment
preserves the score and time reached, and the runner stops immediately.

`--output=path.json` saves progress after each fixture. Fixture failures are exported with
their seed/error and make the command exit nonzero; completed cases are retained. Failed
cases are excluded from statistical distributions rather than being invented as completed
matches. In particular, the pristine PR147 aggressive fixtures expose the free-kick wall
crash after mass dismissals. This is recorded alongside valid baseline results.

The input policy is deterministic explicit DEV selection at the exact human opportunity
tick. It estimates the number of meaningful prompts under that input policy; it does not
measure a human's thinking time. The same engine handles all observation policies, and
the existing A–D performance comparison asserts identical canonical hashes/inputs.

Raw counts are retained for every match and every player. Per-90 projections use actual
match duration or the player's actual minutes, including minutes frozen on dismissal;
they are labelled projections and never replace raw statistics. Movement is exported in
metres. `possessionChanges` counts canonical team-possession facts; per-player change
counts attribute the transition to the player gaining control, when there is an owner.

Metrics include defensive episodes/outcomes, fouls/cards, advantage, penalties, intent
types, passes, touches, carries, interceptions, possession changes, shots, goals,
distance and sprint episodes. Passing-network summaries expose the most frequent
directed link, most frequent two-player pair and that pair's share of all passes.
Agency exports include meaningful decisions by kind and all candidate reasons, alongside
routine/single-option delegation counts. Reasons include delegated candidates as well
as surfaced prompts, so they must not all be interpreted as human interruptions.
Optional observer fields retain controlled/player possession seconds and actual tactical
foul counts separately from tactical challenge intents. Archived reports omit these
fields when they were not measured; missing values are never fabricated as zeros.

Distributions retain sample count, minimum, p25, median, p75, maximum and mean for raw
match totals, per-90 match rates, raw player values and outfield per-90 values, including
separate fixture-family summaries. Quantiles use the existing nearest-rank helper.
Several short fixtures are a sanity sample, not league-wide empirical calibration.

The harness hashes the entire final canonical state/statistics and streams the actual
canonical action-event sequence. It hashes only changed event evidence during play,
does not retain historical frames, renders no pitch and reports
`rendererCallsBackground == 0`. Full-state hashes and file exports are outside measured
simulation work. Batch boundaries and wall clocks cannot alter football input or RNG.

Throughput comparisons use separate serial `benchmark:performance` runs in `normal`
mode, with the same seed, squads, controlled role, batch size, duration and profiling
setting before/after. Multi-seed calibration timings recorded during other test work
are descriptive only. Headless speed excludes real interactive decisions, browser
rendering and browser scheduling; the four-to-six-minute player-facing goal remains a
separate playtest target.

Legacy background/flow/calibration runners also stop on abandonment and export actual
terminal time/reason. A requested 90-minute legacy match-flow run now explicitly starts
the second half instead of repeatedly observing the frozen halftime snapshot.
