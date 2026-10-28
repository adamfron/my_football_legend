# PR200 verification receipts

`dev-v1/` preserves development verification. Its initial `verify` failed while code and several expensive experiments were running. The log includes timing failures, a stale mid-run test import and a genuine direct-import schema initialization cycle. The cycle was repaired with deferred schema resolution; historical tests and their time limits were preserved. Historical PR195–198 checks and exact-source PR199 replay receipts in this directory record their own exit codes and source identities.

`final-v1/` records the final frozen-code verification and PR200 source replays. Read each JSON receipt's exit code, log hash and `sourceBefore`/`sourceAfter`; a directory name alone is not a successful verdict. Compressed logs retain the complete command output. Full `verify` includes lint, unit tests, match integration, career contracts, full-career tests and build.

`development-logs/` retains all match worker logs and coordinator snapshots. The first v2 launch encountered an exclusive source-archive publication race; its failed attempt and successful retry are both in the append-only worker log. Individual immutable match receipts contain the complete per-run costs and source identity; a later coordinator invocation does not replace them.

Final-head GitHub Actions is verified separately on the pull request. Local success and a previous revision's green CI do not certify a later commit. Football promotion remains **NOT_READY_FOR_PROMOTION**, independently of software verification.
