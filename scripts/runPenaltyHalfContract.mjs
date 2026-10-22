import { readFileSync } from 'node:fs';
import { deserialize, serialize } from 'node:v8';
import process from 'node:process';
import { runPenaltyHalfContract } from './penaltyHalfContract.ts';

// V8 serialization preserves undefined fields and exact numbers across the process boundary.
process.stdout.write(serialize(runPenaltyHalfContract(deserialize(readFileSync(0)))));
