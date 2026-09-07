import { clampPitchPoint, PITCH_LENGTH, type PitchPoint, type TeamSide } from './matchSpace';
import { deriveTacticalTargets } from './tacticalPositioning';
import type { RestartScenario, TacticalMatchState } from './matchState';

const scenarioBall: Record<Exclude<RestartScenario, 'open_play'>, PitchPoint> = {
  kick_off: { x: 52.5, y: 34 },
  goal_kick: { x: 5.5, y: 34 },
  gk_short: { x: 7, y: 28 },
  corner: { x: PITCH_LENGTH - 0.5, y: 0.5 },
  free_kick: { x: 72, y: 27 },
  penalty: { x: 94, y: 34 },
};

/** Ephemeral, deterministic debugging setup; it deliberately is not a laws engine. */
export const applyRestartScenario = (
  input: TacticalMatchState,
  scenario: RestartScenario,
): TacticalMatchState => {
  if (scenario === 'open_play') return { ...input, scenario };
  const possessionTeam: TeamSide = 'home';
  const point = scenarioBall[scenario];
  const candidates = input.players.filter((p) => p.team === possessionTeam);
  const owner =
    scenario === 'goal_kick' || scenario === 'gk_short'
      ? candidates.find((p) => p.profile.primaryPosition === 'goalkeeper')!
      : candidates
          .filter((p) => p.profile.primaryPosition !== 'goalkeeper')
          .sort((a, b) => Math.abs(a.position.x - point.x) - Math.abs(b.position.x - point.x))[0]!;
  const setPiece = scenario === 'corner' || scenario === 'free_kick' || scenario === 'penalty';
  const {
    currentAction: _currentAction,
    latestAction: _latestAction,
    currentActorId: _currentActorId,
    ...cleanInput
  } = input;
  void _currentAction;
  void _latestAction;
  void _currentActorId;
  const state: TacticalMatchState = {
    ...cleanInput,
    scenario,
    time: 0,
    decisionIndex: 0,
    possessionTeam,
    timeSincePossessionChanged: 0,
    actionCooldown: 1,
    teams: {
      home: {
        ...input.teams.home,
        phase: setPiece
          ? 'set_piece_attack'
          : scenario === 'kick_off'
            ? 'positional_attack'
            : 'attacking_transition',
        phaseElapsed: 0,
      },
      away: {
        ...input.teams.away,
        phase: setPiece ? 'set_piece_defence' : 'defensive_block',
        phaseElapsed: 0,
      },
    },
    ball: { ...point, ownerId: owner.id },
  };
  state.players = state.players.map((p) => {
    let position = p.neutralAnchor;
    if (scenario === 'corner')
      position = {
        x:
          p.team === 'home'
            ? p.profile.primaryPosition === 'goalkeeper'
              ? 10
              : 78 + p.slotIndex * 1.5
            : 88 + p.slotIndex * 0.7,
        y: 8 + (p.slotIndex % 7) * 8,
      };
    if (scenario === 'penalty')
      position =
        p.id === owner.id
          ? { x: 92, y: 34 }
          : p.profile.primaryPosition === 'goalkeeper' && p.team === 'away'
            ? { x: 104, y: 34 }
            : { x: 82 + (p.slotIndex % 4), y: 15 + (p.slotIndex % 6) * 7 };
    if (p.id === owner.id) position = { ...point };
    return {
      ...p,
      position: clampPitchPoint(position),
      target: clampPitchPoint(position),
      velocity: { x: 0, y: 0 },
    };
  });
  return { ...state, players: deriveTacticalTargets(state) };
};
