/* global fetch, console */
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const revision = '4b73468fc5b0f1950f9f66fada70ad3a4f9327cb';
const base = `https://raw.githubusercontent.com/statsbomb/open-data/${revision}`;
const cache = '../pr175-reference-cache';
mkdirSync(cache, { recursive: true });
const hash = (b) => createHash('sha256').update(b).digest('hex');
const get = async (path) => {
  const name = `${cache}/${path.replaceAll('/', '_')}`;
  if (!existsSync(name)) {
    if (!process.argv.includes('--download')) throw new Error(`Missing ${name}; explicit --download required`);
    const response = await fetch(`${base}/${path}`);
    if (!response.ok) throw new Error(`${response.status} ${path}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 12_000_000) throw new Error('Reference research bound exceeded');
    writeFileSync(name, bytes);
  }
  const bytes = readFileSync(name);
  return { bytes, sha256: hash(bytes), url: `${base}/${path}` };
};
const competitions = await get('data/competitions.json');
const inventory = JSON.parse(competitions.bytes);
const matches = await get('data/matches/9/281.json');
const selected = JSON.parse(matches.bytes).sort((a,b) => `${a.match_date} ${a.kick_off}`.localeCompare(`${b.match_date} ${b.kick_off}`) || a.match_id - b.match_id).slice(0, 12);
const rows = [];
for (const match of selected) {
  const source = await get(`data/events/${match.match_id}.json`);
  const events = JSON.parse(source.bytes).filter((e) => e.period === 1 || e.period === 2);
  const periodsSeconds = [1, 2].map((period) => Math.max(...events.filter((e) => e.period === period && e.type.name === 'Half End').map((e) => {
    const [h,m,s] = e.timestamp.split(':').map(Number); return h * 3600 + m * 60 + s;
  })));
  if (!periodsSeconds.every((v) => v > 2600 && v < 4500)) throw new Error('Incomplete or unusual reference period');
  const teams = [match.home_team, match.away_team].map((team) => {
    const id = team.home_team_id ?? team.away_team_id, own = events.filter((e) => e.team.id === id);
    const passes = own.filter((e) => e.type.name === 'Pass'), shots = own.filter((e) => e.type.name === 'Shot');
    const compatible = passes.filter((e) => !e.pass.cross), outcomes = {};
    const cards=own.map((e)=>e.foul_committed?.card?.name??e.bad_behaviour?.card?.name).filter(Boolean);
    for (const s of shots) outcomes[s.shot.outcome.name] = (outcomes[s.shot.outcome.name] ?? 0) + 1;
    return { id, name: team.home_team_name ?? team.away_team_name, passAttempts: passes.length,
      passesWithoutCrosses: compatible.length, completedWithoutCrosses: compatible.filter((e) => !e.pass.outcome).length,
      crosses: passes.filter((e) => e.pass.cross).length, throwInsIncluded: passes.filter((e) => e.pass.type?.name === 'Throw-in').length,
      corners: passes.filter((e) => e.pass.type?.name === 'Corner').length, shots: shots.length, shotOutcomes: outcomes,
      goalsFromShots: outcomes.Goal ?? 0, penalties: shots.filter((e) => e.shot.type.name === 'Penalty').length,
      fouls:own.filter((e)=>e.type.name==='Foul Committed').length,
      yellowCards:cards.filter((c)=>c==='Yellow Card'||c==='Second Yellow').length,
      redCards:cards.filter((c)=>c==='Red Card'||c==='Second Yellow').length,
      shotsOnTargetConservative: (outcomes.Goal ?? 0) + (outcomes.Saved ?? 0) + (outcomes['Saved to Post'] ?? 0),
      goalkeeperPasses: passes.filter((e) => e.position?.name === 'Goalkeeper').length,
      secondsElapsed: periodsSeconds.reduce((a,b) => a+b, 0), liveBallSeconds: null,
      possessionProviderIds: new Set(own.filter((e) => e.possession_team.id === id).map((e) => e.possession)).size };
  });
  rows.push({ matchId: match.match_id, date: match.match_date, periodsSeconds, url: source.url, sha256: source.sha256, teams });
  console.log(`club reference ${rows.length}/12`);
}
writeFileSync('docs/performance/PR175-reference-methodology.json', JSON.stringify({
  version: 1, source: 'StatsBomb Open Data', commit: revision,
  attribution: 'Data: StatsBomb. Research use subject to the repository LICENSE.pdf and README terms; credit provider and its logo. No event dumps redistributed here.',
  readme: `${base}/README.md`, license: `${base}/LICENSE.pdf`, mediaPack: 'https://statsbomb.com/media-pack/',
  providerLogo:'https://static.hudl.com/craft/productAssets/statsbomb_icon.svg',
  providerLogoSource:'https://www.hudl.com/en_gb/products/statsbomb',
  supplementaryClockContext:{provider:'FIFA',published:'2022-11-30',url:'https://vod.fifa.com/refereeing/news/collina-weve-asked-referees-to-calculate-stoppage-time-more-accurately',
    actualPlayingTimeDescription:'nearly 59 minutes on average in matches played by the publication date',approximate:true,
    highestReportedMatchMinutes:67.5,highestMatch:'France–Australia',
    limitation:'Different broader early-tournament sample, unspecified N and no per-match linkage to the frozen twelve. Exact annotation convention not documented here. Context for unusually high MFL live exposure only; never combine these minutes with StatsBomb pass totals to manufacture reference per-live rates.'},
  originalReference: { path: 'docs/performance/PR171-reference-comparison.json', sha256: hash(readFileSync('docs/performance/PR171-reference-comparison.json')), competition: "Men’s World Cup 2022, first twelve chronological group-stage matches, periods 1–2" },
  additionalReference: { competition: 'Men’s Bundesliga 2023/24', competitionId: 9, seasonId: 281,
    selection: 'First 12 chronological available matches; periods 1–2; no score/outcome filtering', matches: { url: matches.url, sha256: matches.sha256 },
    inventory: { url: competitions.url, sha256: competitions.sha256 },
    youthAvailableInPinnedInventory: inventory.filter((c) => c.competition_youth).map((c) => ({ competition: c.competition_name, season: c.season_name })) },
  definitions: { pass: 'MFL released PassDiagnostic IDs include throws/restarts/keeper distribution; exclude crosses and non-shot headers. Reference comparator excludes cross flag, includes throw-ins/restarts.',
    completion: 'MFL actual teammate physical control, StatsBomb no incomplete outcome; deflection/control differences remain.',
    corners: 'MFL official corner awards versus StatsBomb Pass events with Corner type (actual deliveries). Unexecuted end-of-period awards can differ; these are qualified comparisons, not identical event definitions.',
    savesAndBlocks: 'StatsBomb final shot outcomes are compared to final MFL shot diagnostics. MFL official initial save/block contact counters can coexist with a same-shot later goal upgrade; do not treat their sum as mutually exclusive final outcomes.',
    discipline:'Foul Committed events; yellow includes Second Yellow, red includes Second Yellow and Red Card across Foul Committed/Bad Behaviour card fields. Provider/referee event coding may differ from MFL contact law episodes.',
    shot: 'All physical release IDs including penalty/free-kick/header; outcome may upgrade on rebound. Reference all Shot events in periods 1–2.',
    possession: 'Provider possession IDs are not MFL controlled team episodes; do not use them as equivalent rates.',
    per90: 'Count × 5400 / sum of actual period elapsed seconds; per-match and per-team distributions also retained.',
    live: 'No comparable reference live-ball clock; no real-football per-live-minute rates computed.',
    uncertainty: 'Twelve available chronological club games cover two early rounds and repeated teams; descriptive sample, not league or youth calibration target.' },
  rows,
}, null, 2) + '\n');
