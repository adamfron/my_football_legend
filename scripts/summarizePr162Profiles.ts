import { readFileSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import {
  footballerProfileSchema,
  professionalClubSchema,
  playerPositionSchema,
} from '../src/schemas/domainSchemas';
import { getEffectivePositionOverall } from '../src/core/playerOverall';
import { playerRole } from '../src/core/matchSimulation/attackingFunnel';
import type { MatchPlayerState } from '../src/core/matchSimulation/matchState';

const teamSchema = z.object({
  club: professionalClubSchema,
  formation: z.string(),
  strength: z.number(),
  players: z.array(
    z.object({
      footballerId: z.string(),
      profile: footballerProfileSchema,
      condition: z.number(),
      slot: z.object({ position: playerPositionSchema, duty: z.string() }),
    }),
  ),
  bench: z.array(
    z.object({ footballerId: z.string(), profile: footballerProfileSchema, condition: z.number() }),
  ),
});
const input = z
  .object({
    manifest: z.unknown(),
    profiles: z.record(
      z.string(),
      z.object({
        home: teamSchema,
        away: teamSchema,
        tactics: z.unknown(),
      }),
    ),
  })
  .parse(JSON.parse(readFileSync('../PR162-clubs-v3.json', 'utf8')));
const teams = new Map<string, z.infer<typeof teamSchema>>();
for (const profile of Object.values(input.profiles))
  for (const side of ['home', 'away'] as const) teams.set(profile[side].club.id, profile[side]);
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
const outputs = [...teams.values()].map((team) => {
  const group = (position: string) => playerRole({ slot: { position } } as MatchPlayerState);
  const groups = [...new Set(team.players.map((p) => group(p.slot.position)))].map((role) => {
    const players = team.players.filter((p) => group(p.slot.position) === role);
    return {
      role,
      count: players.length,
      effectiveOverall: mean(
        players.map((p) => getEffectivePositionOverall(p.profile, p.slot.position)),
      ),
      attributes: Object.fromEntries(
        Object.keys(players[0]!.profile.attributes).map((key) => [
          key,
          mean(players.map((p) => p.profile.attributes[key as keyof typeof p.profile.attributes])),
        ]),
      ),
      meanCondition: mean(players.map((p) => p.condition)),
      identities: players.map((p) => p.footballerId),
    };
  });
  return {
    clubId: team.club.id,
    name: team.club.name,
    headlineRating: team.club.strengthRating,
    selectedXIRating: team.strength,
    formation: team.formation,
    managerId: team.club.managerId,
    clubStyle: team.club.playingStyle,
    meanCondition: mean(team.players.map((p) => p.condition)),
    groups,
    benchCount: team.bench.length,
    benchMeanCondition: mean(team.bench.map((p) => p.condition)),
    benchIdentities: team.bench.map((p) => p.footballerId),
  };
});
writeFileSync(
  'docs/performance/PR162-club-profiles.json',
  JSON.stringify(
    {
      manifest: input.manifest,
      methodology:
        'Exact selected XI and bench. Role overall uses canonical positional familiarity; every attribute mean is retained. Club style and actual team tactics remain separately recorded.',
      teams: outputs,
    },
    null,
    2,
  ) + '\n',
);
console.info(
  outputs.map((team) => ({
    name: team.name,
    headline: team.headlineRating,
    xi: team.selectedXIRating,
    groups: team.groups.map((g) => ({ role: g.role, overall: g.effectiveOverall })),
    bench: team.benchCount,
  })),
);
