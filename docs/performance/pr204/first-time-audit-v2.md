# Developmental first-time action audit (09c)

This is a released-ball development experiment, not a full-match estimate or proof that the pass was a good decision. It runs all 60 PR201-style releases with baseline `skill=55`, sets C's gameReading and firstTouch to 85 after the release, and activates the experimental local-reception path. Other attributes and the already released ball stay unchanged. An explicit loader wraps `locallyPreparedFirstTimeAction` as a read-only observer; canonical stepping, candidate generation and physical execution remain unchanged. It does not insert a local plan, select a pass, force contact, or supply sighting data. C's first contact and earlier releases/contacts are retained in each row. The fixture factors share seed labels: 60 arms are not necessarily 60 independent environments.

Source `09c791e82b495dc0abcf3991b5b0b7a95b9cff222ab333f7e7b33b9a7d9a29a0` remained stable. An observed nonempty plan appeared in 47/60 episodes, C contacted in 31, and its selector was invoked 28 times. Five selector calls returned a first-time pass, each actually executed by the normal step with `actionSource=autonomous_npc`, `executionType=first_time`, and an executed finite ground foot contact in that same tick. Two were C's direct contact of the original release with no intervening observed contact/release: PR200 `short_ground`, sample 1, immediate pressure (10.850 s, left foot, last optical observation 10.775 s, local plan created 10.325 s); PR201 `moving_lead`, sample 0, immediate pressure (11.575 s, left foot, last optical observation 11.525 s, plan created 10.525 s). Three occurred on later releases after intervening touch/possession; they are not counted as direct receptions of the original ball. The other nine recorded later passes have normal/weak-foot execution and are not first-time actions.

The test shows the autonomous path can execute under these artificial fixture conditions. It does not establish broader quality, retention, legality of every actor's knowledge, attacking headers or all user command/restart/defensive interactions. No later downstream action is established by this receipt. The previous negative single-scene 20-step trial remains a separate apparatus-limited result.

Archive `first-time-audit-v2.json.gz` SHA256 `3e51ee2245667891243656c3edf7f1bf18e5c50818f388220156399dafb76166` embeds the exact loader, experiment and raw receipt with separate member SHA256s. The corresponding source bytes are in `source-09c791e82b495dc0abcf3991b5b0b7a95b9cff222ab333f7e7b33b9a7d9a29a0.json.gz`. From the repository root with Node 24 and dependencies, this command verifies hashes, writes uniquely named temporary files in the parent work directory, runs the original code with only its output filename changed, and compares all episodes. It cleans only files it created:

```powershell
@'
const fs=require('fs'), z=require('zlib'), crypto=require('crypto'), path=require('path'), cp=require('child_process'), {pathToFileURL}=require('url');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const archive=fs.readFileSync('docs/performance/pr204/first-time-audit-v2.json.gz');
if(sha(archive)!=='3e51ee2245667891243656c3edf7f1bf18e5c50818f388220156399dafb76166') throw Error('archive checksum');
const data=JSON.parse(z.gunzipSync(archive));
for(const [name,entry] of Object.entries(data.files)) if(sha(Buffer.from(entry.utf8))!==entry.sha256) throw Error('member checksum: '+name);
const id='pr204-first-time-'+crypto.randomBytes(8).toString('hex');
const parent=path.resolve('..'), script=path.join(parent,id+'.mjs'), loader=path.join(parent,id+'-loader.mjs'), output=path.join(parent,id+'-result.json');
try {
  const old="'../first-time-audit-result-v3.json'", replacement=JSON.stringify('../'+id+'-result.json');
  const text=data.files['first-time-audit-v3.mjs'].utf8;
  if(text.split(old).length!==2) throw Error('output binding changed');
  fs.writeFileSync(script,text.replace(old,replacement),{flag:'wx'});
  fs.writeFileSync(loader,data.files['first-time-audit-loader.mjs'].utf8,{flag:'wx'});
  cp.execFileSync(process.execPath,['--max-semi-space-size=64','--experimental-transform-types','--import',pathToFileURL(loader).href,script],{stdio:'inherit'});
  const actual=JSON.parse(fs.readFileSync(output)), expected=JSON.parse(data.files['first-time-audit-result-v3.json'].utf8);
  if(actual.source!==data.sourceFingerprint||!actual.stable||JSON.stringify(actual.rows)!==JSON.stringify(expected.rows)) throw Error('replay differs');
  console.log('PASS: first-time episodes and actual contacts');
} finally { for(const file of [script,loader,output]) if(fs.existsSync(file)) fs.unlinkSync(file); }
'@ | node
```
