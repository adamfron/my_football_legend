import type { CareerState, HistoryFact } from '../../types/domain';

export interface FactPresentation {
  title: string;
  summary: string;
  toneLabel: string;
  participantNames: string[];
  clubName?: string;
}

const toneLabels = {
  positive: 'budujące',
  neutral: 'spokojne',
  negative: 'trudne',
  bittersweet: 'niejednoznaczne',
} as const;
const fullName = (career: CareerState, id: string) =>
  id === career.player.id
    ? `${career.player.firstName} ${career.player.lastName}`
    : career.significantPeople.find((p) => p.id === id)
      ? `${career.significantPeople.find((p) => p.id === id)!.firstName} ${career.significantPeople.find((p) => p.id === id)!.lastName}`
      : '';
const person = (career: CareerState, role: string) =>
  career.significantPeople.find((p) => p.role === role);
const coachName = (career: CareerState) =>
  person(career, 'coach')
    ? `${person(career, 'coach')!.firstName} ${person(career, 'coach')!.lastName}`
    : 'trener';
const rivalName = (career: CareerState) =>
  person(career, 'academy_rival')
    ? `${person(career, 'academy_rival')!.firstName} ${person(career, 'academy_rival')!.lastName}`
    : 'konkurent';

const firstImpression = (career: CareerState, decisionId: string) =>
  ({
    ask_team_needs: [
      'Zespołowe pierwsze wrażenie',
      `W pierwszej rozmowie z ${coachName(career)} zapytałeś przede wszystkim o to, czego potrzebuje drużyna. Trener zapamiętał twoje podejście.`,
    ],
    declare_senior_ambition: [
      'Ambicja powiedziana głośno',
      `W rozmowie z ${coachName(career)} jasno powiedziałeś, że chcesz wywalczyć szansę u seniorów. Trener dostrzegł odwagę, ale podniósł wobec ciebie oczekiwania.`,
    ],
    humble_learning: [
      'Gotowość do nauki',
      `Przy ${coachName(career)} podkreśliłeś, że najpierw chcesz zrozumieć wymagania akademii. Zostawiłeś po sobie obraz zawodnika cierpliwego i uważnego.`,
    ],
  })[decisionId] ?? [
    'Pierwsze spotkanie w akademii',
    `Rozmowa z ${coachName(career)} została zapamiętana jako początek twojej pracy w klubie.`,
  ];

const trainingTitles: Record<string, string> = {
  take_action: 'Próba osobistego przełomu',
  play_rival: 'Wspólna akcja z konkurentem',
  organize_team: 'Porządek zamiast popisu',
  gk_long_counter: 'Dalekie rozpoczęcie akcji',
  gk_short_shape: 'Spokój i ustawienie zespołu',
  gk_safe: 'Bezpieczna decyzja bramkarza',
};
const tierText: Record<string, string> = {
  criticalFailure: 'Decyzja przyniosła kłopoty, ale pokazała, jak reagujesz pod presją.',
  failure: 'Efekt był słabszy niż zamierzałeś, a trener zauważył koszt wyboru.',
  mixed: 'Akcja zostawiła niejednoznaczne wrażenie: coś zyskałeś, ale bez przełomu.',
  success: 'Decyzja przyniosła dobry rezultat i została zauważona przez trenera.',
  criticalSuccess: 'Końcówka treningu wyraźnie pracowała na twoją korzyść.',
};
const decisionText = (career: CareerState, decisionId: string) =>
  ({
    take_action:
      'W końcówce gry treningowej wziąłeś ciężar akcji na siebie i poszukałeś osobistego błysku.',
    play_rival: `W końcówce gry treningowej szybko poszukałeś współpracy z ${rivalName(career)}, choć walczycie o podobną pozycję.`,
    organize_team:
      'W końcówce gry treningowej cofnąłeś się, uporządkowałeś ustawienie zespołu i pomogłeś mu rozsądnie zakończyć akcję.',
    gk_long_counter: 'Jako bramkarz odważnie uruchomiłeś zespół dalekim podaniem.',
    gk_short_shape:
      'Jako bramkarz wybrałeś krótkie rozegranie i spokojnie ustawiłeś kolegów przed sobą.',
    gk_safe: 'Jako bramkarz ograniczyłeś ryzyko i wybrałeś najbezpieczniejsze rozwiązanie.',
  })[decisionId] ??
  'Najważniejsza decyzja treningowa wpłynęła na sposób, w jaki patrzą na ciebie inni.';

const relation = (career: CareerState, decisionId: string) =>
  ({
    share_credit: [
      'Uznanie podzielone po treningu',
      `Po treningu podzieliłeś się uznaniem z ${rivalName(career)}. Relacja dostała pierwszy sygnał wzajemnego zaufania.`,
    ],
    stress_rivalry: [
      'Rywalizacja nazwana wprost',
      `W rozmowie z ${rivalName(career)} jasno zaznaczyłeś, że nadal walczycie o swoje miejsce. Szacunek miesza się z napięciem.`,
    ],
    dismiss_reaction: [
      'Chłód po ostatnim gwizdku',
      `Zlekceważyłeś reakcję, z którą przyszedł ${rivalName(career)}. Po treningu między wami zostało więcej dystansu niż zaufania.`,
    ],
  })[decisionId] ?? [
    'Rozmowa po treningu',
    `Twoja reakcja po treningu wpłynęła na relację z ${rivalName(career)}.`,
  ];

export const getFactPresentation = (career: CareerState, fact: HistoryFact): FactPresentation => {
  const participants = Array.from(new Set([...fact.actors, ...fact.targets]))
    .map((id) => fullName(career, id))
    .filter(Boolean);
  const clubName = fact.clubs.includes(career.currentClub.id) ? career.currentClub.name : undefined;
  let pair: string[];
  if (fact.factType === 'attribute_changed')
    pair = [
      'Rozwój zawodnika',
      `${String(fact.data.attribute)}: ${String(fact.data.before)} → ${String(fact.data.after)}. Regularna praca zaczyna być widoczna w grze.`,
    ];
  else if (fact.factType === 'play_style_unlocked')
    pair = ['Nowy atut', 'Powtarzalne zachowania meczowe wykształciły rozpoznawalny sposób gry.'];
  else if (fact.factType === 'career_started')
    pair = [
      'Początek kariery w akademii',
      `Dołączyłeś do akademii ${career.currentClub.name} jako szesnastoletni zawodnik gotowy walczyć o swoją pierwszą poważną szansę.`,
    ];
  else if (fact.factType === 'academy_first_impression')
    pair = firstImpression(career, String(fact.data.decisionId ?? ''));
  else if (fact.factType === 'academy_training_result')
    pair = [
      trainingTitles[String(fact.data.decisionId)] ?? 'Decyzja w grze treningowej',
      `${decisionText(career, String(fact.data.decisionId))} ${tierText[String(fact.data.resolutionTier)] ?? ''}`.trim(),
    ];
  else if (fact.factType === 'academy_relationship_turn')
    pair = relation(career, String(fact.data.decisionId ?? ''));
  else if (fact.factType === 'academy_first_week_completed')
    pair = [
      'Pierwszy tydzień domknięty',
      `Pierwszy tydzień w ${career.currentClub.name} stworzył podstawę pod walkę o trening z seniorami.`,
    ];
  else if (fact.factType === 'academy_training_focus')
    pair = [
      'Kierunek przygotowań',
      `Po informacji zwrotnej od ${coachName(career)} wybrałeś przygotowanie oparte o ${String(fact.data.strongAttributeName ?? 'mocny element')} i pracę wokół ${String(fact.data.developmentAttributeName ?? 'obszar rozwoju')}.`,
    ];
  else if (fact.factType === 'academy_rival_preparation')
    pair = [
      'Dodatkowe zajęcia z konkurentem',
      `Decyzja po zajęciach zmieniła układ z ${rivalName(career)} bez robienia z niego ani sojusznika, ani wroga na stałe.`,
    ];
  else if (fact.factType === 'academy_final_assessment')
    pair = [
      'Końcowy sprawdzian',
      `W grze kontrolnej pokazałeś reakcję na sytuację, która odbiegała od planu. ${coachName(career)} oceniał cały kontekst dwóch tygodni.`,
    ];
  else if (fact.factType === 'academy_selection_result') {
    const outcome = String(fact.data.selectionOutcome);
    pair =
      outcome === 'player_invited'
        ? [
            'Zaproszenie do seniorów',
            `${coachName(career)} zaprosił cię na próbny trening seniorów.`,
          ]
        : outcome === 'both_invited'
          ? [
              'Wspólna szansa wyżej',
              `${coachName(career)} zaprosił ciebie i ${rivalName(career)} na próbę z seniorami.`,
            ]
          : outcome === 'rival_invited_player_plan'
            ? [
                'Indywidualny plan rozwoju',
                `${rivalName(career)} dostał pierwszą szansę, a ty konkretny plan i następną okazję.`,
              ]
            : [
                'Dodatkowy sprawdzian akademii',
                `${coachName(career)} nie zamknął wyboru i skierował was do dodatkowego meczu akademii.`,
              ];
  } else if (fact.factType === 'academy_selection_response')
    pair = [
      'Odpowiedź na decyzję',
      `Twoja reakcja na słowa trenera dopisała nowy ton do relacji z ${coachName(career)}.`,
    ];
  else if (fact.factType === 'senior_dressing_room_first_impression')
    pair = [
      'Pierwsze kroki w szatni seniorów',
      'Kapitan pomógł ci wejść w zasady pierwszego zespołu, a trener jasno określił stawkę okresu próbnego.',
    ];
  else if (fact.factType === 'senior_first_training_result')
    pair = [
      'Tempo pierwszego zespołu',
      'Pierwszy trening pokazał twoją zdolność adaptacji, ale nie przekreślił pracy wykonanej wcześniej w akademii.',
    ];
  else if (fact.factType === 'individual_development_plan_created')
    pair = [
      'Plan przygotowany przez Marka Wronę',
      'Ustaliłeś konkretny kierunek pracy oraz sposób ponownego sprawdzenia postępów.',
    ];
  else if (fact.factType === 'rival_promotion_response')
    pair = [
      'Drogi rozeszły się, relacja pozostała',
      `Rozmowa z ${rivalName(career)} pokazała, że jego awans nie zamyka waszej wspólnej historii.`,
    ];
  else if (fact.factType === 'academy_extra_match_result')
    pair = [
      'Mecz, który poszerzył ocenę',
      'Dodatkowe spotkanie dostarczyło trenerowi odpowiedzi wykraczających poza prosty wynik.',
    ];
  else if (fact.factType === 'opening_month_role_assigned')
    pair = [
      'Twoja rola na początek sezonu',
      'Lipiec doprowadził do konkretnej roli. To punkt wyjścia do sierpniowej historii, a nie ostateczny werdykt.',
    ];
  else if (fact.factType === 'post_selection_path_completed')
    pair = [
      'Droga do sierpnia',
      'Pierwszy etap po selekcji został domknięty, a wszystkie relacje i wcześniejsze decyzje pozostają aktywne.',
    ];
  else if (fact.factType === 'august_2026_started')
    pair = [
      'Początek sierpnia',
      'Vistula Nova wypłaciła ci szkoleniowe stypendium, a nowa rola zaczęła wyznaczać rytm tygodni.',
    ];
  else if (fact.factType === 'august_2026_completed')
    pair = [
      'Sierpień — pierwsze tygodnie nowej roli',
      `Cztery tygodnie pozwoliły połączyć obowiązki klubowe, regenerację i życie poza boiskiem. Kończysz miesiąc ze środkami ${String(fact.data.funds)} PLN.`,
    ];
  else if (fact.factType === 'academy_second_week_completed')
    pair = [
      'Dwa tygodnie domknięte',
      `Akademia ${career.currentClub.name} ma już zapis twoich decyzji, relacji i kolejnego kroku kariery.`,
    ];
  else pair = ['Wydarzenie kariery', 'Opis wydarzenia jest chwilowo niedostępny.'];
  return {
    title: pair[0]!,
    summary: pair[1]!,
    toneLabel: toneLabels[fact.emotionalTone],
    participantNames: participants,
    ...(clubName ? { clubName } : {}),
  };
};
