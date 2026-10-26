# PR195 pilot results

Controlled development only. Counts are per requested trial, never full matches. All outcome flags have distinct definitions and overlap. Rejected requests and censored/unresolved events are excluded from probability scores, with denominators shown. Mirrors and repeated seeds are clustered; Wilson95 intervals in JSON are descriptive and do not establish independent statistical coverage.

| Scene | Trials / released | Receiver touch / control | Defender touch / control | Completion observed / predicted / Brier | Retention observed / predicted / Brier | Goal observed / predicted / Brier |
|---|---:|---:|---:|---|---|---|
| safe_pass | 28 / 28 | 28 / 28 | 0 / 0 | 28: 1.000 / 0.916 / 0.019 | 28: 1.000 / 0.734 / 0.165 | 0: — / — / — |
| progressive_pass | 28 / 28 | 24 / 24 | 0 / 0 | 28: 0.857 / 0.848 / 0.019 | 28: 0.857 / 0.697 / 0.067 | 0: — / — / — |
| through_ball | 28 / 28 | 16 / 16 | 0 / 0 | 25: 0.640 / 0.644 / 0.021 | 25: 0.360 / 0.612 / 0.228 | 0: — / — / — |
| long_pass | 28 / 28 | 0 / 0 | 0 / 0 | 28: 0.000 / 0.509 / 0.427 | 28: 0.000 / 0.382 / 0.291 | 0: — / — / — |
| pressured_receiver | 28 / 28 | 24 / 24 | 4 / 4 | 28: 0.857 / 0.524 / 0.247 | 28: 0.250 / 0.296 / 0.354 | 0: — / — / — |
| moving_defender | 28 / 28 | 25 / 22 | 4 / 3 | 28: 0.893 / 0.809 / 0.039 | 27: 0.741 / 0.675 / 0.156 | 0: — / — / — |
| wrong_direction | 28 / 28 | 24 / 24 | 0 / 0 | 28: 0.857 / 0.809 / 0.021 | 28: 0.714 / 0.662 / 0.148 | 0: — / — / — |
| bad_pass | 28 / 28 | 5 / 5 | 24 / 23 | 28: 0.179 / 0.316 / 0.285 | 28: 0.143 / 0.191 / 0.184 | 0: — / — / — |
| stale_receiver | 28 / 28 | 20 / 18 | 0 / 0 | 28: 0.714 / 0.071 / 0.591 | 28: 0.643 / 0.067 / 0.526 | 0: — / — / — |
| good_shot | 28 / 28 | 0 / 0 | 0 / 0 | 0: — / — / — | 0: — / — / — | 28: 0.000 / 0.131 / 0.026 |
| poor_shot_outlet | 28 / 28 | 0 / 0 | 0 / 0 | 0: — / — / — | 0: — / — / — | 28: 0.071 / 0.000 / 0.071 |
| poor_shot_trapped | 28 / 28 | 0 / 0 | 28 / 1 | 0: — / — / — | 0: — / — / — | 28: 0.000 / 0.000 / 0.000 |
| incoming_difficult | 28 / 28 | 0 / 0 | 0 / 0 | 0: — / — / — | 0: — / — / — | 28: 0.000 / 0.131 / 0.026 |
| blocked_shot | 28 / 28 | 1 / 1 | 26 / 2 | 0: — / — / — | 0: — / — / — | 28: 0.000 / 0.093 / 0.013 |
| keeper_away | 28 / 28 | 0 / 0 | 0 / 0 | 0: — / — / — | 0: — / — / — | 28: 0.714 / 0.233 / 0.385 |
| rebound | 28 / 28 | 1 / 1 | 26 / 2 | 0: — / — / — | 0: — / — / — | 28: 0.000 / 0.093 / 0.013 |
| infeasible_contact | 28 / 0 | 0 / 0 | 0 / 0 | 0: — / — / — | 0: — / — / — | 0: — / — / — |
| safe_hold | 28 / 0 | 17 / 16 | 5 / 5 | 0: — / — / — | 0: — / — / — | 0: — / — / — |

## Reliability by event

| Event / interval | n | Mean forecast | Observed |
|---|---:|---:|---:|
| completion / 0.0–0.2 | 60 | 0.069 | 0.467 |
| completion / 0.2–0.4 | 29 | 0.289 | 0.172 |
| completion / 0.4–0.6 | 16 | 0.526 | 0.063 |
| completion / 0.6–0.8 | 24 | 0.743 | 1.000 |
| completion / 0.8–1.0 | 120 | 0.931 | 0.900 |
| retained / 0.0–0.2 | 92 | 0.041 | 0.337 |
| retained / 0.2–0.4 | 18 | 0.330 | 0.056 |
| retained / 0.4–0.6 | 38 | 0.483 | 0.553 |
| retained / 0.6–0.8 | 20 | 0.721 | 0.450 |
| retained / 0.8–1.0 | 80 | 0.948 | 0.850 |
| goal / 0.0–0.2 | 160 | 0.052 | 0.063 |
| goal / 0.2–0.4 | 32 | 0.271 | 0.250 |
| goal / 0.4–0.6 | 4 | 0.497 | 1.000 |
| goal / 0.6–0.8 | 0 | — | — |
| goal / 0.8–1.0 | 0 | — | — |

## Skill matchups

| Attacker:defender | Completion n / bias | Retention n / bias | Goal n / bias |
|---|---:|---:|---:|
| 20:20 | 36 / -0.187 | 35 / -0.305 | 28 / -0.057 |
| 40:40 | 35 / -0.148 | 35 / -0.302 | 28 / -0.039 |
| 60:60 | 36 / -0.084 | 36 / 0.126 | 28 / -0.066 |
| 80:80 | 36 / 0.014 | 36 / 0.122 | 28 / 0.015 |
| 100:100 | 36 / 0.025 | 36 / 0.046 | 28 / 0.065 |
| 40:80 | 34 / -0.045 | 34 / -0.140 | 28 / -0.039 |
| 80:40 | 36 / -0.012 | 36 / 0.103 | 28 / 0.015 |

Positive bias means overprediction. These analytic outputs are candidate probability claims, not calibrated probabilities. Pooled AUC, clipped log loss (epsilon1e−12), Wilson intervals and per-skill reliability bins are in summary.json. Calibration and discrimination differ. Neither identifies a real-football optimum.
