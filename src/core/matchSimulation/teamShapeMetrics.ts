import { z } from 'zod';
import { distance, pitchPointSchema, type PitchPoint, type TeamSide } from './matchSpace';
import type { TacticalMatchState } from './matchState';

const lineMetricsSchema = z.object({
  defensiveLine: z.number(), midfieldLine: z.number(), attackingLine: z.number(),
  defenceToMidfield: z.number(), midfieldToAttack: z.number(),
});
const laneOccupancySchema = z.object({
  leftWide: z.number().int(), leftHalfSpace: z.number().int(), centre: z.number().int(),
  rightHalfSpace: z.number().int(), rightWide: z.number().int(), occupied: z.number().int(),
});
export const teamShapeMetricsSchema = z.object({
  centroid: pitchPointSchema, width: z.number(), length: z.number(), convexHullArea: z.number(),
  stretchIndex: z.number(), defensiveLine: z.number(), attackingLine: z.number(),
  playersAheadOfBall: z.number().int(), playersBehindBall: z.number().int(),
  lines: lineMetricsSchema, lanes: laneOccupancySchema, attackingWidth: z.number(),
  weakSideWidth: z.number(), duplicateSpaces: z.number().int(), restDefenceCount: z.number().int(),
  restDefenceCentral: z.number().int(), boxAttackers: z.number().int(), boxDefenders: z.number().int(),
  penaltySpotAttackers: z.number().int(), farPostAttackers: z.number().int(),
  edgeOfBoxSupport: z.number().int(), attackersOutsideBox: z.number().int(),
});
export type TeamShapeMetrics = z.infer<typeof teamShapeMetricsSchema>;

export const playerSupportMetricsSchema = z.object({
  nearestSupportDistance: z.number(), secondSupportDistance: z.number(), nearestOpponentDistance: z.number(),
  teammatesInSupportRadius: z.number().int(), passingSupportAngle: z.number(), forwardPassingOptions: z.number().int(),
});
export type PlayerSupportMetrics = z.infer<typeof playerSupportMetricsSchema>;

const role = (position: string) => position === 'goalkeeper' ? 'goalkeeper' :
  position.includes('back') || position.includes('defender') ? 'defence' :
    position.includes('midfielder') || position.includes('winger') ? 'midfield' : 'attack';
const average = (values: number[], fallback: number) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : fallback;
const hullArea = (points: PitchPoint[]) => {
  if (points.length < 3) return 0;
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: PitchPoint, a: PitchPoint, b: PitchPoint) => (a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);
  const half = (values: PitchPoint[]) => { const out: PitchPoint[] = []; for (const p of values) { while(out.length >= 2 && cross(out.at(-2)!, out.at(-1)!, p) <= 0) out.pop(); out.push(p); } return out; };
  const hull = [...half(sorted).slice(0,-1), ...half([...sorted].reverse()).slice(0,-1)];
  return Math.abs(hull.reduce((sum,p,i) => sum + p.x*hull[(i+1)%hull.length]!.y-p.y*hull[(i+1)%hull.length]!.x,0))/2;
};

/** Pure observation of canonical coordinates. Goalkeepers are excluded from shape/hull/lines. */
export const deriveTeamShapeMetrics = (state: TacticalMatchState, side: TeamSide): TeamShapeMetrics => {
  const outfield = state.players.filter(p => p.team === side && role(p.profile.primaryPosition) !== 'goalkeeper');
  const opponents = state.players.filter(p => p.team !== side);
  const xs = outfield.map(p=>p.position.x), ys = outfield.map(p=>p.position.y);
  const centroid = { x: average(xs, 52.5), y: average(ys, 34) };
  const dir = side === 'home' ? 1 : -1;
  const relativeDepth = (x:number) => dir * (x - 52.5);
  const byRole = (name:string) => outfield.filter(p=>role(p.profile.primaryPosition)===name).map(p=>relativeDepth(p.position.x));
  const depths=xs.map(relativeDepth);
  const def = average(byRole('defence'), depths.length ? Math.min(...depths) : 0);
  const mid = average(byRole('midfield'), average(xs.map(relativeDepth),0));
  const att = average(byRole('attack'), depths.length ? Math.max(...depths) : 0);
  const laneCounts = [0,0,0,0,0];
  for (const p of outfield) laneCounts[Math.min(4, Math.floor(p.position.y / (68/5)))]! += 1;
  const advanced = outfield.filter(p => relativeDepth(p.position.x) >= relativeDepth(state.ball.x)-8);
  const attackingYs = advanced.map(p=>p.position.y);
  const attackingBox = side === 'home' ? (p:PitchPoint)=>p.x>=88.5 : (p:PitchPoint)=>p.x<=16.5;
  const defendingBox = side === 'home' ? (p:PitchPoint)=>p.x<=16.5 : (p:PitchPoint)=>p.x>=88.5;
  const spotX = side === 'home' ? 94 : 11;
  const metrics = {
    centroid, length: xs.length ? Math.max(...xs)-Math.min(...xs) : 0, width: ys.length ? Math.max(...ys)-Math.min(...ys) : 0,
    convexHullArea: hullArea(outfield.map(p=>p.position)), stretchIndex: average(outfield.map(p=>distance(p.position,centroid)),0),
    defensiveLine:def, attackingLine:att, playersAheadOfBall:outfield.filter(p=>relativeDepth(p.position.x)>relativeDepth(state.ball.x)).length,
    playersBehindBall:outfield.filter(p=>relativeDepth(p.position.x)<relativeDepth(state.ball.x)).length,
    lines:{ defensiveLine:def, midfieldLine:mid, attackingLine:att, defenceToMidfield:Math.abs(mid-def), midfieldToAttack:Math.abs(att-mid) },
    lanes:{leftWide:laneCounts[0]!,leftHalfSpace:laneCounts[1]!,centre:laneCounts[2]!,rightHalfSpace:laneCounts[3]!,rightWide:laneCounts[4]!,occupied:laneCounts.filter(Boolean).length},
    attackingWidth: attackingYs.length ? Math.max(...attackingYs)-Math.min(...attackingYs):0,
    weakSideWidth: attackingYs.length ? Math.max(...attackingYs.map(y=>Math.abs(y-state.ball.y))):0,
    duplicateSpaces: outfield.filter((p,i)=>outfield.slice(0,i).some(q=>Math.abs(p.position.x-q.position.x)<3 && Math.abs(p.position.y-q.position.y)<3)).length,
    restDefenceCount:outfield.filter(p=>relativeDepth(p.position.x)<relativeDepth(state.ball.x)-12).length,
    restDefenceCentral:outfield.filter(p=>relativeDepth(p.position.x)<relativeDepth(state.ball.x)-12 && p.position.y>=20 && p.position.y<=48).length,
    boxAttackers:outfield.filter(p=>attackingBox(p.position)).length, boxDefenders:opponents.filter(p=>attackingBox(p.position)).length,
    penaltySpotAttackers:outfield.filter(p=>attackingBox(p.position)&&Math.abs(p.position.x-spotX)<=5&&Math.abs(p.position.y-34)<=7).length,
    farPostAttackers:outfield.filter(p=>attackingBox(p.position)&&Math.abs(p.position.y-(state.ball.y<34?48:20))<=8).length,
    edgeOfBoxSupport:outfield.filter(p=>!attackingBox(p.position)&&Math.abs(p.position.x-(side==='home'?86:19))<=5&&Math.abs(p.position.y-34)<=20).length,
    attackersOutsideBox:outfield.filter(p=>!attackingBox(p.position)&&relativeDepth(p.position.x)>15).length,
  };
  void defendingBox;
  return teamShapeMetricsSchema.parse(metrics);
};

export const derivePlayerSupportMetrics = (state:TacticalMatchState, playerId:string):PlayerSupportMetrics => {
  const actor=state.players.find(p=>p.id===playerId); if(!actor) return {nearestSupportDistance:0,secondSupportDistance:0,nearestOpponentDistance:0,teammatesInSupportRadius:0,passingSupportAngle:0,forwardPassingOptions:0};
  const mates=state.players.filter(p=>p.team===actor.team&&p.id!==actor.id).map(p=>({p,d:distance(actor.position,p.position)})).sort((a,b)=>a.d-b.d);
  const foes=state.players.filter(p=>p.team!==actor.team).map(p=>distance(actor.position,p.position)).sort((a,b)=>a-b);
  const nearest=mates[0]?.p.position; const ballAngle=Math.atan2(state.ball.y-actor.position.y,state.ball.x-actor.position.x); const supportAngle=nearest?Math.abs(Math.atan2(nearest.y-actor.position.y,nearest.x-actor.position.x)-ballAngle):0;
  const dir=actor.team==='home'?1:-1;
  return playerSupportMetricsSchema.parse({nearestSupportDistance:mates[0]?.d??0,secondSupportDistance:mates[1]?.d??0,nearestOpponentDistance:foes[0]??0,teammatesInSupportRadius:mates.filter(x=>x.d<=15).length,passingSupportAngle:Math.min(Math.PI*2-supportAngle,supportAngle),forwardPassingOptions:mates.filter(x=>dir*(x.p.position.x-actor.position.x)>5&&x.d<=35).length});
};
