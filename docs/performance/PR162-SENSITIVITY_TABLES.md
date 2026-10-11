# PR162 ability, duty and actual-squad evidence

Source: `86673d5fe3752efc6008cbd56b4e9ed048faafda`. All windows run through canonical physics. Zero recorded outcomes and unknown mechanisms remain distinct.

## Ability sensitivity, mirrored ten-minute windows

| Anchor/opponent attributes | Passes | Completion % | Progressive completions | Box entries | Shots | Tackle wins | Distance m |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 50-50 | 82.50/88.50 | 81.23/73.43 | 14.50/12.00 | 0.00/0.00 | 0.00/0.00 | 3.00/6.00 | 9949.29/9879.18 |
| 60-50 | 176.50/42.50 | 95.23/69.43 | 41.00/6.00 | 0.00/0.00 | 0.00/0.00 | 2.50/2.50 | 10539.39/9393.28 |
| 70-50 | 150.00/64.00 | 93.92/78.33 | 39.00/10.50 | 2.00/0.00 | 0.50/0.00 | 3.00/2.00 | 11194.88/9644.64 |
| 80-60 | 162.00/108.00 | 95.79/89.56 | 46.50/27.00 | 0.00/0.00 | 0.00/0.00 | 2.50/2.50 | 11584.02/10288.10 |
| 50-70 | 43.00/213.00 | 69.40/95.62 | 7.00/61.50 | 0.00/0.50 | 0.00/0.00 | 1.00/4.00 | 9188.81/11260.99 |

The separate full 70/50 experiment completes 2/2 matches: anchor W/D/L 1/1/0, shots 2.00/0.00. This is one mirrored seed, not a quality ranking.

## Native duties versus all-support duties, ten-minute windows

| Duties | Opponent formation | Anchor/opponent progressive completions | Box entries | Shots | Forward line gap m |
| --- | --- | --- | --- | --- | --- |
| native | 4-3-3 | 20.50/13.50 | 0.50/0.00 | 0.00/0.00 | 9.86/10.46 |
| native | 3-5-2 | 12.50/29.00 | 0.00/0.00 | 0.00/0.00 | 9.00/8.31 |
| all support | 4-3-3 | 17.00/11.00 | 0.50/0.00 | 0.00/0.00 | 9.16/9.00 |
| all support | 3-5-2 | 10.50/25.50 | 0.00/0.00 | 0.00/0.00 | 7.51/8.98 |

Duty changes alter trajectories and passing, but these short windows cannot attribute a full-match advantage or solve shot creation.

## Three distinct native squad ratings

| Club | Stored club rating | Selected XI | Whole-squad primary OVR | Formation | XI condition | Bench count/condition |
| --- | --- | --- | --- | --- | --- | --- |
| Błękitni Port | 78 | 79 | 75.79 | 4-3-3 | 89.82 | 9/89.89 |
| Górnik Brzeziny | 71 | 72 | 68.50 | 4-4-2 | 90.18 | 9/88.67 |

The current sandbox displays selected-XI strength as OVR XI and the whole-squad primary-position average as OVR kadr. Thus 79/72 and 75.79/68.50 are different projections. Native coach formation/style defaults are recorded; no extra individual-manager personality is claimed.

## Effective role quality in the selected XI

| Club | Role | Count | Effective OVR | Condition |
| --- | --- | --- | --- | --- |
| Błękitni Port | goalkeeper | 1 | 80.00 | 78.00 |
| Błękitni Port | fullback | 2 | 80.00 | 90.00 |
| Błękitni Port | centre_back | 2 | 79.00 | 91.50 |
| Błękitni Port | midfield | 3 | 77.33 | 92.67 |
| Błękitni Port | winger | 2 | 79.50 | 87.00 |
| Błękitni Port | striker | 1 | 78.00 | 95.00 |
| Górnik Brzeziny | goalkeeper | 1 | 71.00 | 95.00 |
| Górnik Brzeziny | fullback | 2 | 73.00 | 86.50 |
| Górnik Brzeziny | centre_back | 2 | 71.50 | 90.00 |
| Górnik Brzeziny | midfield | 2 | 71.00 | 98.00 |
| Górnik Brzeziny | winger | 2 | 73.00 | 88.00 |
| Górnik Brzeziny | striker | 2 | 72.50 | 86.00 |

Every role attribute mean is retained in PR162-club-profiles.json. Exact XI/bench identities, full profiles and tactics remain in the complete local club archive.

## Requested shot, endogenous save and same-attack follow-up

| Source | Requested initial shots | First-shot saves | First-shot parries | Same-attack follow-up shots | Mean save-to-follow-up seconds |
| --- | --- | --- | --- | --- | --- |
| 4d61ee8 | 12 | 5 | 4 | 2 | 5.00 |
| e652c31 | 12 | 5 | 4 | 2 | 4.24 |

Twelve conditions share three seeds, two distances and two shot techniques. The potential rebound attacker is onside at the first shot in every condition. A legal initial shot is requested through the canonical resolver; this is not evidence of initial AI shot selection. All outcomes and subsequent NPC decisions are endogenous. The observer closes same-attack eligibility on opposing control or a stoppage, so later shots after a new attack do not count as follow-ups. Counts and latency are descriptive: a repeated save changes subsequent possession geometry, so shorter waiting does not imply more shots. Full frozen states and contacts remain in the local PR162-rebounds.json.gz archive.

## Observer and performance limits

Both mirrored full matches have identical complete initial/final canonical hashes with the observer enabled and disabled (2/2); six short alternating timing pairs also preserve complete state. Observer overhead median +2.40% and engine step-cost change median +3.09% have broad mean 95% intervals (−9.76% to +12.70% and −8.94% to +12.87%). This small headless sample establishes neither a precise slowdown nor renderer FPS.
