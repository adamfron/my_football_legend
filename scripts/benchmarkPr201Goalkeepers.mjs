// Reuse the maintained physical harness; the edition only selects evidence/profile scope.
import process from 'node:process';
process.argv.push('--pr201');
await import('./benchmarkPr200Goalkeepers.mjs');
