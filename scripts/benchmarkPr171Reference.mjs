/* global fetch, console */
// Explicit research download; never imported by the game or ordinary verification.
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const cache = resolve('../pr171-reference');
mkdirSync(cache, { recursive: true });
const hash = (data) => createHash('sha256').update(data).digest('hex');
const download = process.argv.includes('--download');
const get = async (url, file) => {
  if (!existsSync(file)) {
    if (!download) throw new Error(`Missing ${file}; explicitly pass --download`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 12_000_000) throw new Error('Reference file exceeds research bound');
    writeFileSync(file, bytes);
  }
  return readFileSync(file);
};
const commitFile = resolve(cache, 'commit.json');
const expectedRevision = '4b73468fc5b0f1950f9f66fada70ad3a4f9327cb';
const commit = JSON.parse(
  await get(
    `https://api.github.com/repos/statsbomb/open-data/commits/${expectedRevision}`,
    commitFile,
  ),
).sha;
if (commit !== expectedRevision) throw new Error('Reference cache revision mismatch');
const base = `https://raw.githubusercontent.com/statsbomb/open-data/${commit}`;
const matchesUrl = `${base}/data/matches/43/106.json`;
const matchesBytes = await get(matchesUrl, resolve(cache, 'matches.json'));
const matches = JSON.parse(matchesBytes)
  .filter((m) => m.competition_stage.name === 'Group Stage')
  .sort(
    (a, b) =>
      `${a.match_date} ${a.kick_off}`.localeCompare(`${b.match_date} ${b.kick_off}`) ||
      a.match_id - b.match_id,
  )
  .slice(0, 12);
const rows = [];
for (const match of matches) {
  const url = `${base}/data/events/${match.match_id}.json`;
  const bytes = await get(url, resolve(cache, `${match.match_id}.json`));
  const events = JSON.parse(bytes).filter((e) => e.period <= 2);
  const periods = [1, 2].map((period) =>
    Math.max(
      ...events
        .filter((e) => e.period === period && e.type.name === 'Half End')
        .map((e) => {
          const [h, m, s] = e.timestamp.split(':').map(Number);
          return h * 3600 + m * 60 + s;
        }),
    ),
  );
  const teams = [match.home_team, match.away_team].map((team) => {
    const id = team.home_team_id ?? team.away_team_id;
    const name = team.home_team_name ?? team.away_team_name;
    const own = events.filter((e) => e.team.id === id);
    const passes = own.filter((e) => e.type.name === 'Pass');
    const compatiblePasses = passes.filter((e) => !e.pass.cross);
    const shots = own.filter((e) => e.type.name === 'Shot');
    const counts = {};
    for (const e of shots) counts[e.shot.outcome.name] = (counts[e.shot.outcome.name] ?? 0) + 1;
    return {
      id,
      name,
      passAttempts: passes.length,
      passesWithoutCrosses: compatiblePasses.length,
      completedWithoutCrosses: compatiblePasses.filter((e) => !e.pass.outcome).length,
      throwInsIncluded: passes.filter((e) => e.pass.type?.name === 'Throw-in').length,
      crosses: passes.filter((e) => e.pass.cross).length,
      corners: passes.filter((e) => e.pass.type?.name === 'Corner').length,
      shots: shots.length,
      shotOutcomes: counts,
      goalsFromShots: counts.Goal ?? 0,
      shotsOnTargetConservative:
        (counts.Goal ?? 0) + (counts.Saved ?? 0) + (counts['Saved to Post'] ?? 0),
      secondsElapsed: periods.reduce((a, b) => a + b, 0),
      possessionProviderIds: new Set(
        own.filter((e) => e.possession_team.id === id).map((e) => e.possession),
      ).size,
      positionalReceptions:
        'not comparable: provider Pass recipient is not MFL controlled reception',
      liveBallSeconds: null,
    };
  });
  rows.push({
    matchId: match.match_id,
    date: match.match_date,
    home: match.home_team.home_team_name,
    away: match.away_team.away_team_name,
    url,
    sha256: hash(bytes),
    periodsSeconds: periods,
    teams,
  });
  console.log(`reference ${match.match_id}: ${rows.length}/12`);
}
writeFileSync(
  'docs/performance/PR171-reference-comparison.json',
  JSON.stringify(
    {
      version: 1,
      source: 'StatsBomb Open Data',
      repository: 'https://github.com/statsbomb/open-data',
      commit,
      matchesUrl,
      matchesSha256: hash(matchesBytes),
      retrievedAt: new Date().toISOString(),
      selection:
        "First twelve chronological group-stage matches of men's World Cup 2022; periods 1–2; no selection on outcomes",
      limitations:
        'Elite senior international football, not a U-17 calibration target. No inferred live-ball clock. MFL excludes crosses from passes; comparison excludes provider cross qualifiers. Completion/control and possession-sequence definitions remain partially incompatible. Saved Off Target excluded from on-target. Saved to Post included separately and explicitly.',
      rows,
    },
    null,
    2,
  ),
);
