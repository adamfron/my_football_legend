# Positioning benchmark reference

## Purpose

The benchmark is an observation layer, not a tactical controller. It projects canonical match
coordinates into deterministic aggregate and relational measurements. It neither mutates match
state nor consumes random numbers. Later offline tooling can map a tracking frame to the same
point/player interface; no external dataset or runtime API is required.

Reference envelopes are deliberately broad sanity ranges rather than laws. Team length around
31–46 m, width around 35–48 m, stretch index around 7–16 m, and hull area around 900 m² are useful
professional-football reference points, but phase, opponent and style can legitimately take a team
outside them. A single outlying measure is a prompt to inspect the sequence, never proof that the
football is wrong.

## Relational observations

- **Width:** phase and opponent matter. Even numerically normal width can be too narrow against an
  aggressive press.
- **Winger and fullback/wingback:** width should emerge from the pair. When the winger stays wide,
  the fullback can support inside or behind; when the winger moves inside, the fullback can provide
  width. Both should not independently be ordered onto the touchline.
- **Transition:** attackers need differentiated carrier, connector and depth-runner functions.
  Transition is not “move every attacker forward”.
- **Rest defence:** central/lateral coverage and players behind the ball are inspected together;
  different styles may legitimately retain three or four players.
- **Fatigue (future):** fatigue should affect recovery speed, synchronisation and the ability to
  close structural gaps, rather than directly injecting arbitrary tactical gaps. It is not part of
  PR110.

The context taxonomy covers settled build-up, middle/final-third possession, high/mid/low blocks,
both transitions, counterpresses, second balls, and common restart families. It identifies which
measurements deserve attention without defining one correct formation snapshot or fixed player
coordinates.
