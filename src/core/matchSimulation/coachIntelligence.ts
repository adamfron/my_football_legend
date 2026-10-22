import { z } from 'zod';
import type { CoachProfile } from '../../types/domain';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { attacksRight, type TeamSide } from './matchSpace';
import { canParticipatePhysically } from './matchInjuries';
import { isMatchGoalkeeper } from './matchGoalkeeper';
import { deriveCanonicalCoachProfile } from '../coachProfiles';
import { getEffectivePositionOverall } from '../playerOverall';
import {
  assignTacticalRoles,
  changeTacticalRole,
  rolesForPlayer,
  tacticalRoleFor,
  type TacticalRoleId,
} from './tacticalRoles';
import { TACTICAL_PREFERENCE_DEFAULTS, tacticalPreferencesSchema } from './tacticalPreferences';

const unit = z.number().min(0).max(1);
export const coachPlanSchema = z.enum([
  'balanced',
  'exploit_space',
  'protect_flank',
  'open_low_block',
  'switch_route',
  'protect_lead',
  'chase_goal',
  'reorganise',
]);
export const coachDecisionSchema = z.object({
  at: z.number().nonnegative(),
  trigger: z.enum(['interval', 'half_time', 'dismissal']),
  problem: z.string(),
  chosen: coachPlanSchema,
  changed: z.boolean(),
  channel: z.number().int().min(0).max(2).optional(),
  evidence: z.record(z.string(), z.number().finite()),
  roles: z.array(z.object({ playerId: z.string(), from: z.string(), to: z.string() })).max(4),
  before: tacticalPreferencesSchema,
  after: tacticalPreferencesSchema,
});
export const coachIntelligenceSchema = z.object({
  observedAt: z.number().nonnegative(),
  assessedAt: z.number().nonnegative(),
  changedAt: z.number().nonnegative(),
  samples: z.number().min(0).max(60),
  lineSpace: z.number().min(0).max(105),
  lowBlock: unit,
  plan: coachPlanSchema,
  channel: z.number().int().min(0).max(2).optional(),
  basePreferences: tacticalPreferencesSchema,
  roster: z.string(),
  halftimeReviewed: z.boolean(),
  decisions: z.array(coachDecisionSchema).max(48),
});
export type CoachIntelligence = z.infer<typeof coachIntelligenceSchema>;
export type CoachDecision = z.infer<typeof coachDecisionSchema>;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const available = (s: TacticalMatchState, p: MatchPlayerState) =>
  canParticipatePhysically(p) && !s.discipline?.[p.id]?.sentOff;
const other = (side: TeamSide) => (side === 'home' ? 'away' : 'home');
const rosterKey = (state: TacticalMatchState, side: TeamSide) =>
  state.players
    .filter((p) => p.team === side && available(state, p))
    .map((p) => p.id)
    .sort()
    .join('|');
export const matchCoach = (state: TacticalMatchState, side: TeamSide): CoachProfile =>
  state.teams[side].coach ?? deriveCanonicalCoachProfile(state.teams[side].clubId);

export const initialiseCoachIntelligence = (state: TacticalMatchState): TacticalMatchState => {
  const teams = { ...state.teams };
  for (const side of ['home', 'away'] as const) {
    if (teams[side].coaching) continue;
    teams[side] = {
      ...teams[side],
      coaching: {
        observedAt: state.time,
        assessedAt: state.time,
        changedAt: state.time,
        samples: 0,
        lineSpace: 30,
        lowBlock: 0,
        plan: 'balanced',
        basePreferences: {
          ...(teams[side].tacticalPreferences ?? TACTICAL_PREFERENCE_DEFAULTS[teams[side].style]),
        },
        roster: rosterKey(state, side),
        halftimeReviewed: false,
        decisions: [],
      },
    };
  }
  return { ...state, teams };
};

/** Five-second public-position samples, not access to the opponent's instructions,
 * attribute sheet, action ranking or random stream. Forgetting follows match time.
 * A moved defensive line replaces old evidence gradually; setup supplies no samples. */
export const observeCoachOpposition = (state: TacticalMatchState): TacticalMatchState => {
  let teams = state.teams;
  for (const side of ['home', 'away'] as const) {
    const memory = teams[side].coaching;
    if (!memory || state.time - memory.observedAt < 5 - 1e-9) continue;
    const dt = state.time - memory.observedAt;
    const decay = Math.pow(0.5, dt / 180);
    const live = !state.restart && !state.postGoal && state.scenario === 'open_play';
    const defenders = state.players.filter(
      (p) => p.team !== side && available(state, p) && !isMatchGoalkeeper(p),
    );
    const dir = attacksRight(state.teams[side]) ? 1 : -1;
    const depths = defenders
      .map((p) => (dir > 0 ? p.position.x : 105 - p.position.x))
      .sort((a, b) => b - a);
    const space = 105 - (depths[1] ?? 75);
    const count = memory.samples * decay;
    const alpha = live ? 1 / (1 + Math.min(11, count)) : 0;
    const low =
      live &&
      defenders.filter((p) => (dir > 0 ? p.position.x : 105 - p.position.x) > 72).length >= 7
        ? 1
        : 0;
    if (teams === state.teams) teams = { ...teams };
    teams[side] = {
      ...teams[side],
      coaching: {
        ...memory,
        observedAt: state.time,
        samples: Math.min(60, count + (live ? 1 : 0)),
        lineSpace: memory.lineSpace + (space - memory.lineSpace) * alpha,
        lowBlock: memory.lowBlock * (live ? 1 - alpha : decay) + low * alpha,
      },
    };
  }
  return teams === state.teams ? state : { ...state, teams };
};

/** Deliberately leaving a wide berth is preferable to an arbitrary hole in central
 * defence. Reassign the best eligible wide player to a vacant central slot; only
 * future destinations change. Goalkeeper succession remains the canonical law. */
const reorganise = (input: TacticalMatchState, side: TeamSide) => {
  let state = input;
  const own = state.players.filter((p) => p.team === side && available(state, p));
  const vacancies = [...state.players, ...(state.departedPlayers ?? [])].filter(
    (p) =>
      p.team === side &&
      state.discipline?.[p.id]?.sentOff &&
      ['center_back', 'central_midfielder'].includes(p.slot.position) &&
      !own.some((a) => a.slotIndex === p.slotIndex),
  );
  for (const vacancy of vacancies) {
    const replacement = own
      .filter(
        (p) =>
          !isMatchGoalkeeper(p) &&
          (p.slot.position.includes('winger') ||
            p.slot.position === 'striker' ||
            (p.slot.position.includes('back') && p.slot.position !== 'center_back')),
      )
      .sort(
        (a, b) =>
          getEffectivePositionOverall(b.profile, vacancy.slot.position) -
            getEffectivePositionOverall(a.profile, vacancy.slot.position) ||
          a.id.localeCompare(b.id),
      )[0];
    if (!replacement) continue;
    const moved = {
      ...replacement,
      slot: { ...vacancy.slot },
      slotIndex: vacancy.slotIndex,
      duty: vacancy.duty,
      anchor: { ...vacancy.neutralAnchor },
      neutralAnchor: { ...vacancy.neutralAnchor },
      target: { ...vacancy.neutralAnchor },
      idealTarget: { ...vacancy.neutralAnchor },
    };
    state = { ...state, players: state.players.map((p) => (p.id === moved.id ? moved : p)) };
    own.splice(
      own.findIndex((p) => p.id === moved.id),
      1,
      moved,
    );
  }
  return state;
};

/** Sparse strategic decisions; threat memory already measures actual entries,
 * isolation, line exposure and unsuccessful attacking routes by channel. */
export const assessCoachTactics = (
  input: TacticalMatchState,
  halftime = false,
  structuralReview = false,
): TacticalMatchState => {
  let state =
    input.teams.home.coaching && input.teams.away.coaching
      ? input
      : initialiseCoachIntelligence(input);
  for (const side of ['home', 'away'] as const) {
    const memory = state.teams[side].coaching!;
    const coach = matchCoach(state, side);
    if (
      !halftime &&
      !structuralReview &&
      state.time - memory.assessedAt < 45 + (100 - coach.adaptability) * 0.6
    )
      continue;
    const roster = rosterKey(state, side);
    const dismissal =
      roster !== memory.roster &&
      state.players.some((p) => p.team === side && state.discipline?.[p.id]?.sentOff);
    if (halftime && memory.halftimeReviewed) continue;
    if (
      !halftime &&
      !dismissal &&
      state.time - memory.assessedAt < 45 + (100 - coach.adaptability) * 0.6
    )
      continue;
    const own = state.players.filter((p) => p.team === side && available(state, p));
    const threat = state.teams[side].threatMemory;
    const exposure = [0, 1, 2].map(
      (c) =>
        (threat?.lineExposures[c] ?? 0) +
        (threat?.isolation[c] ?? 0) +
        (threat?.channelEntries[c] ?? 0) * 0.5,
    );
    const channel = exposure[0]! >= exposure[2]! ? 0 : 2;
    const failures = threat?.attackFailures ?? [0, 0, 0];
    const failedChannel = failures.indexOf(Math.max(...failures));
    const lead = state.score[side] - state.score[other(side)];
    const confidence = memory.samples / (memory.samples + 8);
    const wingers = own.filter((p) => p.slot.position.includes('winger'));
    const fastest = [...wingers].sort(
      (a, b) => b.profile.attributes.pace - a.profile.attributes.pace || a.id.localeCompare(b.id),
    )[0];
    let chosen: CoachDecision['chosen'] = 'balanced',
      problem = 'No supported improvement over the current plan';
    let selectedChannel: number | undefined;
    if (dismissal) {
      chosen = 'reorganise';
      problem = 'Dismissal removed a structural responsibility';
    } else if (lead > 0 && state.time >= 3600) {
      chosen = 'protect_lead';
      problem = 'Preserve defensive balance and one running outlet';
    } else if (lead < 0 && state.time >= 3300) {
      chosen = 'chase_goal';
      problem = 'Accept exposure to create an equalising opportunity';
    } else if (exposure[channel]! > 3.5 + (100 - coach.adaptability) / 60) {
      chosen = 'protect_flank';
      selectedChannel = channel;
      problem = 'Repeated observed entries and exposed covering defenders';
    } else if (Math.max(...failures) > 2.5 && (threat?.qualifyingAttacks ?? 0) >= 3) {
      chosen =
        memory.plan === 'exploit_space' || memory.plan === 'open_low_block'
          ? 'switch_route'
          : 'open_low_block';
      selectedChannel = failedChannel === 0 ? 2 : 0;
      problem = 'Repeated attacking routes failed to retain meaningful progression';
    } else if (confidence > 0.5 && memory.lowBlock > 0.6) {
      chosen = 'open_low_block';
      problem = 'Observed compact low block; seek complementary width and support';
    } else if (
      confidence > 0.5 &&
      memory.lineSpace > 28 &&
      fastest &&
      fastest.profile.attributes.pace >= 65
    ) {
      chosen = 'exploit_space';
      selectedChannel = fastest.neutralAnchor.y < 34 ? 0 : 2;
      problem = 'Available pace and repeatedly observed space behind the line';
    }
    const canChange =
      dismissal || halftime || state.time - memory.changedAt >= 150 + (100 - coach.adaptability);
    const wantsChange =
      chosen !== 'balanced' && (chosen !== memory.plan || selectedChannel !== memory.channel);
    const before = { ...(state.teams[side].tacticalPreferences ?? memory.basePreferences) };
    const roles: CoachDecision['roles'] = [];
    let after = before;
    const setRole = (player: MatchPlayerState | undefined, id: TacticalRoleId) => {
      if (
        !player ||
        roles.length >= 4 ||
        (state.rolePlan?.changes.length ?? 0) >= 64 ||
        !rolesForPlayer(player).some((r) => r.id === id)
      )
        return;
      const from = tacticalRoleFor(state, player).id;
      if (from === id) return;
      state = changeTacticalRole(state, player.id, id, 'coach');
      roles.push({ playerId: player.id, from, to: id });
    };
    if (wantsChange && canChange) {
      const base = memory.basePreferences;
      after = { ...base };
      const striker = own.find((p) => p.slot.position === 'striker');
      const fullbacks = own.filter(
        (p) => p.slot.position.includes('back') && p.slot.position !== 'center_back',
      );
      const mids = own.filter((p) => p.slot.position === 'central_midfielder');
      if (chosen === 'reorganise') {
        state = reorganise(state, side);
        state = { ...state, rolePlan: state.rolePlan ?? assignTacticalRoles(state) };
        setRole(
          state.players.find(
            (p) => p.team === side && available(state, p) && p.slot.position === 'center_back',
          ),
          'covering_defender',
        );
        after.organisedPress = clamp(base.organisedPress - 0.16);
        after.blockHeight = clamp(base.blockHeight - 0.1);
      }
      if (chosen === 'exploit_space') {
        setRole(fastest, 'traditional_winger');
        setRole(
          striker,
          striker && striker.profile.attributes.pace >= 65 ? 'advanced_forward' : 'target_forward',
        );
        after.verticality = clamp(base.verticality + 0.18);
        after.possessionPatience = clamp(base.possessionPatience - 0.12);
      }
      if (chosen === 'protect_flank') {
        const y = selectedChannel === 0 ? 8 : 60;
        const nearest = (players: MatchPlayerState[]) =>
          [...players].sort(
            (a, b) =>
              Math.abs(a.neutralAnchor.y - y) - Math.abs(b.neutralAnchor.y - y) ||
              a.id.localeCompare(b.id),
          )[0];
        setRole(nearest(fullbacks), 'defensive_fullback');
        setRole(nearest(wingers), 'defensive_winger');
        after.blockHeight = clamp(base.blockHeight - 0.12);
        after.organisedPress = clamp(base.organisedPress - 0.08);
      }
      if (chosen === 'open_low_block' || chosen === 'switch_route') {
        const wide =
          selectedChannel === undefined
            ? (fastest ?? wingers[0])
            : wingers.find((p) => (p.neutralAnchor.y < 34 ? 0 : 2) === selectedChannel);
        setRole(wide, 'traditional_winger');
        const fullback = fullbacks.find(
          (p) => wide && Math.abs(p.neutralAnchor.y - wide.neutralAnchor.y) < 15,
        );
        if (own.filter((p) => tacticalRoleFor(state, p).instructions.includes('cover')).length >= 3)
          setRole(fullback, 'attacking_fullback');
        setRole(
          striker,
          striker &&
            (striker.profile.attributes.heading + striker.profile.attributes.strength) / 2 >= 65
            ? 'target_forward'
            : 'false_nine',
        );
        setRole(
          mids.find((p) => p.duty !== 'defend'),
          'mezzala',
        );
        after.compactness = clamp(base.compactness - 0.1);
        after.verticality = clamp(base.verticality + 0.08);
      }
      if (chosen === 'protect_lead' || chosen === 'chase_goal') {
        const protecting = chosen === 'protect_lead';
        for (const p of fullbacks)
          setRole(p, protecting ? 'defensive_fullback' : 'attacking_fullback');
        setRole(
          mids.find((p) => p.duty === 'defend') ?? mids[0],
          protecting ? 'deep_playmaker' : 'box_to_box',
        );
        setRole(fastest ?? striker, fastest ? 'traditional_winger' : 'advanced_forward');
        after.blockHeight = clamp(base.blockHeight + (protecting ? -0.12 : 0.1));
        after.organisedPress = clamp(base.organisedPress + (protecting ? -0.12 : 0.12));
        after.verticality = clamp(base.verticality + (protecting ? 0.06 : 0.16));
      }
    }
    const changed =
      wantsChange &&
      canChange &&
      (roles.length > 0 || JSON.stringify(before) !== JSON.stringify(after) || dismissal);
    const decision: CoachDecision = {
      at: state.time,
      trigger: dismissal ? 'dismissal' : halftime ? 'half_time' : 'interval',
      problem: wantsChange && !canChange ? 'Allow the current change time to develop' : problem,
      chosen: changed ? chosen : memory.plan,
      changed,
      ...(selectedChannel !== undefined ? { channel: selectedChannel } : {}),
      evidence: {
        samples: memory.samples,
        confidence,
        lineSpace: memory.lineSpace,
        lowBlock: memory.lowBlock,
        flankExposure: exposure[channel]!,
        attackingFailures: Math.max(...failures),
        scoreLead: lead,
        players: own.length,
      },
      roles,
      before,
      after,
    };
    state = {
      ...state,
      teams: {
        ...state.teams,
        [side]: {
          ...state.teams[side],
          tacticalPreferences: after,
          coaching: {
            ...memory,
            assessedAt: state.time,
            roster,
            halftimeReviewed: memory.halftimeReviewed || halftime,
            ...(changed ? { plan: chosen, channel: selectedChannel, changedAt: state.time } : {}),
            decisions: [...memory.decisions, decision].slice(-48),
          },
        },
      },
    };
    if (changed) {
      const { decisionReadiness: stale, ...rest } = state;
      void stale;
      state = rest;
    }
  }
  return state;
};
