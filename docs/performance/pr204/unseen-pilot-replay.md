# Unseen-support pilot: archive and replay

`unseen-pilot-v1.json.gz` contains the development-only apparatus, its contract, and the unmodified raw pilot receipt. Its compressed SHA256 is `762f6db8f4be159a6317e3c37a9c02b1fb283cba58907a3f8e653ec421e775c8`. The uncompressed JSON SHA256 is `8be8af26cf69dba91239534bf86720e51411ce8f08a362441c43015d317e9df5`.

The receipt is bound to base `22d07d0a19149c240034801f55580c532bb62bd4` and source fingerprint `7bae9477722eabfaae68656127e48bfceecfeed27e10e32f35fc7fdf22da3a6d`. The archive checksums cover exact UTF-8 bytes, including newlines:

| File | SHA256 |
| --- | --- |
| `unseen-probe.mjs` | `5af0fc2ef67705a63b9a2a7332e47c6c70915eaa89dfa11ed1da7f79ea5e4827` |
| `unseen-contract.mjs` | `5cf053d65e20f27fb61952e1d8cb9e98ad333a5bba4590b4a5d2c75e891fe9aa` |
| `unseen-pilot.json` | `03fa0cc0d3aa8a37ddd05b8d16d997d3e23f50f1714840bb9aa10a4bd76360b1` |

From the repository root on PowerShell, with Node 24 and the repository dependencies installed, execute the following. It checks the archive and extracted files, creates a fresh private directory under `.benchmark-artifacts`, reruns the apparatus and its assertions, and requires identical raw receipt bytes. It also checks that the live source fingerprint matches the one recorded in the receipt; it is not a replay against an arbitrary later successor.

```powershell
@'
const fs = require('fs'), zlib = require('zlib'), crypto = require('crypto');
const path = require('path'), cp = require('child_process');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const archive = fs.readFileSync('docs/performance/pr204/unseen-pilot-v1.json.gz');
if (sha(archive) !== '762f6db8f4be159a6317e3c37a9c02b1fb283cba58907a3f8e653ec421e775c8') throw Error('archive checksum');
const b = JSON.parse(zlib.gunzipSync(archive));
fs.mkdirSync('.benchmark-artifacts', { recursive: true });
const dir = fs.mkdtempSync(path.resolve('.benchmark-artifacts/pr204-unseen-'));
for (const name of ['unseen-probe.mjs', 'unseen-contract.mjs', 'unseen-pilot.json']) {
  const f = b.files[name], bytes = Buffer.from(f.utf8, 'utf8');
  if (sha(bytes) !== f.sha256) throw Error('extracted checksum: ' + name);
  fs.writeFileSync(path.join(dir, name), bytes, { flag: 'wx' });
}
const actual = path.join(dir, 'replayed.json');
cp.execFileSync(process.execPath, ['--max-semi-space-size=64', '--experimental-transform-types', '--import', './scripts/registerTypescriptLoader.mjs', path.join(dir, 'unseen-probe.mjs'), actual], { stdio: 'inherit' });
cp.execFileSync(process.execPath, [path.join(dir, 'unseen-contract.mjs'), actual], { stdio: 'inherit' });
if (sha(fs.readFileSync(actual)) !== b.files['unseen-pilot.json'].sha256) throw Error('replay differs from receipt');
console.log('Exact unseen pilot replay PASS; extracted files:', dir);
'@ | node
```

The probe records actual bounded decision scenes, not a pre-step reconstruction. Six episodes contain decisions in which C is absent from `visible`, `remembered`, and `knowledge`, and absent from the pass menu; C is later legally reacquired. B's actions are autonomous, while initial B facing and A's initial delivery are explicit development interventions. The two orientation arms each contain three seeds, not independent evidence for every recorded tick. The support-facing arm did **not** keep C known at B's first decision; it is not a positive visibility control. Later reacquisition provides the positive control. The pilot does not claim that the entire original `unseen_support` scenario was repaired or that a passing lane was open at every decision.
