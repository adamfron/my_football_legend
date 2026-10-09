import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import { createTacticalMatch, FIXED_MATCH_DT, stepTacticalMatch } from './matchSimulation';
import {
  canExecuteCanonicalShot,
  deriveShotExecutionProfile,
  enumerateCanonicalShootingOptions,
  incomingShotContact,
  enumerateFreeKickStrikeProfiles,
  findFreeKickWallGapTarget,
  isFreeKickWallGapTarget,
} from './shootingOptions';
import {
  chooseIncomingShotAction,
  enumerateAvailableActions,
  rankAvailableActionsForAI,
  resolveMatchAction,
} from './matchActions';
import { projectContextualInteractions } from './contextualInteractions';
import { projectPlayerDecisionOpportunity } from './playerDecision';
import { BALL_RADIUS } from './ballFlight';
import { projectFutureBallTrajectory } from './ballPhysics';
import {
  createMatchFlowTelemetry,
  observeMatchFlow,
  summarizeShootingStyles,
} from './matchFlowTelemetry';
import { matchActionSchema, shotDiagnosticSchema, type MatchAction } from './matchState';

const world = createCanonicalWorldDatabase();
const fixture = (seed = 'pr144-shooting') => {
  const state = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed,
      control: { mode: 'spectator' },
    }),
  );
  const shooter = state.players.find(
    (player) => player.team === 'home' && player.profile.primaryPosition === 'striker',
  )!;
  for (const player of state.players) {
    player.position = { x: player.team === 'home' ? 52 : 45, y: 8 };
    player.velocity = { x: 0, y: 0 };
  }
  const keeper = state.players.find(
    (player) => player.team === 'away' && player.profile.primaryPosition === 'goalkeeper',
  )!;
  keeper.position = { x: 103, y: 34 };
  shooter.position = { x: 91, y: 34 };
  shooter.target = { ...shooter.position };
  shooter.facingAngle = Math.PI / 2;
  Object.assign(shooter.profile.attributes, {
    finishing: 90,
    technique: 90,
    composure: 90,
    firstTouch: 90,
    agility: 90,
  });
  state.ball = { ...shooter.position, ownerId: shooter.id, height: BALL_RADIUS };
  state.scenario = 'open_play';
  state.currentPressure = 0;
  state.actionCooldown = 0;
  return { state, shooter, keeper };
};

describe('PR159 geometry-derived free-kick profiles', () => {
  const freeKick = () => {
    const { state, shooter } = fixture('pr159-wall-options');
    shooter.position = { x: 83, y: 34 };
    state.ball = { ...shooter.position, ownerId: shooter.id, height: BALL_RADIUS };
    state.scenario = 'free_kick_close';
    state.restart = {
      phase: 'setup',
      restartTeam: 'home',
      startedAt: 0,
      takerId: shooter.id,
      targets: {},
      executionChoices: ['direct_shot'],
      roles: {},
    };
    const wall = state.players
      .filter((player) => player.team === 'away' && player.profile.primaryPosition !== 'goalkeeper')
      .slice(0, 2);
    wall.forEach((player, index) => {
      player.position = { x: 92.15, y: 34 + (index === 0 ? -0.3 : 0.3) };
      player.profile.attributes.jumping = 70;
      state.restart!.roles[player.id] = {
        key: 'wall',
        intent: 'protect_zone',
        zone: { centre: player.position, radius: 0.5, timing: 0 },
      };
    });
    return { state, shooter, wall };
  };
  it('offers under-wall risk without ordering a jump, and hides physically impossible gaps', () => {
    const { state, shooter, wall } = freeKick();
    const before = structuredClone(state);
    const profiles = enumerateFreeKickStrikeProfiles(state, shooter.id);
    expect(profiles).toContain('under_wall');
    expect(profiles).not.toContain('wall_gap');
    expect(state).toEqual(before);
    wall[0]!.position.y = 33.4;
    wall[1]!.position.y = 34.6;
    expect(enumerateFreeKickStrikeProfiles(state, shooter.id)).toContain('wall_gap');
    expect(findFreeKickWallGapTarget(state, shooter.id)?.horizontal).toBeCloseTo(0);
    expect(isFreeKickWallGapTarget(state, shooter.id, { horizontal: 1, vertical: 0.04 })).toBe(
      false,
    );
    expect(wall.every((player) => player.restartWallResponse === undefined)).toBe(true);
  });
  it('does not offer spin profiles for indirect restarts or high under-wall targets', () => {
    const { state, shooter } = freeKick();
    expect(
      enumerateFreeKickStrikeProfiles(state, shooter.id, { horizontal: 0, vertical: 0.6 }),
    ).not.toContain('under_wall');
    state.restart!.indirect = true;
    expect(enumerateFreeKickStrikeProfiles(state, shooter.id)).toEqual([]);
  });
  it('keeps legally direct keeper goal-kick attempts beyond open-play range available', () => {
    const { state } = fixture('pr159-keeper-direct');
    const keeper = state.players.find(
      (player) => player.team === 'home' && player.profile.primaryPosition === 'goalkeeper',
    )!;
    keeper.position = { x: 5.5, y: 34 };
    state.ball = { ...keeper.position, ownerId: keeper.id };
    state.scenario = 'goal_kick';
    state.restart = {
      phase: 'setup',
      restartTeam: 'home',
      startedAt: 0,
      takerId: keeper.id,
      targets: {},
      roles: {},
      executionChoices: ['direct_shot'],
    };
    const actions = enumerateCanonicalShootingOptions(state, keeper.id);
    expect(actions.some((action) => action.type === 'shot' && action.intent === 'driven')).toBe(
      true,
    );
    expect(
      canExecuteCanonicalShot(
        state,
        actions.find((action) => action.type === 'shot')! as Extract<MatchAction, { type: 'shot' }>,
      ),
    ).toBe(true);
    delete state.restart;
    state.scenario = 'open_play';
    expect(enumerateCanonicalShootingOptions(state, keeper.id)).toEqual([]);
  });
  it('retains a penalty chip without requiring the keeper to leave the goal line', () => {
    const { state, shooter, keeper } = fixture('pr159-penalty-chip');
    shooter.position = { x: 94, y: 34 };
    keeper.position = { x: 105, y: 34 };
    state.ball = { ...shooter.position, ownerId: shooter.id };
    const defender = state.players.find(
      (player) => player.team !== shooter.team && player.id !== keeper.id,
    )!;
    defender.position = { x: 93, y: 34 };
    expect(
      enumerateCanonicalShootingOptions(state, shooter.id).some(
        (action) => action.type === 'shot' && action.intent === 'chip',
      ),
    ).toBe(false);
    state.scenario = 'penalty';
    state.restart = {
      phase: 'setup',
      restartTeam: 'home',
      startedAt: 0,
      takerId: shooter.id,
      targets: {},
      roles: {},
      executionChoices: ['direct_shot'],
    };
    expect(
      enumerateCanonicalShootingOptions(state, shooter.id).some(
        (action) => action.type === 'shot' && action.intent === 'chip',
      ),
    ).toBe(true);
  });
});
const incomingFixture = (height = BALL_RADIUS, bounceCount = 0, beforeArrival = false) => {
  const setup = fixture();
  const passer = setup.state.players.find(
    (player) => player.team === 'home' && player.id !== setup.shooter.id,
  )!;
  setup.state.ball = {
    x: setup.shooter.position.x - (beforeArrival ? 5 : 0.55),
    y: 34,
    height,
    from: { x: 84, y: 34 },
    target: { ...setup.shooter.position },
    velocity: { x: 12, y: 0, z: 0 },
    airborne: height > BALL_RADIUS,
    bounceCount,
    intendedReceiverId: setup.shooter.id,
    lastTouchPlayerId: passer.id,
    travelKind: 'cross',
    sourceAction: 'cross',
  };
  setup.state.currentActorId = passer.id;
  return setup;
};
const shotFamily = (actions: MatchAction[]) =>
  actions
    .filter((action) => action.type === 'shot' || action.type === 'header')
    .map((action) =>
      action.type === 'shot' ? `${action.intent}:${action.contact ?? 'settled'}` : action.intent,
    )
    .sort();

describe('PR144 canonical contextual shooting options', () => {
  it('offers mechanically separate settled styles and promotes chip for a rushing keeper', () => {
    const { state, shooter, keeper } = fixture();
    shooter.position = { x: 83, y: 34 };
    state.ball = { ...shooter.position, ownerId: shooter.id };
    const defender = state.players.find(
      (player) => player.team === 'away' && player.id !== keeper.id,
    )!;
    defender.position = { x: 84, y: 39 };
    expect(shotFamily(enumerateCanonicalShootingOptions(state, shooter.id))).toEqual([
      'driven:settled',
      'placed:settled',
    ]);
    keeper.position = { x: 96, y: 34 };
    expect(shotFamily(enumerateCanonicalShootingOptions(state, shooter.id))).toEqual([
      'chip:settled',
      'driven:settled',
      'placed:settled',
    ]);
  });

  it.each([
    [BALL_RADIUS, 0, 'first_time'],
    [BALL_RADIUS, 2, 'first_time'],
    [0.4, 1, 'half_volley'],
    [0.95, 0, 'volley'],
  ] as const)(
    'uses canonical height %s and bounces %s for %s foot contact',
    (height, bounceCount, contact) => {
      const { state, shooter } = incomingFixture(height, bounceCount);
      const actions = enumerateCanonicalShootingOptions(state, shooter.id);
      expect(actions.length).toBeGreaterThan(0);
      expect(actions.every((action) => action.type === 'shot' && action.contact === contact)).toBe(
        true,
      );
      expect(actions.every((action) => action.type === 'shot' && action.intent !== 'chip')).toBe(
        true,
      );
      expect(
        actions.every((action) => action.type === 'shot' && canExecuteCanonicalShot(state, action)),
      ).toBe(true);
    },
  );

  it('offers a header only at physically reachable aerial height, never teleports contact', () => {
    const { state, shooter } = incomingFixture(1.8);
    const actions = enumerateCanonicalShootingOptions(state, shooter.id);
    expect(shotFamily(actions)).toEqual(['header_shot']);
    const action = actions[0]!;
    const launched = resolveMatchAction(state, action);
    expect(launched.ball.from).toEqual({ x: state.ball.x, y: state.ball.y });
    expect(launched.ball.releaseHeight).toBe(1.8);
    state.ball.height = 4;
    expect(enumerateCanonicalShootingOptions(state, shooter.id)).toEqual([]);
    shooter.position = { x: 72, y: 34 };
    expect(incomingShotContact(state, shooter.id)).toBeUndefined();
  });

  it('uses body orientation, incoming speed, weaker foot and ability in first-time execution', () => {
    const { state, shooter } = incomingFixture();
    const action = enumerateCanonicalShootingOptions(state, shooter.id).find(
      (option) => option.type === 'shot',
    )!;
    if (action.type !== 'shot') throw new Error('expected foot shot');
    const aligned = deriveShotExecutionProfile(state, action);
    shooter.facingAngle -= Math.PI * 0.65;
    shooter.profile.attributes.firstTouch = 20;
    const difficult = deriveShotExecutionProfile(state, action);
    expect(difficult.firstTimeDifficulty).toBeGreaterThan(aligned.firstTimeDifficulty);
    expect(difficult.errorMultiplier).toBeGreaterThan(aligned.errorMultiplier);
    shooter.facingAngle = -Math.PI / 2;
    expect(enumerateCanonicalShootingOptions(state, shooter.id)).toEqual([]);
    shooter.facingAngle = Math.PI / 2;
    state.ball.velocity = { x: 80, y: 0, z: 0 };
    expect(enumerateCanonicalShootingOptions(state, shooter.id)).toEqual([]);
  });

  it('exposes precisely the same settled goal family to a human and AI', () => {
    const { state, shooter } = fixture();
    state.controlledFootballerId = shooter.id;
    const opportunity = projectPlayerDecisionOpportunity(state)!;
    expect(opportunity).toBeDefined();
    const ui = projectContextualInteractions(state, opportunity, {
      kind: 'goal',
      side: 'away',
    }).flatMap((interaction) =>
      interaction.resolution.kind === 'action' ? [interaction.resolution.action] : [],
    );
    expect(shotFamily(ui)).toEqual(
      shotFamily(enumerateCanonicalShootingOptions(state, shooter.id)),
    );
    expect(
      shotFamily(rankAvailableActionsForAI(state, shooter.id).map(({ action }) => action)),
    ).toEqual(shotFamily(ui));
    delete state.controlledFootballerId;
    expect(shotFamily(enumerateAvailableActions(state, shooter.id))).toEqual(shotFamily(ui));
  });

  it('exposes the same incoming family and allows an NPC to choose and execute first time', () => {
    const { state, shooter } = incomingFixture();
    const action = chooseIncomingShotAction(state, shooter.id);
    expect(action?.type).toBe('shot');
    if (!action || action.type !== 'shot') throw new Error('expected NPC finish');
    expect(action.contact).toBe('first_time');
    const launched = resolveMatchAction(state, action);
    expect(launched.ball.ownerId).toBeUndefined();
    expect(launched.ball.shot?.firstTime).toBe(true);
    expect(launched.ball.shot?.ballHeightAtContact).toBe(BALL_RADIUS);
    expect(launched.lastReceptionOutcome).toBeUndefined();
    expect(shotFamily(enumerateAvailableActions(state, shooter.id))).toEqual(
      shotFamily(enumerateCanonicalShootingOptions(state, shooter.id)),
    );
  });

  it('projects incoming finishing before arrival using the committed physical flight', () => {
    const { state, shooter } = incomingFixture(BALL_RADIUS, 0, true);
    state.controlledFootballerId = shooter.id;
    const opportunity = projectPlayerDecisionOpportunity(state)!;
    expect(opportunity?.kind).toBe('incoming_ball');
    const ui = projectContextualInteractions(state, opportunity, {
      kind: 'goal',
      side: 'away',
    }).flatMap((interaction) =>
      interaction.resolution.kind === 'action' ? [interaction.resolution.action] : [],
    );
    expect(shotFamily(ui)).toEqual(
      shotFamily(enumerateCanonicalShootingOptions(state, shooter.id)),
    );
    expect(ui.length).toBeGreaterThan(0);
    expect(incomingShotContact(state, shooter.id)?.arrivalTime).toBeGreaterThan(0);
    const action = ui[0]!;
    if (action.type !== 'shot') throw new Error('expected foot shot');
    expect(canExecuteCanonicalShot(state, action)).toBe(false);
  });

  it('uses the NPC incoming choice inside the sole match simulation before a settled control', () => {
    const { state, shooter } = incomingFixture();
    let next = state;
    for (let index = 0; index < 12 && !next.ball.shot; index++) next = stepTacticalMatch(next);
    expect(next.ball.shot?.shooterId).toBe(shooter.id);
    expect(next.ball.shot?.contact).toBe('first_time');
    expect(next.lastReceptionOutcome).toBeUndefined();
  });

  it.each([0.4, 0.95, 1.8])('executes an NPC finish at real aerial height %s', (height) => {
    const { state, shooter, keeper } = incomingFixture(height);
    keeper.position = { x: 103, y: 60 };
    Object.assign(shooter.profile.attributes, {
      heading: 100,
      jumping: 100,
      strength: 100,
      positioning: 100,
      gameReading: 100,
      concentration: 100,
    });
    const next = stepTacticalMatch(state, FIXED_MATCH_DT);
    expect(next.ball.shot?.shooterId).toBe(shooter.id);
    expect(next.ball.shot?.contact).toBe(
      height >= 1.45 ? 'header' : height > 0.65 ? 'volley' : 'half_volley',
    );
    expect(next.ball.shot?.ballHeightAtContact).toBeGreaterThan(height - 0.07);
    expect(next.ball.shot?.ballHeightAtContact).toBeLessThanOrEqual(height);
    expect(next.lastReceptionOutcome).toBeUndefined();
  });

  it('preserves a human first-time selection and its original decision height until physical contact', () => {
    const { state, shooter } = incomingFixture();
    const action = enumerateCanonicalShootingOptions(state, shooter.id)[0]!;
    state.controlledFootballerId = shooter.id;
    state.pendingReceptionIntent = {
      actorId: shooter.id,
      action,
      createdAt: state.time,
      expiresAt: state.time + 2,
      ballEpisode: 'incoming-test',
      actionSource: 'human_selected',
    };
    const next = stepTacticalMatch(state);
    expect(next.latestActionSource).toBe('human_selected');
    expect(next.ball.shot?.contact).toBe('first_time');
    expect(next.ball.shot?.ballHeightAtDecision).toBe(BALL_RADIUS);
    expect(next.ball.shot?.ballHeightAtContact).toBe(BALL_RADIUS);
    expect(next.lastReceptionOutcome).toBeUndefined();
  });

  it('does not replace a human control with an autonomous terminal aerial finish', () => {
    const { state, shooter } = incomingFixture(1);
    Object.assign(shooter.profile.attributes, {
      heading: 100,
      jumping: 100,
      strength: 100,
      positioning: 100,
      gameReading: 100,
      concentration: 100,
    });
    state.controlledFootballerId = shooter.id;
    state.pendingReceptionIntent = {
      actorId: shooter.id,
      action: { type: 'hold', actorId: shooter.id },
      createdAt: state.time,
      expiresAt: state.time + 2,
      ballEpisode: 'human-control',
      actionSource: 'human_selected',
    };
    const next = stepTacticalMatch(state);
    expect(next.ball.shot).toBeUndefined();
    expect(next.latestAction?.type).not.toBe('header');
  });

  it('a released headed shot remains one canonical shot as the ball leaves the contact envelope', () => {
    const { state, shooter } = incomingFixture(1.8);
    const action = enumerateCanonicalShootingOptions(state, shooter.id)[0]!;
    const launched = resolveMatchAction(state, action);
    let next = launched;
    for (let index = 0; index < 8; index++) next = stepTacticalMatch(next);
    expect(next.ball.shot?.shotId ?? next.lastShot?.shotId).toBe(launched.ball.shot?.shotId);
    expect(next.decisionIndex).toBe(launched.decisionIndex);
  });

  it('rejects a hand-constructed nearby header against an already launched canonical shot', () => {
    const { state, shooter } = incomingFixture(1.8);
    const action = enumerateCanonicalShootingOptions(state, shooter.id)[0]!;
    const launched = resolveMatchAction(state, action);
    const repeated = {
      type: 'header' as const,
      actorId: shooter.id,
      target: { x: 105, y: 34 },
      intent: 'header_shot' as const,
    };
    expect(canExecuteCanonicalShot(launched, repeated)).toBe(false);
    expect(resolveMatchAction(launched, repeated)).toBe(launched);
    expect(launched.ball.shot?.shotId).toBeDefined();
  });

  it('revalidates changed geometry and never allows a settled technique at volley contact', () => {
    const { state, shooter } = incomingFixture(0.95);
    const settled = {
      type: 'shot' as const,
      actorId: shooter.id,
      target: { x: 105, y: 34 },
      intent: 'placed' as const,
    };
    expect(resolveMatchAction(state, settled)).toBe(state);
    expect(matchActionSchema.safeParse({ ...settled, contact: 'curled' }).success).toBe(false);
  });
});

describe('PR144 shot mechanics and calibration evidence', () => {
  it('keeps power, placement and chip physically distinct even when a chip is aimed at grass', () => {
    const { state, shooter, keeper } = fixture();
    keeper.position = { x: 97, y: 34 };
    const actions = ['driven', 'placed', 'chip'].map((intent) => ({
      type: 'shot' as const,
      actorId: shooter.id,
      target: { x: 105, y: 34 },
      goalTarget: { horizontal: 0, vertical: 0 },
      intent: intent as 'driven' | 'placed' | 'chip',
    }));
    const launches = actions.map((action) => resolveMatchAction(state, action));
    const profiles = actions.map((action) => deriveShotExecutionProfile(state, action));
    expect(profiles[0]!.nominalSpeed).toBeGreaterThan(profiles[1]!.nominalSpeed);
    expect(profiles[0]!.errorMultiplier).toBeGreaterThan(profiles[1]!.errorMultiplier);
    expect(profiles[1]!.preparationSeconds).toBeGreaterThan(profiles[0]!.preparationSeconds);
    expect(launches[0]!.ball.launchSpeed!).toBeGreaterThan(launches[1]!.ball.launchSpeed!);
    expect(launches[2]!.ball.launchVelocity!.z).toBeCloseTo(profiles[2]!.minimumVerticalSpeed, 10);
    const peaks = launches.map((launch) =>
      Math.max(
        ...projectFutureBallTrajectory(
          {
            position: { x: launch.ball.x, y: launch.ball.y, z: BALL_RADIUS },
            velocity: launch.ball.launchVelocity!,
            airborne: true,
            bounceCount: 0,
          },
          1.6,
        ).map((sample) => sample.ball.position.z),
      ),
    );
    expect(peaks[2]!).toBeGreaterThan(2);
    expect(peaks[2]!).toBeGreaterThan(peaks[0]! + 1.5);
    expect(peaks[2]!).toBeGreaterThan(peaks[1]! + 1.2);
  });

  it('preserves loft over low goal targets, distances, seeds and both attack directions', () => {
    for (const seed of ['chip-a', 'chip-b', 'chip-c'])
      for (const range of [5, 12, 23]) {
        const { state, shooter, keeper } = fixture(seed);
        shooter.position.x = 105 - range;
        state.ball = { ...shooter.position, ownerId: shooter.id };
        keeper.position = { x: 97, y: 34 };
        const action = {
          type: 'shot' as const,
          actorId: shooter.id,
          target: { x: 105, y: 34 },
          intent: 'chip' as const,
          goalTarget: { horizontal: 0.8, vertical: 0 },
        };
        const shot = resolveMatchAction(state, action);
        expect(shot.ball.launchVelocity?.z).toBeGreaterThanOrEqual(6.4);
        const mirrored = structuredClone(state);
        const awayShooter = mirrored.players.find((player) => player.id === shooter.id)!;
        awayShooter.team = 'away';
        awayShooter.position.x = range;
        awayShooter.facingAngle = -Math.PI / 2;
        mirrored.ball = { ...awayShooter.position, ownerId: shooter.id };
        const homeKeeper = mirrored.players.find(
          (player) => player.team === 'home' && player.profile.primaryPosition === 'goalkeeper',
        )!;
        homeKeeper.position = { x: 8, y: 34 };
        const away = resolveMatchAction(mirrored, { ...action, target: { x: 0, y: 34 } });
        expect(away.ball.launchVelocity?.z).toBeGreaterThanOrEqual(6.4);
        expect(away.ball.launchVelocity?.x).toBeLessThan(0);
      }
  });

  it('records validated style, contact, intent, error, launch and final keeper/outcome evidence', () => {
    const { state, shooter } = incomingFixture(0.95);
    const action = enumerateCanonicalShootingOptions(state, shooter.id)[0]!;
    const launched = resolveMatchAction(state, action);
    const diagnostic = launched.ball.shot!;
    expect(shotDiagnosticSchema.safeParse(diagnostic).success).toBe(true);
    expect(diagnostic.ballHeightAtDecision).toBe(0.95);
    expect(diagnostic.ballHeightAtContact).toBe(0.95);
    expect(diagnostic.launchVerticalComponent).toBe(launched.ball.launchVelocity?.z);
    const finished = {
      ...launched,
      lastShot: { ...diagnostic, outcome: 'save' as const, goalkeeperAction: 'parry' as const },
    };
    const telemetry = observeMatchFlow(createMatchFlowTelemetry(), state, finished);
    const summaries = summarizeShootingStyles(telemetry);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      intent: 'driven',
      contact: 'volley',
      firstTimeAttempts: 1,
      saves: 1,
    });
    expect(telemetry.shotDiagnostics[0]?.goalkeeperAction).toBe('parry');
  });

  it('same seed and same shot choices reproduce the canonical launch and trajectory', () => {
    const { state, shooter } = fixture('deterministic-shot-options');
    const action = enumerateCanonicalShootingOptions(state, shooter.id)[0]!;
    const run = () => {
      let next = resolveMatchAction(structuredClone(state), action);
      for (let index = 0; index < 30; index++) next = stepTacticalMatch(next);
      return next;
    };
    expect(run()).toEqual(run());
  });
});
