# Paired open-case contact forensics

`open-regression-forensics.json.gz` contains the exact development observer used to rerun open seeds 1, 2, 3 and 5 for both profiles, plus its raw 40 Hz receipt. Compressed SHA256: `9a1be1575c4b03eb3366131a4642e73785df57d7dd517477cc755489f34ebcec`. Decompressed JSON SHA256: `b5adbde74f03eedd81225e1daa274fc19d9ece4c000a16ed4d1edc2e625021e2`. Observer SHA256: `3850c15f7f596c66e1b46cd94e3fa5d3045197a81a0a1cbeb5fa59bf11886845`; receipt SHA256: `c7642a08d280fdafc7e028fe3ac63d907ce06622f4b1707e90040043fed3965a`.

The frozen source fingerprint is `f83ea56a253ec4e0e73b25bb60c5f8165dd31f2ac3a812ea75a183c782827c57`. Before each run the observer records the full source manifest and rejects a source change during execution. Frame capture is privileged read-only measurement; it does not supply information to the players. Omitting `forensicFrames` from each rerun row gives the corresponding exact row in `decision-corpus.json`. The speeds and locations below are actual observed states, but the paired B releases are different trajectories. They therefore do not establish that the handoff caused the outcome difference.

| Seed | Original: release → direct C control | Development: release → first other contact/control |
| --- | --- | --- |
| 1 | 12.525 → 13.700 at (61.73, 32.04) | 13.375 → opponent 5 controls at 15.200 near (69.61, 31.77); no direct C contact |
| 2 | 12.550 → 13.775 at (61.69, 32.29) | 12.675 → teammate 5 controls at 12.700 near (48.36, 31.76); no direct C contact |
| 3 | 12.750 → 14.925 at (72.60, 42.43) | 12.925 → opponent 8 touches at 14.675 near (71.49, 41.33), then controls; no direct C contact |
| 5 | 13.000 → 15.025 at (73.10, 41.78) | 12.950 → opponent 1 controls at 13.375 near (55.77, 35.03); no direct C contact |

In seed 3 the velocity immediately before the opponent witness is approximately (10.01, 3.96) m/s, and the loose ball afterwards is approximately (-2.20, 0.37) m/s. The contact witnesses do **not** identify a body part, and state replacement removes post-contact velocity for the ownership changes in seeds 1 and 5. In seed 2 a teammate rather than an opponent claims the ball; no unsupported explanation for that contact is asserted. A 25 ms frame samples the result after each canonical step, not a continuous collision trajectory.

From the repository root on PowerShell with Node 24 and dependencies installed, execute:

```powershell
@'
const fs = require('fs'), zlib = require('zlib'), crypto = require('crypto');
const path = require('path'), cp = require('child_process');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const archive = fs.readFileSync('docs/performance/pr204/open-regression-forensics.json.gz');
if (sha(archive) !== '9a1be1575c4b03eb3366131a4642e73785df57d7dd517477cc755489f34ebcec') throw Error('archive checksum');
const b = JSON.parse(zlib.gunzipSync(archive));
for (const name of ['forensics.mjs', 'forensics.json']) if (sha(Buffer.from(b.files[name].utf8)) !== b.files[name].sha256) throw Error('member checksum: ' + name);
fs.mkdirSync('.benchmark-artifacts', { recursive: true });
const prefix = 'pr204-forensic-' + crypto.randomBytes(8).toString('hex');
const script = path.resolve('.benchmark-artifacts', prefix + '.mjs');
const output = path.resolve('.benchmark-artifacts', prefix + '.json');
try {
  fs.writeFileSync(script, b.files['forensics.mjs'].utf8, { flag: 'wx' });
  cp.execFileSync(process.execPath, ['--max-semi-space-size=64', '--experimental-transform-types', '--import', './scripts/registerTypescriptLoader.mjs', script, output], { stdio: 'inherit' });
  const actual = JSON.parse(fs.readFileSync(output)), expected = JSON.parse(b.files['forensics.json'].utf8);
  if (actual.source.fingerprint !== b.sourceFingerprint || JSON.stringify(actual.rows) !== JSON.stringify(expected.rows)) throw Error('forensics replay differs');
  const corpus = JSON.parse(fs.readFileSync('docs/performance/pr204/decision-corpus.json'));
  for (const row of actual.rows) {
    const copy = { ...row }; delete copy.forensicFrames;
    const original = corpus.rows.find(r => r.sample === row.sample && r.arm === row.arm && r.profile === row.profile);
    if (!original || JSON.stringify(copy) !== JSON.stringify(original)) throw Error('corpus row differs');
  }
  console.log('Open-case forensics and all eight source corpus rows PASS');
} finally { fs.rmSync(script, { force: true }); fs.rmSync(output, { force: true }); }
'@ | node
```
