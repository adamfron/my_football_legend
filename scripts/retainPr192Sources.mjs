import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import * as prettier from 'prettier';
import console from 'node:console';
import { readPr192Evidence } from './readPr192Evidence.mjs';
const root = 'docs/performance/pr192',
  base = '9ea0e599f72800f4210092df2722e2ee16778ab7';
const sha = (v) => createHash('sha256').update(v).digest('hex');
const text = (p) => readFileSync(p, 'utf8').replaceAll('\r\n', '\n');
const candidates = new Map();
const add = (path, content) => {
  const values = candidates.get(path) ?? new Map();
  values.set(sha(content), content);
  candidates.set(path, values);
};
for (const file of readdirSync(root + '/source-overlays').filter((p) => p.endsWith('.json.gz'))) {
  const old = JSON.parse(gunzipSync(readFileSync(root + '/source-overlays/' + file)));
  for (const entry of old.overrides ?? []) add(entry.path, entry.content);
}
const paths = [
  'src/core/matchSimulation/firstTouchLaboratory.ts',
  'src/core/matchSimulation/matchState.ts',
  'src/core/matchSimulation/restartLifecycle.ts',
  'src/core/matchSimulation/restartLaws.ts',
];
for (const path of paths) {
  add(path, text(path));
  add(
    path,
    execFileSync('git', ['show', base + ':' + path], { encoding: 'utf8' }).replaceAll('\r\n', '\n'),
  );
}
add(paths[0], text(paths[0]).replace('foot: p.profile.dominantFoot,', "foot: 'right',"));
add(
  paths[1],
  text(paths[1])
    .split('\n')
    .filter((line) => !line.includes('experimentalRestartPreparation'))
    .join('\n'),
);
const lawBase = execFileSync('git', ['show', base + ':' + paths[3]], {
  encoding: 'utf8',
}).replaceAll('\r\n', '\n');
add(
  paths[3],
  lawBase.replace(
    '    (state.ball.height ?? 0) <= 0.15;',
    `    (state.experimentalRestartPreparation === true && state.scenario === 'throw_in'
      ? Math.abs((state.ball.height ?? 0)-1.9) <= 0.01
      : (state.ball.height ?? 0) <= 0.15);`,
  ),
);
const lifecycleBase = execFileSync('git', ['show', base + ':' + paths[2]], {
  encoding: 'utf8',
}).replaceAll('\r\n', '\n');
const raw = lifecycleBase
  .replace(
    '    const height = Math.max(0, Math.min(0.9, (state.ball.height ?? 0) + (nearSpot ? -1 : 1) * dt));',
    `    const preparingThrow = state.experimentalRestartPreparation === true && state.scenario === 'throw_in';
    // Dead-ball handling already follows a real retriever. A throw also needs the
    // ball lifted from its observed height to the existing 1.9m release envelope.
    // This finite 1.6m/s hand lift is an engineering assumption, not a target delay.
    const height = preparingThrow
      ? Math.min(1.9, (state.ball.height ?? 0) + 1.6 * dt)
      : Math.max(0, Math.min(0.9, (state.ball.height ?? 0) + (nearSpot ? -1 : 1) * dt));`,
  )
  .replace(
    '        velocity: { ...retriever.velocity, z: 0 },',
    '        velocity: { ...retriever.velocity, z: preparingThrow ? (height-(state.ball.height??0))/dt : 0 },',
  )
  .replace('      height <= 0.1 &&', '      (preparingThrow ? height >= 1.9 : height <= 0.1) &&');
add(paths[2], raw);
add(
  paths[2],
  raw.replace(
    '      .filter((p) => p.team === restart.restartTeam && !state.discipline?.[p.id]?.sentOff)',
    "      .filter((p) => p.team === restart.restartTeam && !state.discipline?.[p.id]?.sentOff)\n      .filter((p) => state.experimentalRestartPreparation !== true || state.scenario !== 'throw_in' || p.id === restart.takerId)",
  ),
);
const panel = 'src/app/match/FirstTouchLaboratoryPanel.tsx';
for (const content of [...(candidates.get(panel)?.values() ?? [])]) {
  const noStyles = content
    .replace(/const toggleStyle = \{[\s\S]*?\} as const;\n/, '')
    .replaceAll('<label style={toggleStyle}>', '<label>')
    .replace(/^\s*style=\{\{ width: 'auto' \}\}\r?\n/gm, '');
  add(panel, noStyles);
  if (!content.includes('Impuls x, y, z')) {
    const withImpulse = content
      .replace(
        '                <th>Prędkość przed → po [m/s]</th>',
        '                <th>Prędkość przed → po [m/s]</th>\n                <th>Impuls x, y, z [N·s]</th>',
      )
      .replace(
        '                  <td>{c.recoverySeconds.toFixed(3)}</td>',
        "                  <td>{[c.impulse.x,c.impulse.y,c.impulse.z].map(v=>v.toFixed(3)).join(', ')}</td>\n                  <td>{c.recoverySeconds.toFixed(3)}</td>",
      );
    add(panel, withImpulse);
  }
}
const sandbox = 'src/app/match/TacticalMatchSandbox.tsx';
for (const content of [...(candidates.get(panel)?.values() ?? [])]) {
  if (content.includes('toggleStyle')) continue;
  const styled = content
    .replace(
      /(const length = [^\n]+\n)/,
      "$1const toggleStyle = { display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginRight: '1rem' } as const;\n",
    )
    .replaceAll(
      '            <label>\n              <input\n                type="checkbox"\n',
      '            <label style={toggleStyle}>\n              <input\n                type="checkbox"\n                style={{ width: \'auto\' }}\n',
    );
  add(panel, styled);
}
for (const content of [...(candidates.get(sandbox)?.values() ?? [])])
  add(
    sandbox,
    content.replace(
      'PR191 · Pierwszy kontakt i gra z pierwszej piłki',
      'PR191/192 · Pierwszy kontakt i ruch do piłki',
    ),
  );
for (const [path, values] of candidates)
  for (const content of [...values.values()])
    add(
      path,
      await prettier.format(content, {
        parser: 'typescript',
        singleQuote: true,
        trailingComma: 'all',
        printWidth: 100,
      }),
    );
const receipts = readdirSync(root + '/matches')
  .filter((p) => p.endsWith('.json'))
  .map((p) => readPr192Evidence(root + '/matches/' + p));
const versions = new Map(receipts.map((r) => [r.sourceHash, r.manifest]));
mkdirSync(root + '/source-overlays', { recursive: true });
const index = [];
for (const [sourceHash, manifest] of versions) {
  const overrides = [];
  for (const file of manifest) {
    if (sha(text(file.path)) === file.sha256) continue;
    const content = candidates.get(file.path)?.get(file.sha256);
    if (content === undefined)
      throw Error(
        'Cannot reconstruct recorded source bytes ' +
          sourceHash +
          ' ' +
          file.path +
          ' ' +
          file.sha256,
      );
    overrides.push({ path: file.path, sha256: file.sha256, content });
  }
  let output = `${root}/source-overlays/${sourceHash}.json.gz`;
  const value = JSON.stringify({
    schema: 'mfl-pr192-source-overlay-v1',
    sourceHash,
    provenance:
      'Reconstructed exact recorded source bytes from immutable baseline and retained edits; every file is required to equal the original runtime manifest hash.',
    overrides,
  });
  if (existsSync(output)) {
    if (gunzipSync(readFileSync(output)).toString() !== value)
      output = `${root}/source-overlays/${sourceHash}-${sha(value).slice(0, 12)}.json.gz`;
  }
  if (existsSync(output)) {
    if (gunzipSync(readFileSync(output)).toString() !== value) throw Error('Refusing source drift');
  } else writeFileSync(output, gzipSync(value));
  index.push({ sourceHash, path: output, files: overrides.map((o) => o.path) });
}
writeFileSync(
  root + '/source-versions.json',
  JSON.stringify({ schema: 'mfl-pr192-source-versions-v1', versions: index }, null, 2) + '\n',
);
console.log(index);
