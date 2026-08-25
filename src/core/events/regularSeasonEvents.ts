import { z } from 'zod';
import type { CareerState, HistoryFact } from '../../types/domain';

const eventSchema = z.object({
  id: z.string(),
  title: z.string(),
  situation: z.string(),
  decisions: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        gain: z.string(),
        risk: z.string(),
        fitness: z.number(),
        morale: z.number(),
        money: z.number(),
        development: z.number(),
      }),
    )
    .min(2)
    .max(4),
});
type RegularEvent = z.infer<typeof eventSchema>;
const choice = (
  id: string,
  label: string,
  gain: string,
  risk: string,
  fitness = 0,
  morale = 0,
  money = 0,
  development = 0,
) => ({ id, label, gain, risk, fitness, morale, money, development });
const events: RegularEvent[] = [
  {
    id: 'extra_training_offer',
    title: 'Dodatkowy trening',
    situation: 'Trener proponuje indywidualną sesję po zajęciach zespołu.',
    decisions: [
      choice(
        'accept',
        'Zostań po treningu',
        'Ukierunkowana praca nad warsztatem.',
        'Mniej czasu na regenerację.',
        -5,
        1,
        0,
        18,
      ),
      choice(
        'light',
        'Skróć sesję',
        'Mały impuls rozwojowy.',
        'Postęp będzie wolniejszy.',
        -2,
        0,
        0,
        8,
      ),
      choice('decline', 'Odmów', 'Chronisz świeżość.', 'Tracisz okazję do rozwoju.', 2, -1),
    ],
  },
  {
    id: 'recovery_needed',
    title: 'Organizm prosi o przerwę',
    situation: 'Fizjoterapeuta widzi narastające zmęczenie i zaleca zmianę planu.',
    decisions: [
      choice(
        'full',
        'Pełna regeneracja',
        'Wyraźnie odzyskasz siły.',
        'Opuścisz dodatkową pracę.',
        12,
        1,
      ),
      choice(
        'reduced',
        'Ogranicz obciążenie',
        'Połączysz odpoczynek z lekką pracą.',
        'Regeneracja będzie niepełna.',
        6,
        0,
        0,
        4,
      ),
      choice(
        'push',
        'Zignoruj ostrzeżenie',
        'Utrzymasz trening rozwojowy.',
        'Przeciążenie zwiększy ryzyko urazu.',
        -9,
        -1,
        0,
        14,
      ),
    ],
  },
  {
    id: 'side_job_offer',
    title: 'Propozycja dodatkowej pracy',
    situation: 'Znajomy oferuje płatne weekendowe zlecenie, ale twój kalendarz jest już napięty.',
    decisions: [
      choice(
        'accept',
        'Przyjmij pracę',
        'Zarobisz potrzebne pieniądze.',
        'Uc cierpi regeneracja.',
        -8,
        0,
        260,
      ),
      choice(
        'light',
        'Weź krótszą zmianę',
        'Podreperujesz budżet.',
        'Zostanie mniej czasu na odpoczynek.',
        -3,
        0,
        120,
      ),
      choice('decline', 'Odmów', 'Ochronisz regenerację.', 'Nie poprawisz finansów.', 3, 1),
    ],
  },
  {
    id: 'development_purchase',
    title: 'Inwestycja w rozwój',
    situation: 'Możesz kupić sprzęt i materiały do indywidualnej pracy.',
    decisions: [
      choice(
        'buy',
        'Kup pełny pakiet',
        'Dostaniesz mocny impuls treningowy.',
        'To duży wydatek.',
        0,
        1,
        -180,
        22,
      ),
      choice(
        'basic',
        'Wybierz podstawy',
        'Rozwiniesz się niewielkim kosztem.',
        'Efekt będzie ograniczony.',
        0,
        0,
        -80,
        10,
      ),
      choice('wait', 'Poczekaj', 'Zachowasz pieniądze.', 'Odkładasz rozwój.', 0, 0),
    ],
  },
  {
    id: 'language_learning',
    title: 'Nauka języka',
    situation: 'Wieczorny kurs może poszerzyć twoje perspektywy i pewność poza boiskiem.',
    decisions: [
      choice(
        'course',
        'Zapisz się na kurs',
        'Budujesz samodzielność.',
        'Koszt i dodatkowy obowiązek.',
        -2,
        3,
        -90,
        5,
      ),
      choice(
        'self',
        'Ucz się sam',
        'Nie wydasz pieniędzy.',
        'Postęp będzie wolniejszy.',
        -1,
        1,
        0,
        3,
      ),
      choice('later', 'Odłóż temat', 'Zachowasz czas.', 'Nie wykorzystasz okazji.', 1, 0),
    ],
  },
  {
    id: 'dietitian_contact',
    title: 'Kontakt od dietetyka',
    situation: 'Specjalista proponuje uporządkowanie żywienia pod obciążenia meczowe.',
    decisions: [
      choice(
        'consult',
        'Zapłać za konsultację',
        'Lepsza regeneracja i nawyki.',
        'Usługa kosztuje.',
        6,
        2,
        -120,
        7,
      ),
      choice(
        'learn',
        'Ucz się samodzielnie',
        'Zyskasz podstawową wiedzę bez kosztu.',
        'Efekty są mniej pewne.',
        2,
        1,
        0,
        3,
      ),
      choice(
        'postpone',
        'Odłóż decyzję',
        'Nie naruszasz budżetu.',
        'Problem zostaje nierozwiązany.',
        0,
        -1,
      ),
    ],
  },
  {
    id: 'competitor_conversation',
    title: 'Rozmowa z konkurentem',
    situation: 'Kolega walczący o tę samą pozycję pyta wprost, jak widzisz waszą rywalizację.',
    decisions: [
      choice(
        'support',
        'Okaż wsparcie',
        'Budujesz zaufanie w drużynie.',
        'Możesz zabrzmieć zbyt łagodnie.',
        0,
        2,
      ),
      choice(
        'compete',
        'Postaw na zdrową rywalizację',
        'Pokazujesz ambicję i szacunek.',
        'Napięcie nie znika.',
        0,
        1,
        0,
        5,
      ),
      choice(
        'provoke',
        'Sprowokuj go',
        'Demonstrujesz pewność siebie.',
        'Relacja może się pogorszyć.',
        0,
        -4,
      ),
    ],
  },
  {
    id: 'coach_minutes_tension',
    title: 'Rozmowa o minutach',
    situation: 'Po serii krótkich lub zerowych występów masz okazję porozmawiać z trenerem.',
    decisions: [
      choice(
        'ask',
        'Zapytaj, co poprawić',
        'Dostaniesz jasny kierunek pracy.',
        'Nie wymusisz natychmiastowej szansy.',
        0,
        1,
        0,
        12,
      ),
      choice(
        'demand',
        'Stanowczo poproś o minuty',
        'Wyraźnie pokażesz ambicję.',
        'Trener może źle odebrać nacisk.',
        0,
        -2,
        0,
        5,
      ),
      choice(
        'train',
        'Odpowiedz treningiem',
        'Chronisz relację i skupiasz się na pracy.',
        'Pozostaniesz mniej słyszalny.',
        -3,
        1,
        0,
        15,
      ),
    ],
  },
].map((value) => eventSchema.parse(value));

export const getRegularSeasonEvent = (id: string) => events.find((event) => event.id === id);
export const resolveRegularSeasonEvent = (
  career: CareerState,
  eventId: string,
  decisionId: string,
  date: string,
): CareerState => {
  const event = getRegularSeasonEvent(eventId);
  const decision = event?.decisions.find((item) => item.id === decisionId);
  if (!event || !decision) return career;
  const fact: HistoryFact = {
    id: `fact_regular_event_${date}_${eventId}`,
    factType: 'regular_season_decision',
    season: career.currentSeason,
    date,
    actors: [career.player.id],
    targets: [],
    clubs: [career.currentClub.id],
    competitions: [],
    data: { eventId, decisionId },
    causes: [],
    tags: ['off_field', eventId],
    visibility: 'partial',
    narrativeImportance: 45,
    emotionalTone: decision.morale < 0 ? 'negative' : 'neutral',
  };
  const progress = career.developmentProgress ?? [];
  return {
    ...career,
    player: {
      ...career.player,
      fitness: Math.max(0, Math.min(100, career.player.fitness + decision.fitness)),
      morale: Math.max(0, Math.min(100, career.player.morale + decision.morale)),
    },
    finances: decision.money
      ? [
          ...(career.finances ?? []),
          {
            id: `finance_${date}_${eventId}`,
            date,
            amount: decision.money,
            category: decision.money > 0 ? 'side_job' : 'development',
            sourceFactId: fact.id,
          },
        ]
      : career.finances,
    developmentProgress: decision.development
      ? [...progress, { attribute: 'technique', progress: decision.development }]
      : progress,
    historyFacts: [...career.historyFacts, fact],
    decisionPoint: undefined,
  };
};
