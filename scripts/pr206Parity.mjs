import console from 'node:console';
import { runEpisode } from './pr206Episodes.mjs';
console.log(
  JSON.stringify(
    [0, 1, 2].map(
      (geometry) =>
        runEpisode({ seed: `pr206-parity-${geometry}`, geometry, duration: 1.5 }).row.finalHash,
    ),
  ),
);
