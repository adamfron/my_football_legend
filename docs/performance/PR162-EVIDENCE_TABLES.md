# PR162 canonical evidence tables

Source: `86673d5fe3752efc6008cbd56b4e9ed048faafda`; engine SHA-256 `a8eced13412d200eba2d3aa570f96882422542d5e82526c8db25159adb4d3266`. Pilot 30/30 observed, 30 full-time matches. Baseline 24/24, 18 full-time. Clubs 6/6, 6 full-time.

Main matrix (including the unchanged pilot): 120/120 observed, 120 full-time. Formation tables below use this matrix.

All team means are per observed fixture. Capped baseline matches are censored and excluded from W/D/L and full-match seed-pair comparisons. Their partial football counts remain visible. Never compare them as full 90-minute outcomes. Mirrored orientations constitute one seed block.

## 1. Formation matrix, anchor 4-4-2

| Opponent | Full / observed | Anchor W/D/L | Anchor shots | Opponent shots | Paired shot Δ (95% exploratory) |
| --- | --- | --- | --- | --- | --- |
| 4-3-3 | 24/24 | 5/19/0 | 0.38 | 0.08 | 0.29 [0.08, 0.50] |
| 4-2-3-1 | 24/24 | 2/21/1 | 0.13 | 0.13 | 0.00 [-0.14, 0.14] |
| 4-4-2 | 24/24 | 1/17/6 | 0.08 | 0.46 | -0.38 [-0.61, -0.14] |
| 3-4-2-1 | 24/24 | 1/22/1 | 0.04 | 0.08 | -0.04 [-0.21, 0.12] |
| 3-5-2 | 24/24 | 1/22/1 | 0.08 | 0.04 | 0.04 [-0.05, 0.13] |

## 2. Attacking funnel, opponent formation

| Formation | Controlled | Advance ≥10m | Sustained final third | Controlled final entries | Controlled box entries | Credible possessions | Shots |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 4-3-3 | 121.17 | 56.63 | 9.29 | 15.00 | 0.63 | 0.21 | 0.08 |
| 4-2-3-1 | 100.71 | 36.79 | 5.46 | 8.29 | 0.38 | 0.21 | 0.13 |
| 4-4-2 | 109.46 | 36.17 | 10.67 | 13.50 | 0.96 | 0.46 | 0.46 |
| 3-4-2-1 | 88.79 | 17.75 | 2.25 | 2.92 | 0.13 | 0.08 | 0.08 |
| 3-5-2 | 104.25 | 24.08 | 3.71 | 4.96 | 0.33 | 0.13 | 0.04 |

## 3. Forward distance to the live offside line

| Formation | Mean gap while team possesses (m) | Anchor gap (m) |
| --- | --- | --- |
| 4-3-3 | 10.05 | 10.21 |
| 4-2-3-1 | 9.58 | 9.44 |
| 4-4-2 | 10.09 | 10.21 |
| 3-4-2-1 | 8.33 | 8.09 |
| 3-5-2 | 9.12 | 8.38 |

Gap is measured every 10 seconds for actual striker bodies, in attacking-direction coordinates. It is neither a tactical target nor a successful run-behind count.

## 4. Completed role passing networks

| Formation | Completed role edge | Contacts (all fixtures) |
| --- | --- | --- |
| 4-3-3 | centre_back>fullback | 4713.00 |
| 4-3-3 | fullback>centre_back | 3179.00 |
| 4-3-3 | centre_back>centre_back | 1836.00 |
| 4-3-3 | fullback>winger | 1160.00 |
| 4-3-3 | midfield>fullback | 1065.00 |
| 4-3-3 | midfield>centre_back | 754.00 |
| 4-3-3 | winger>fullback | 735.00 |
| 4-3-3 | fullback>midfield | 647.00 |
| 4-2-3-1 | centre_back>fullback | 4006.00 |
| 4-2-3-1 | fullback>centre_back | 2652.00 |
| 4-2-3-1 | centre_back>centre_back | 1758.00 |
| 4-2-3-1 | midfield>fullback | 1109.00 |
| 4-2-3-1 | fullback>winger | 909.00 |
| 4-2-3-1 | winger>centre_back | 637.00 |
| 4-2-3-1 | winger>fullback | 549.00 |
| 4-2-3-1 | fullback>midfield | 543.00 |
| 4-4-2 | centre_back>fullback | 4667.00 |
| 4-4-2 | fullback>centre_back | 3008.00 |
| 4-4-2 | centre_back>centre_back | 2139.00 |
| 4-4-2 | fullback>winger | 1410.00 |
| 4-4-2 | winger>centre_back | 961.00 |
| 4-4-2 | winger>fullback | 705.00 |
| 4-4-2 | midfield>fullback | 505.00 |
| 4-4-2 | midfield>centre_back | 417.00 |
| 3-4-2-1 | centre_back>centre_back | 7426.00 |
| 3-4-2-1 | centre_back>fullback | 3369.00 |
| 3-4-2-1 | fullback>centre_back | 3082.00 |
| 3-4-2-1 | midfield>centre_back | 1030.00 |
| 3-4-2-1 | midfield>fullback | 560.00 |
| 3-4-2-1 | centre_back>midfield | 232.00 |
| 3-4-2-1 | fullback>midfield | 201.00 |
| 3-4-2-1 | striker>fullback | 84.00 |
| 3-5-2 | centre_back>centre_back | 8456.00 |
| 3-5-2 | centre_back>fullback | 3870.00 |
| 3-5-2 | fullback>centre_back | 3317.00 |
| 3-5-2 | midfield>centre_back | 1014.00 |
| 3-5-2 | midfield>fullback | 564.00 |
| 3-5-2 | centre_back>midfield | 277.00 |
| 3-5-2 | striker>fullback | 230.00 |
| 3-5-2 | fullback>midfield | 195.00 |

Top eight edges per formation; JSON retains every edge and exact canonical player network. Receptions use the actual receiver, including redirected deliveries.

## 5. Progressive passing and forward receptions

| Formation | Progressive releases (>5m) | Progressive completions (>5m) | Striker attempts | Striker receptions | Through attempts / completed |
| --- | --- | --- | --- | --- | --- |
| 4-3-3 | 162.17 | 124.71 | 9.50 | 3.33 | 23.21/21.46 |
| 4-2-3-1 | 127.75 | 92.54 | 4.92 | 1.75 | 20.88/19.21 |
| 4-4-2 | 155.83 | 120.00 | 20.63 | 8.83 | 32.63/29.42 |
| 3-4-2-1 | 213.13 | 179.25 | 5.75 | 2.13 | 31.67/29.38 |
| 3-5-2 | 253.67 | 210.58 | 22.83 | 9.83 | 31.67/30.21 |

## 6. Entries and physical outcomes

| Formation | Final third | Penalty area | Saves | Parries | Corners | Offsides |
| --- | --- | --- | --- | --- | --- | --- |
| 4-3-3 | 15.00 | 0.63 | 0.04 | 0.04 | 0.00 | 0.00 |
| 4-2-3-1 | 8.29 | 0.38 | 0.00 | 0.00 | 0.00 | 0.08 |
| 4-4-2 | 13.50 | 0.96 | 0.00 | 0.00 | 0.04 | 0.00 |
| 3-4-2-1 | 2.92 | 0.13 | 0.00 | 0.00 | 0.00 | 0.00 |
| 3-5-2 | 4.96 | 0.33 | 0.00 | 0.00 | 0.00 | 0.00 |

## 7. Turnovers and fouls by attacking pitch third

| Formation | Own third losses | Middle losses | Final losses | Foul zones (own / middle / final) |
| --- | --- | --- | --- | --- |
| 4-3-3 | 223.00 | 2347.00 | 295.00 | 18/34/1 |
| 4-2-3-1 | 142.00 | 2064.00 | 176.00 | 19/27/1 |
| 4-4-2 | 74.00 | 2219.00 | 286.00 | 14/34/1 |
| 3-4-2-1 | 33.00 | 1982.00 | 74.00 | 10/35/0 |
| 3-5-2 | 55.00 | 2290.00 | 105.00 | 11/37/0 |

Counts are whole-experiment canonical loss/challenge identities. Foul zones cover observed ground challenges in the committing team direction, not a complete spatial census of every foul source. Canonical total fouls remain separate.

## 8. Actual shape and variability

| Formation | Width (m) | Depth (m) | Anchor distance (m) | Ideal-target distance (m) | Low-progress full-turn seconds |
| --- | --- | --- | --- | --- | --- |
| 4-3-3 | 37.61 | 27.97 | 10.19 | 5.44 | 11.30 |
| 4-2-3-1 | 36.57 | 27.67 | 10.09 | 5.10 | 8.57 |
| 4-4-2 | 37.32 | 28.47 | 10.78 | 5.09 | 12.92 |
| 3-4-2-1 | 30.95 | 26.71 | 10.05 | 4.84 | 6.59 |
| 3-5-2 | 31.63 | 26.65 | 10.09 | 4.72 | 7.44 |

Individual position means, standard deviations and sample counts are retained in each team spatial map. Distances are from real bodies, with explicit attacking-direction normalisation. Shape is not snapped onto targets.

## 9. Sampled available versus selected attacking actions

| Formation | Decision samples | Shot candidates | Samples with executable shot | Samples with shot ranked first | Actual shots |
| --- | --- | --- | --- | --- | --- |
| 4-3-3 | 144.17 | 75.63 | 37.75 | 0.00 | 0.08 |
| 4-2-3-1 | 137.67 | 75.79 | 37.88 | 0.00 | 0.13 |
| 4-4-2 | 114.96 | 79.96 | 39.79 | 0.00 | 0.46 |
| 3-4-2-1 | 80.71 | 61.67 | 30.79 | 0.00 | 0.08 |
| 3-5-2 | 89.13 | 73.00 | 36.46 | 0.00 | 0.04 |

Samples are spaced ≥2 seconds and require a controlled owner with action cooldown ≤0. They are observations, not an exhaustive count of canonical decisions. An executable option may still have physical preparation cost and can be a poor long-range shot. Zero first-ranked samples alone do not prove a selection defect.

## 10. Matched controlled situations before / after

| Scenario (3 matched seeds) | Delay before / after (s) | Shots before / after | Passes before / after |
| --- | --- | --- | --- |
| line_gap | 5.04/0.98 | 0/0 | 9/27 |
| striker_drops | 5.04/0.98 | 0/0 | 10/23 |
| two_strikers | 5.04/0.98 | 0/0 | 8/18 |
| open_lane | 5.04/0.98 | 0/0 | 11/28 |
| press_escape | 5.04/0.98 | 0/0 | 11/13 |
| edge_box | 5.04/0.40 | 1/5 | 3/1 |
| rebound | 5.04/0.40 | 1/5 | 3/1 |
| fresh_run | 5.04/0.98 | 0/0 | 7/26 |
| fatigued_run | 5.04/0.98 | 0/0 | 7/27 |

These are 20-second scenarios, not full matches. edge_box and rebound share geometry; they are not six independent seeds.

## 10b. Matched full native-club funnel before / after

| Seed | Anchor side | Club | Passes before/after | Final entries before/after | Box entries before/after | Canonical shots before/after |
| --- | --- | --- | --- | --- | --- | --- |
| lab-mv2ymq0c | away | Błękitni | 364/1210 | 26/47 | 0/1 | 0/0 |
| lab-mv2ymq0c | away | Górnik | 541/1082 | 22/32 | 0/0 | 0/1 |
| pr162-2 | home | Błękitni | 422/1111 | 20/69 | 1/3 | 0/0 |
| pr162-2 | home | Górnik | 525/1073 | 19/45 | 1/2 | 1/1 |
| pr162-2 | away | Błękitni | 432/1151 | 15/35 | 0/0 | 0/0 |
| pr162-2 | away | Górnik | 470/1149 | 24/59 | 0/0 | 0/0 |

3 identical initial states reached the final whistle on both sources. Three censored baseline club matches are excluded from this matched full comparison. Controlled-entry definitions are unchanged; progressive completion and invalid V1 shot-stage conversions are not compared. More circulation and final entries do not establish a solved box/shot funnel.

## Conditional attacking conversions

| Formation | Final entry after outside start | Shot in same final-entry possession | Shot in same box-entry possession | First-ranked executable shot / executable samples |
| --- | --- | --- | --- | --- |
| 4-3-3 | 10.49% (295/2811) | 0.33% (1/307) | 18.18% (2/11) | 0.00% (0/906) |
| 4-2-3-1 | 6.73% (159/2361) | 0.61% (1/163) | 22.22% (2/9) | 0.00% (0/909) |
| 4-4-2 | 9.72% (244/2509) | 3.07% (8/261) | 61.11% (11/18) | 0.00% (0/955) |
| 3-4-2-1 | 2.61% (55/2107) | 1.61% (1/62) | 66.67% (2/3) | 0.00% (0/739) |
| 3-5-2 | 3.69% (91/2463) | 1.02% (1/98) | 14.29% (1/7) | 0.00% (0/875) |

Stages count unique controlled possessions. Set-piece releases without an open-play controlled sequence still contribute to canonical shot totals, but are outside these conditional sequence denominators. First-ranked sampled actions are distinct from actual canonical selections.

## Real squads and censored baseline

| Experiment | Full / observed | Anchor W/D/L | Anchor shots / opponent | Anchor passes / opponent |
| --- | --- | --- | --- | --- |
| clubs | 3/6 | 0/2/1 | 0.00/0.17 | 291.83/353.33 |
| balanced | 6/6 | 1/5/0 | 0.17/0.00 | 516.50/307.17 |
| strong-weak | 5/6 | 4/1/0 | 2.50/0.00 | 409.50/354.83 |
| high-press | 4/6 | 0/4/0 | 0.17/0.00 | 370.33/390.33 |
| clubs | 6/6 | 0/5/1 | 0.00/0.33 | 1118.00/1126.83 |

Current club-only rows preserve the native generated formations, starting XI and coach style. The baseline balanced/strong-weak/high-press fixture labels describe actual chosen clubs; their recorded strengths are authoritative.

## Raw orientation results

| Formation | Seed | Anchor side | Status | Anchor goals:opponent | Anchor shots:opponent | Final entries Δ |
| --- | --- | --- | --- | --- | --- | --- |
| 4-3-3 | pr162-1 | home | full_time | 0:0 | 0:0 | 13.00 |
| 4-3-3 | pr162-1 | away | full_time | 0:0 | 0:0 | 17.00 |
| 4-3-3 | pr162-2 | home | full_time | 0:0 | 1:0 | -4.00 |
| 4-3-3 | pr162-2 | away | full_time | 0:0 | 0:0 | 13.00 |
| 4-3-3 | pr162-3 | home | full_time | 1:0 | 1:0 | -4.00 |
| 4-3-3 | pr162-3 | away | full_time | 1:0 | 1:0 | 2.00 |
| 4-2-3-1 | pr162-1 | home | full_time | 0:0 | 0:0 | 13.00 |
| 4-2-3-1 | pr162-1 | away | full_time | 0:0 | 0:0 | 18.00 |
| 4-2-3-1 | pr162-2 | home | full_time | 0:0 | 0:0 | 7.00 |
| 4-2-3-1 | pr162-2 | away | full_time | 0:0 | 0:0 | 23.00 |
| 4-2-3-1 | pr162-3 | home | full_time | 0:0 | 0:0 | 11.00 |
| 4-2-3-1 | pr162-3 | away | full_time | 0:0 | 0:0 | 12.00 |
| 4-4-2 | pr162-1 | home | full_time | 0:1 | 0:1 | -8.00 |
| 4-4-2 | pr162-1 | away | full_time | 1:0 | 1:0 | -3.00 |
| 4-4-2 | pr162-2 | home | full_time | 0:0 | 0:0 | 3.00 |
| 4-4-2 | pr162-2 | away | full_time | 0:0 | 0:0 | 4.00 |
| 4-4-2 | pr162-3 | home | full_time | 0:0 | 0:0 | -5.00 |
| 4-4-2 | pr162-3 | away | full_time | 0:0 | 0:0 | -5.00 |
| 3-4-2-1 | pr162-1 | home | full_time | 0:0 | 0:0 | 12.00 |
| 3-4-2-1 | pr162-1 | away | full_time | 1:0 | 1:0 | 1.00 |
| 3-4-2-1 | pr162-2 | home | full_time | 0:0 | 0:0 | 7.00 |
| 3-4-2-1 | pr162-2 | away | full_time | 0:1 | 0:1 | 9.00 |
| 3-4-2-1 | pr162-3 | home | full_time | 0:0 | 0:0 | 7.00 |
| 3-4-2-1 | pr162-3 | away | full_time | 0:0 | 0:0 | 4.00 |
| 3-5-2 | pr162-1 | home | full_time | 0:0 | 0:0 | -1.00 |
| 3-5-2 | pr162-1 | away | full_time | 0:0 | 0:0 | -1.00 |
| 3-5-2 | pr162-2 | home | full_time | 0:0 | 0:0 | 10.00 |
| 3-5-2 | pr162-2 | away | full_time | 0:0 | 0:0 | 11.00 |
| 3-5-2 | pr162-3 | home | full_time | 0:0 | 0:0 | -4.00 |
| 3-5-2 | pr162-3 | away | full_time | 0:0 | 0:0 | -5.00 |
| 4-3-3 | pr162-4 | home | full_time | 0:0 | 0:0 | 10.00 |
| 4-3-3 | pr162-4 | away | full_time | 0:0 | 0:0 | 13.00 |
| 4-3-3 | pr162-5 | home | full_time | 0:0 | 1:0 | 24.00 |
| 4-3-3 | pr162-5 | away | full_time | 0:0 | 0:0 | 17.00 |
| 4-3-3 | pr162-6 | home | full_time | 1:0 | 1:0 | -4.00 |
| 4-3-3 | pr162-6 | away | full_time | 0:0 | 0:0 | 6.00 |
| 4-3-3 | pr162-7 | home | full_time | 0:0 | 0:0 | 8.00 |
| 4-3-3 | pr162-7 | away | full_time | 0:0 | 1:0 | 6.00 |
| 4-3-3 | pr162-8 | home | full_time | 0:0 | 0:0 | 12.00 |
| 4-3-3 | pr162-8 | away | full_time | 0:0 | 0:0 | 9.00 |
| 4-3-3 | pr162-9 | home | full_time | 0:0 | 1:0 | 6.00 |
| 4-3-3 | pr162-9 | away | full_time | 0:0 | 0:1 | 3.00 |
| 4-3-3 | pr162-10 | home | full_time | 0:0 | 0:0 | 5.00 |
| 4-3-3 | pr162-10 | away | full_time | 1:0 | 1:0 | 9.00 |
| 4-3-3 | pr162-11 | home | full_time | 0:0 | 0:0 | 4.00 |
| 4-3-3 | pr162-11 | away | full_time | 0:0 | 0:0 | 9.00 |
| 4-3-3 | pr162-12 | home | full_time | 1:0 | 1:1 | 7.00 |
| 4-3-3 | pr162-12 | away | full_time | 0:0 | 0:0 | 10.00 |
| 4-2-3-1 | pr162-4 | home | full_time | 0:0 | 0:0 | 2.00 |
| 4-2-3-1 | pr162-4 | away | full_time | 0:0 | 0:0 | 12.00 |
| 4-2-3-1 | pr162-5 | home | full_time | 0:0 | 0:1 | 8.00 |
| 4-2-3-1 | pr162-5 | away | full_time | 0:0 | 0:0 | -7.00 |
| 4-2-3-1 | pr162-6 | home | full_time | 0:0 | 0:0 | 29.00 |
| 4-2-3-1 | pr162-6 | away | full_time | 0:0 | 0:0 | 7.00 |
| 4-2-3-1 | pr162-7 | home | full_time | 0:0 | 0:0 | 16.00 |
| 4-2-3-1 | pr162-7 | away | full_time | 0:0 | 0:0 | 14.00 |
| 4-2-3-1 | pr162-8 | home | full_time | 1:0 | 1:0 | 10.00 |
| 4-2-3-1 | pr162-8 | away | full_time | 0:0 | 0:0 | 20.00 |
| 4-2-3-1 | pr162-9 | home | full_time | 0:1 | 0:1 | 8.00 |
| 4-2-3-1 | pr162-9 | away | full_time | 2:0 | 2:1 | 11.00 |
| 4-2-3-1 | pr162-10 | home | full_time | 0:0 | 0:0 | 10.00 |
| 4-2-3-1 | pr162-10 | away | full_time | 0:0 | 0:0 | 28.00 |
| 4-2-3-1 | pr162-11 | home | full_time | 0:0 | 0:0 | 12.00 |
| 4-2-3-1 | pr162-11 | away | full_time | 0:0 | 0:0 | 23.00 |
| 4-2-3-1 | pr162-12 | home | full_time | 0:0 | 0:0 | 8.00 |
| 4-2-3-1 | pr162-12 | away | full_time | 0:0 | 0:0 | 15.00 |
| 4-4-2 | pr162-4 | home | full_time | 0:1 | 0:1 | -1.00 |
| 4-4-2 | pr162-4 | away | full_time | 0:0 | 0:1 | 12.00 |
| 4-4-2 | pr162-5 | home | full_time | 0:0 | 0:0 | 2.00 |
| 4-4-2 | pr162-5 | away | full_time | 0:0 | 0:1 | 1.00 |
| 4-4-2 | pr162-6 | home | full_time | 0:1 | 0:2 | 7.00 |
| 4-4-2 | pr162-6 | away | full_time | 0:0 | 0:0 | 7.00 |
| 4-4-2 | pr162-7 | home | full_time | 0:0 | 0:0 | -9.00 |
| 4-4-2 | pr162-7 | away | full_time | 0:1 | 0:1 | -2.00 |
| 4-4-2 | pr162-8 | home | full_time | 0:1 | 0:1 | -5.00 |
| 4-4-2 | pr162-8 | away | full_time | 0:0 | 0:0 | -7.00 |
| 4-4-2 | pr162-9 | home | full_time | 0:0 | 0:0 | 7.00 |
| 4-4-2 | pr162-9 | away | full_time | 0:1 | 0:1 | 0.00 |
| 4-4-2 | pr162-10 | home | full_time | 0:0 | 0:0 | -8.00 |
| 4-4-2 | pr162-10 | away | full_time | 0:0 | 0:0 | -3.00 |
| 4-4-2 | pr162-11 | home | full_time | 0:0 | 0:1 | 4.00 |
| 4-4-2 | pr162-11 | away | full_time | 0:0 | 0:0 | 6.00 |
| 4-4-2 | pr162-12 | home | full_time | 1:1 | 1:1 | -5.00 |
| 4-4-2 | pr162-12 | away | full_time | 0:0 | 0:0 | -17.00 |
| 3-4-2-1 | pr162-4 | home | full_time | 0:0 | 0:0 | 1.00 |
| 3-4-2-1 | pr162-4 | away | full_time | 0:0 | 0:0 | -1.00 |
| 3-4-2-1 | pr162-5 | home | full_time | 0:0 | 0:1 | 0.00 |
| 3-4-2-1 | pr162-5 | away | full_time | 0:0 | 0:0 | 4.00 |
| 3-4-2-1 | pr162-6 | home | full_time | 0:0 | 0:0 | 4.00 |
| 3-4-2-1 | pr162-6 | away | full_time | 0:0 | 0:0 | 21.00 |
| 3-4-2-1 | pr162-7 | home | full_time | 0:0 | 0:0 | 6.00 |
| 3-4-2-1 | pr162-7 | away | full_time | 0:0 | 0:0 | 2.00 |
| 3-4-2-1 | pr162-8 | home | full_time | 0:0 | 0:0 | 7.00 |
| 3-4-2-1 | pr162-8 | away | full_time | 0:0 | 0:0 | 9.00 |
| 3-4-2-1 | pr162-9 | home | full_time | 0:0 | 0:0 | 12.00 |
| 3-4-2-1 | pr162-9 | away | full_time | 0:0 | 0:0 | 17.00 |
| 3-4-2-1 | pr162-10 | home | full_time | 0:0 | 0:0 | 1.00 |
| 3-4-2-1 | pr162-10 | away | full_time | 0:0 | 0:0 | 12.00 |
| 3-4-2-1 | pr162-11 | home | full_time | 0:0 | 0:0 | 12.00 |
| 3-4-2-1 | pr162-11 | away | full_time | 0:0 | 0:0 | 8.00 |
| 3-4-2-1 | pr162-12 | home | full_time | 0:0 | 0:0 | 13.00 |
| 3-4-2-1 | pr162-12 | away | full_time | 0:0 | 0:0 | 2.00 |
| 3-5-2 | pr162-4 | home | full_time | 0:1 | 1:1 | 8.00 |
| 3-5-2 | pr162-4 | away | full_time | 0:0 | 0:0 | 10.00 |
| 3-5-2 | pr162-5 | home | full_time | 0:0 | 0:0 | 13.00 |
| 3-5-2 | pr162-5 | away | full_time | 0:0 | 0:0 | 3.00 |
| 3-5-2 | pr162-6 | home | full_time | 0:0 | 0:0 | 4.00 |
| 3-5-2 | pr162-6 | away | full_time | 0:0 | 0:0 | 8.00 |
| 3-5-2 | pr162-7 | home | full_time | 0:0 | 0:0 | 9.00 |
| 3-5-2 | pr162-7 | away | full_time | 1:0 | 1:0 | 11.00 |
| 3-5-2 | pr162-8 | home | full_time | 0:0 | 0:0 | 3.00 |
| 3-5-2 | pr162-8 | away | full_time | 0:0 | 0:0 | 9.00 |
| 3-5-2 | pr162-9 | home | full_time | 0:0 | 0:0 | 9.00 |
| 3-5-2 | pr162-9 | away | full_time | 0:0 | 0:0 | 1.00 |
| 3-5-2 | pr162-10 | home | full_time | 0:0 | 0:0 | 12.00 |
| 3-5-2 | pr162-10 | away | full_time | 0:0 | 0:0 | 1.00 |
| 3-5-2 | pr162-11 | home | full_time | 0:0 | 0:0 | 2.00 |
| 3-5-2 | pr162-11 | away | full_time | 0:0 | 0:0 | -4.00 |
| 3-5-2 | pr162-12 | home | full_time | 0:0 | 0:0 | -2.00 |
| 3-5-2 | pr162-12 | away | full_time | 0:0 | 0:0 | 10.00 |

## Coverage limitations

Main coverage: 120/120 observed, 120 full-time; no missing or censored result is extrapolated. Telemetry V1 baseline does not measure progressive completion or reception beyond the release-time line as V2/V3 do. V1/V2 shot-stage conditional conversions are discarded because settlement could close possession first; canonical shot totals remain valid. Do not treat absent counters as zeros. Pressure escape duration, all cross releases, defensive line clustering, opportunity expectation at every decision and substitutions by tactical job are not fully instrumented here; canonical traces/tests and workload totals support narrower conclusions.
