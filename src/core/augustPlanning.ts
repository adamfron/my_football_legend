import type {
  AugustActivityId,
  CareerState,
  FinancialTransaction,
  HistoryFact,
  PlayerAttributes,
} from '../types/domain';
import { RandomGenerator } from './random/RandomGenerator';
import { assignedRole, roleStatus } from './events/postSelectionPath';

export const AUGUST_DATES = ['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24'] as const;
export const augustActivities: ReadonlyArray<{
  id: AugustActivityId;
  name: string;
  cost: number;
  descriptions: readonly [string, string];
}> = [
  {
    id: 'extra_individual_training',
    name: 'Dodatkowy trening indywidualny',
    cost: 0,
    descriptions: [
      'Dopracuj element właściwy dla swojej pozycji.',
      'Samodzielna jednostka może dać impuls, ale obciąży nogi.',
    ],
  },
  {
    id: 'hire_personal_coach',
    name: 'Trener indywidualny',
    cost: 300,
    descriptions: [
      'Ukierunkowana praca pod okiem specjalisty.',
      'Precyzyjna jednostka kosztuje pieniądze i świeżość.',
    ],
  },
  {
    id: 'nutrition_consultation',
    name: 'Konsultacja z dietetykiem',
    cost: 200,
    descriptions: [
      'Poznaj podstawy regeneracji i żywienia.',
      'Inwestycja działa spokojniej niż kolejny ciężki trening.',
    ],
  },
  {
    id: 'education_session',
    name: 'Nauka poza boiskiem',
    cost: 100,
    descriptions: [
      'Angielski, żywienie albo finanse tworzą możliwości na przyszłość.',
      'Wieczór nauki buduje wiedzę bez obciążania nóg.',
    ],
  },
  {
    id: 'food_delivery_shift',
    name: 'Dodatkowa praca — kurier',
    cost: 0,
    descriptions: [
      'Zarób, rozwożąc jedzenie po treningach.',
      'Kilka godzin na rowerze daje pieniądze, lecz zabiera regenerację.',
    ],
  },
  {
    id: 'prioritize_recovery',
    name: 'Odpoczynek',
    cost: 0,
    descriptions: [
      'Oddaj organizmowi czas po obowiązkach klubowych.',
      'Spokojny tydzień może być najbardziej profesjonalnym wyborem.',
    ],
  },
];

const roleLoads: Record<string, number> = {
  senior_training_rotation: 78,
  senior_trial_extended: 70,
  weekly_senior_access: 55,
  academy_leader: 50,
  individual_development_plan: 38,
  academy_match_opportunity: 55,
};
export const getWeeklyClubLoad = (career: CareerState, matchMinutesThisWeek = 0) =>
  Math.min(100, (roleLoads[assignedRole(career) ?? ''] ?? 50) + matchMinutesThisWeek * 0.25);
export const getActivityLoad = (activity: AugustActivityId) =>
  ({
    extra_individual_training: 28,
    hire_personal_coach: 32,
    nutrition_consultation: 4,
    education_session: 3,
    food_delivery_shift: 20,
    prioritize_recovery: -25,
  })[activity];
export const evaluateWeeklyLoad = (
  career: CareerState,
  activity: AugustActivityId,
  matchMinutesThisWeek = 0,
) => {
  const total = getWeeklyClubLoad(career, matchMinutesThisWeek) + getActivityLoad(activity);
  return {
    total,
    overloaded: total > 92 || (total > 82 && career.player.fitness < 55),
    description:
      total >= 85
        ? 'Po treningach czujesz nogi. Sztab ostrzega przed dokładaniem jednostek.'
        : total <= 45
          ? 'Ten tydzień jest stosunkowo lekki.'
          : 'Obowiązki klubowe wymagają uwagi, ale zostawiają trochę przestrzeni.',
  };
};
export const getAvailableFunds = (career: CareerState) =>
  (career.finances ?? []).reduce((sum, item) => sum + item.amount, 0);
export const canChooseAugustActivity = (career: CareerState, activity: AugustActivityId) =>
  getAvailableFunds(career) >=
  (augustActivities.find((item) => item.id === activity)?.cost ?? Infinity);

const fact = (
  career: CareerState,
  type: string,
  date: string,
  data: Record<string, unknown>,
  importance: number,
): HistoryFact => ({
  id: `fact_${type}_${date}`,
  factType: type,
  season: career.currentSeason,
  date,
  actors: [career.player.id],
  targets: [],
  clubs: [career.currentClub.id],
  competitions: [],
  data,
  causes: career.historyFacts.slice(-4).map((item) => item.id),
  tags: ['august_2026', type],
  visibility: 'partial',
  narrativeImportance: importance,
  emotionalTone: 'neutral',
});
export const canInitializeAugust = (career: CareerState) =>
  !career.activeEvent &&
  ['opening_month_role_assigned', 'post_selection_path_completed'].every((type) =>
    career.historyFacts.some((item) => item.factType === type),
  ) &&
  !career.historyFacts.some((item) => item.factType === 'august_2026_completed');
export const initializeAugustPhase = (career: CareerState): CareerState => {
  if (!canInitializeAugust(career) || career.augustPlanning) return career;
  const stipend: FinancialTransaction = {
    id: 'finance_august_2026_stipend',
    date: '2026-08-01',
    amount: 800,
    category: 'stipend',
    sourceFactId: 'fact_august_2026_started',
  };
  return {
    ...career,
    finances: [...(career.finances ?? []).filter((item) => item.id !== stipend.id), stipend],
    augustPlanning: {
      currentWeek: 1,
      startedFitness: career.player.fitness,
      startedMorale: career.player.morale,
      results: [],
      completed: false,
    },
    historyFacts: [
      ...career.historyFacts,
      fact(
        career,
        'august_2026_started',
        '2026-08-01',
        { role: assignedRole(career), stipend: 800 },
        35,
      ),
    ],
  };
};

const resultNarratives: Record<AugustActivityId, readonly [string, string, string]> = {
  extra_individual_training: [
    'Powtórzenia zaczynają układać się w nawyk.',
    'Technika rośnie powoli, a nogi przypominają o wysiłku.',
    'Sztab zauważa profesjonalne podejście do pracy.',
  ],
  hire_personal_coach: [
    'Precyzyjne wskazówki porządkują trening.',
    'Intensywna jednostka daje widoczny postęp.',
    'Dobrze wydane pieniądze przybliżają cię do przełomu.',
  ],
  nutrition_consultation: [
    'Proste zmiany poprawiają regenerację.',
    'Zaczynasz świadomiej układać posiłki wokół treningów.',
    'Efekt nie jest widowiskowy, lecz ciało reaguje dobrze.',
  ],
  education_session: [
    'Poza boiskiem otwierasz nowy kierunek.',
    'Notatki tworzą wiedzę, która przyda się później.',
    'Spokojna nauka daje satysfakcję bez zmęczenia nóg.',
  ],
  food_delivery_shift: [
    'Spokojny wieczór przynosi dodatkowy zarobek.',
    'Napięty grafik daje pieniądze kosztem snu.',
    'Drobna awaria roweru komplikuje zmianę, ale kończysz pracę.',
  ],
  prioritize_recovery: [
    'Świeżość wraca, a głowa uspokaja się.',
    'Odpuszczenie dodatkowej pracy okazuje się rozsądną decyzją.',
    'Regeneracja stabilizuje formę przed kolejnym tygodniem.',
  ],
};
export const monthlyActivityNarratives: Record<AugustActivityId, readonly [string, string]> = {
  extra_individual_training: [
    'Sierpień upłynął pod znakiem samodzielnych powtórzeń.',
    'Regularna praca indywidualna wyznaczyła kierunek rozwoju.',
  ],
  hire_personal_coach: [
    'Zainwestowałeś w precyzyjnie ukierunkowaną pracę.',
    'Płatne jednostki dały ci skoncentrowany miesiąc rozwoju.',
  ],
  nutrition_consultation: [
    'Coraz świadomiej traktowałeś regenerację.',
    'Wiedza o żywieniu zaczęła wspierać codzienne obowiązki.',
  ],
  education_session: [
    'Rozwijałeś się także poza murawą.',
    'Nauka zbudowała kilka możliwości na kolejne miesiące.',
  ],
  food_delivery_shift: [
    'Łączyłeś klub z samodzielnym zarabianiem.',
    'Kurierskie zmiany wypełniły część wolnych wieczorów.',
  ],
  prioritize_recovery: [
    'Świeżość była twoim najważniejszym sierpniowym wyborem.',
    'Świadomie chroniłeś siły w pierwszym miesiącu nowej roli.',
  ],
};
const developmentAttribute = (career: CareerState): keyof PlayerAttributes =>
  career.player.primaryPosition === 'goalkeeper'
    ? 'composure'
    : ['center_back', 'full_back', 'defensive_midfielder'].includes(career.player.primaryPosition)
      ? 'defending'
      : ['winger', 'striker'].includes(career.player.primaryPosition)
        ? 'finishing'
        : 'technique';

export const resolveAugustActivity = (
  career: CareerState,
  activityId: AugustActivityId,
): CareerState => {
  const plan = career.augustPlanning;
  if (!plan || plan.completed || plan.results.length >= plan.currentWeek) return career;
  const activity = augustActivities.find((item) => item.id === activityId)!;
  if (!canChooseAugustActivity(career, activityId)) return career;
  const date = AUGUST_DATES[plan.currentWeek - 1]!;
  const rng = RandomGenerator.fromSeed(`${career.seed}:august:${plan.currentWeek}:${activityId}`);
  const load = evaluateWeeklyLoad(career, activityId);
  const deliveryIncome = activityId === 'food_delivery_shift' ? rng.int(150, 250) : 0;
  const training = ['extra_individual_training', 'hire_personal_coach'].includes(activityId);
  const development = training
    ? Math.max(
        6,
        Math.round(
          (activityId === 'hire_personal_coach' ? 24 : 15) *
            (career.player.potential / 100) *
            (load.overloaded ? 0.55 : 1) +
            rng.int(-2, 3),
        ),
      )
    : 0;
  const fitnessDelta =
    activityId === 'prioritize_recovery'
      ? rng.int(5, 8)
      : activityId === 'nutrition_consultation'
        ? rng.int(2, 4)
        : training
          ? load.overloaded
            ? -rng.int(5, 8)
            : -rng.int(1, 3)
          : activityId === 'food_delivery_shift'
            ? getWeeklyClubLoad(career) < 50
              ? 1
              : -rng.int(2, 5)
            : 0;
  const moraleDelta =
    activityId === 'prioritize_recovery'
      ? rng.int(1, 3)
      : activityId === 'education_session'
        ? 2
        : load.overloaded
          ? -2
          : rng.int(0, 2);
  const finance: FinancialTransaction[] = [...(career.finances ?? [])];
  if (activity.cost)
    finance.push({
      id: `finance_${date}_${activityId}`,
      date,
      amount: -activity.cost,
      category:
        activityId === 'education_session'
          ? 'education'
          : activityId === 'nutrition_consultation'
            ? 'recovery'
            : 'development',
    });
  if (deliveryIncome)
    finance.push({
      id: `finance_${date}_delivery`,
      date,
      amount: deliveryIncome,
      category: 'side_job',
    });
  const previous = career.developmentProgress ?? [];
  const attribute = developmentAttribute(career);
  const old = previous.find((item) => item.attribute === attribute)?.progress ?? 0;
  const progress = previous.filter((item) => item.attribute !== attribute);
  if (development) progress.push({ attribute, progress: old + development });
  const narrative = resultNarratives[activityId][rng.int(0, 2)]!;
  const interlude = rng.bool(0.35)
    ? activityId === 'food_delivery_shift'
      ? 'Wspomnienie z kurierskiej zmiany wraca w rozmowie z kolegą.'
      : rng.bool()
        ? 'Trener krótko komentuje twoje gospodarowanie siłami.'
        : 'Konkurent wysyła wiadomość przed kolejnym tygodniem.'
    : undefined;
  const result = {
    week: plan.currentWeek,
    date,
    activityId,
    fitnessDelta,
    moraleDelta,
    development,
    overloaded: load.overloaded,
    narrative,
    ...(interlude ? { interlude } : {}),
  };
  const weeklyFact = fact(
    career,
    'weekly_personal_activity',
    date,
    {
      ...result,
      role: assignedRole(career),
      availableFunds: getAvailableFunds({ ...career, finances: finance }),
    },
    20,
  );
  return {
    ...career,
    finances: finance,
    developmentProgress: progress,
    player: {
      ...career.player,
      fitness: Math.max(0, Math.min(100, career.player.fitness + fitnessDelta)),
      morale: Math.max(0, Math.min(100, career.player.morale + moraleDelta)),
    },
    augustPlanning: { ...plan, results: [...plan.results, result] },
    historyFacts: [...career.historyFacts, weeklyFact],
  };
};

export const advanceAugustWeek = (career: CareerState): CareerState => {
  const plan = career.augustPlanning;
  if (!plan || plan.results.length !== plan.currentWeek) return career;
  if (plan.currentWeek < 4)
    return { ...career, augustPlanning: { ...plan, currentWeek: plan.currentWeek + 1 } };
  const totalProgress = (career.developmentProgress ?? []).reduce(
    (sum, item) => sum + item.progress,
    0,
  );
  const eligible = (career.developmentProgress ?? []).find((item) => item.progress >= 60);
  const player = eligible
    ? {
        ...career.player,
        attributes: {
          ...career.player.attributes,
          [eligible.attribute]: Math.min(100, career.player.attributes[eligible.attribute] + 1),
        },
      }
    : career.player;
  const completed = fact(
    career,
    'august_2026_completed',
    '2026-08-31',
    {
      role: assignedRole(career),
      roleLabel: roleStatus(assignedRole(career)),
      fitnessChange: player.fitness - plan.startedFitness,
      moraleChange: player.morale - plan.startedMorale,
      funds: getAvailableFunds(career),
      development: totalProgress,
      dominantActivity: plan.results
        .map((r) => r.activityId)
        .sort(
          (a, b) =>
            plan.results.filter((r) => r.activityId === b).length -
            plan.results.filter((r) => r.activityId === a).length,
        )[0],
      attributeGain: eligible?.attribute ?? null,
      highlight: plan.results.find((r) => r.interlude)?.interlude ?? plan.results[3]?.narrative,
    },
    80,
  );
  return {
    ...career,
    player,
    developmentProgress: (career.developmentProgress ?? []).map((item) =>
      eligible && item.attribute === eligible.attribute
        ? { ...item, progress: item.progress - 60 }
        : item,
    ),
    augustPlanning: { ...plan, completed: true },
    historyFacts: [...career.historyFacts, completed],
  };
};
