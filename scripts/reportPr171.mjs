/* global console */
import { readFileSync, writeFileSync } from 'node:fs';
const read = (name) => JSON.parse(readFileSync(`docs/performance/PR171-${name}.json`, 'utf8'));
const b = read('baseline'),
  f = read('attacking-funnel'),
  m = read('midfield-connectivity'),
  ref = read('reference-comparison'),
  probes = read('controlled-probes'),
  resolution = read('shot-resolution'),
  failures = read('engine-failures'),
  perf = read('observer-equivalence'),
  verification = read('verification');
const sum = (xs) => xs.reduce((n, x) => n + x, 0);
const number = (n, places = 2) => (typeof n === 'number' ? n.toFixed(places) : 'brak');
const counters = {};
for (const row of b.teamRows)
  for (const [key, value] of Object.entries(row.counters))
    counters[key] = (counters[key] ?? 0) + value;
const stage = (key) => sum(f.rows.map((r) => r.stages[key] ?? 0));
const events = (key) => sum(f.rows.map((r) => r.events[key] ?? 0));
const totals = Object.fromEntries(
  [
    'passesAttempted',
    'passesCompleted',
    'passesReceived',
    'shots',
    'shotsOnTarget',
    'goals',
    'blockedShots',
    'corners',
  ].map((k) => [k, sum(b.teamRows.map((r) => r[k]))]),
);
const cm = {
  receptions: sum(m.players.map((p) => p.passesReceived)),
  attempts: sum(m.players.map((p) => p.passesAttempted)),
  samples: sum(m.players.map((p) => p.exposure.teammateOwnerSamples ?? 0)),
  generated: sum(m.players.map((p) => p.exposure.generatedSamples ?? 0)),
  credible: sum(m.players.map((p) => p.exposure.credibleGeneratedSamples ?? 0)),
  rankedFirst: sum(m.players.map((p) => p.exposure.rankedFirstSamples ?? 0)),
};
const shotCounts = {};
for (const r of resolution.rows) {
  const key = r.outcome?.outcome ?? 'unresolved';
  shotCounts[key] = (shotCounts[key] ?? 0) + 1;
}
const outcomeCounts = {};
for (const r of f.traces.flatMap((r) => r.shots))
  outcomeCounts[r.outcome] = (outcomeCounts[r.outcome] ?? 0) + 1;
const hypotheses = [
  [
    'A1',
    'Zawyżenie prób podań przez mikro-kontakty',
    `${totals.passesAttempted} kanonicznych prób uzgodniono z nowym licznikiem i kontynuacją.`,
    'Powtórzone obserwacje lub stare eventy zwiększałyby próbę.',
    'Zgodność niezależnych identyfikatorów fizycznego release i ledgeru.',
    'Powtórzenia przejść, ledger/continuation i regresja starego eventu.',
    'Odrzucona dla publicznej księgi w badanych pełnych meczach. Presentation ledger może ponownie opublikować stary event; obserwator filtruje release ID/czas.',
    'high',
    'Zachować kanoniczny licznik; nie naprawiać futbolu przez korektę wyświetlanej liczby.',
    'Nie utożsamiać zdarzenia prezentacji z fizycznym release.',
  ],
  [
    'A2',
    'Recykling blokuje postęp',
    `${counters.passBackward ?? 0} wstecz, ${counters.passLateral ?? 0} bocznych, ${counters.passForward ?? 0} do przodu; ${counters.reciprocalConsecutivePass ?? 0} bezpośrednich powrotów.`,
    'Duży obieg bez dostępu do pola karnego.',
    'Dużo progresywnych przyjęć i wejść mimo obiegu.',
    'Pełne mecze, sieci, histogramy i lejek.',
    'Silny sygnał opisowy; samo współwystępowanie nie rozdziela pozycji od utility.',
    'medium',
    'Odtworzyć rzeczywiste odrzucone centralne/progresywne rozwiązania przed zmianą pojedynczego członu utility.',
    'Zbyt agresywna progresja może zwiększyć straty.',
  ],
  [
    'A3',
    'Podanie jest zbyt tanie wobec prowadzenia',
    'Otwarte próbki generują zarówno podania jak i prowadzenia.',
    'Przy tej samej geometrii zaniżony koszt podań odwraca wybór.',
    'Carry wygrywa w pozycjach z użytecznym korytarzem.',
    'Zamrożone rankingi 22 sytuacji strzeleckich i 5 centralnych.',
    'Nierozstrzygnięta ogólnie; brak izolowanego kontrfaktycznego strojenia kosztu.',
    'low',
    'Najpierw rozłożyć istniejący score na człony; nie zmieniać częstości podań.',
    'Utrata rozsądnego bezpiecznego wsparcia.',
  ],
  [
    'A4',
    'Obrona nie przerywa podań',
    `${sum(b.teamRows.map((r) => r.interceptions))} przechwytów; istnieją też fizyczne odbiory.`,
    'Niski udział fizycznych przerwań przyjęcia.',
    'Wiele przechwytów i nieudanych kontroli mimo obiegu.',
    'Publiczne statystyki i przyczyny strat.',
    'Nie ma podstaw do ogólnego osłabienia lub wzmocnienia obrony.',
    'medium',
    'Kalibrować wyłącznie konkretną geometrię/ETA po sparowanym teście.',
    'Większy pressing może jeszcze zmniejszyć liczbę okazji.',
  ],
  [
    'A5',
    'Zbyt dużo czasu dostępnego na grę',
    `Średnio ${number(b.summary.passesPerLiveMinute.mean)} podań zespołu na minutę live.`,
    'Nadmierny live clock lub tempo w live.',
    'Po normalizacji live gęstość nie jest zwiększona.',
    'Rozdzielony zegar live/setup/goal i provider elapsed.',
    'Tempo zmierzono; źródło nie dostarcza porównywalnego zegara live, więc przyczyna czasowa pozostaje otwarta.',
    'low',
    'Pozyskać zgodny live-clock benchmark przed zmianą czasu.',
    'Nie kompensować restart liveness przez arbitralny skrót czasu.',
  ],
  [
    'B',
    'Środkowi pomocnicy znikają w generowaniu/rankingu/wykonaniu',
    `${cm.receptions} przyjęć CM / ${totals.passesCompleted} ukończeń; próbki: ${cm.generated}/${cm.samples} generated, ${cm.credible} credible, ${cm.rankedFirst} ranked first.`,
    'Miejsce utraty występuje już przed odbiorem.',
    'Dużo wybranych celów CM, lecz wyłącznie nieudane przyjęcia.',
    'Role każdego uczestnika, sieci i kontrfaktyczne 50/90 oraz presja.',
    'Niski udział jest mierzalny; w otwartym kontrolowanym stanie opcja istnieje, presja obniża jej utility. Uniwersalna przyczyna całego rozkładu nadal wymaga frozen states z różnych faz.',
    'medium',
    'Oddzielnie sprawdzić pozycję/wsparcie, generation i score; bez premii za etykietę CM.',
    'Otwarcie środka może osłabić rest defence.',
  ],
  [
    'C',
    'Strzały znikają przed okazją lub w rankingu',
    `${stage('final_entry')} sekwencji z wejściem final, ${stage('box_entry')} z wejściem box, ${stage('credible_position')} z próbkowaną wiarygodną pozycją; ${totals.shots} release.`,
    'Wąskie gardło przed wykończeniem i/lub wybór carry/pass przy realnym shot.',
    'Liczne wiarygodne okazje/wybrane strzały, lecz brak release.',
    '22 naturalne wybory AI: 11 geometrii × 2 seedy.',
    'Dostęp do niebezpiecznych stref jest rzadki. Nie wykazano uniwersalnej blokady wybranych strzałów: czyste stany oddają strzały.',
    'medium',
    'Najpierw kreacja/wsparcie, potem odrzucone użyteczne shot; kontrolować kontakt wypchniętej piłki.',
    'Nie każda niewykorzystana opcja jest dobrym strzałem.',
  ],
  [
    'D1',
    'Bramkarze w ogóle nie potrafią bronić',
    `W 72 wymuszonych kontaktach: ${JSON.stringify(shotCounts)}.`,
    'Brak obron nawet w osiągalnych geometriach.',
    'Fizyczne catch/parry w powtarzalnych stanach.',
    'Przepisane strzały, pozycja/umiejętności bramkarza i blokujący obrońca.',
    'Odrzucona jako twierdzenie o niedziałającym mechanizmie. To nie dowód ligowej skuteczności.',
    'high',
    'Rozdzielić jakość normalnie powstających okazji od reach/reaction.',
    'Strojenie na kilku golach z pełnego meczu może przesterować obronę.',
  ],
  [
    'D2',
    'Rzadkie rożne to wyłącznie mało strzałów',
    'Rebound ma stały znak X; wywołanie po strzale gubi endsSwitched, a parry i parry_away nie zmieniają jego kierunku.',
    'Brak fizycznej różnorodności defleksji nawet przy dostarczonym strzale.',
    'Prawidłowe zróżnicowane defleksje w obu kierunkach.',
    '72 kontakty + 8 kontrfaktycznych wejść orientacji i 8 crossingów.',
    'Sama liczba strzałów nie wyjaśnia ograniczenia modelu odbić. Klasyfikacja supplied last-touch/crossing działa; brak dowodu, że każdy naturalny ciąg last-touch jest poprawny.',
    'high',
    'PR172: przekazać pełną orientację i odrębnie testować normalną kontaktu/energii/kierunku parry.',
    'Więcej dobitki, rożnych i przypadkowych goli; zachować jeden shot ID.',
  ],
  [
    'E',
    'Nowy cel porzuca odzyskiwalną piłkę',
    '9 odpowiedników PR168: rejestracja odzyskania, kontaktu, promptu i odległości celu.',
    'Prompt przed końcem intencji albo utrata wyłącznie po nowym celu.',
    'Odzyskanie i dopiero znacząca nowa sytuacja.',
    'Straight/pressure/behind/turn/reached/intercepted/unreachable/out/expired.',
    'Można odtworzyć prompt przed końcem długiego carry; uogólnione porzucanie każdej odzyskiwalnej piłki nie jest dowiedzione. PR168 nadal chroni część podejść.',
    'medium',
    'Jawny lifecycle intencji i ważność celu; reagować na realne zagrożenia.',
    'Nie blokować koniecznej decyzji ani legalnego przechwytu.',
  ],
  [
    'F1',
    'Pośredni wolny zawsze pyta za wcześnie',
    'Live: pierwsze menu i gotowość po 10.675 s; DEV: menu od 0 s mimo taker_not_ready.',
    'Live menu przed readiness.',
    'Live menu po readiness, wczesny przypadek tylko DEV.',
    'Te same źródła, live award vs DEV setup.',
    'Odrzucona dla badanego live fixture; potwierdzona różnica DEV. Brak oryginalnego eksportu.',
    'medium',
    'Czytelnie opisać pochodzenie DEV i testować granicę live.',
    'Nie dodawać długiego sztucznego opóźnienia.',
  ],
  [
    'F2',
    'Kickoff wymaga fizycznego dojścia bramkarzy do bramek',
    'Zgoda po 22.75 s: keeper depth około 10.06 i 48.10 m od własnego końca.',
    'Zgoda pomimo nieukończonego powrotu bramkarza.',
    'Obaj przy właściwych celach przed zgodą.',
    'Przerwa w 2700 s, realne przemieszczanie bez teleportacji.',
    'Potwierdzona luka gotowości taktycznej. Sama pozycja we własnej połowie nie dowodzi naruszenia Law 8.',
    'high',
    'Uzgodnić relokację/warunek taktycznej gotowości bramkarza na start drugiej połowy.',
    'Nie uzależniać futbolu od ceremonii szatni.',
  ],
  [
    'F3',
    'Bramkarz stoi fizycznie źle przy karnym',
    'Live penalty gotowy po 11.3 s, środek bramkarza 0.0695 m od linii; DEV 0 m.',
    'Niepoprawna geometria przy release.',
    'Kanoniczna gotowość/linia zgodna, perspektywa nieznana.',
    'Live i DEV penalty preparation.',
    'Nie odtworzono zarzutu dla kanonicznej pozycji; oryginalnej projekcji/pozy nie dostarczono. Law 14 dotyczy stopy w chwili kopnięcia, nie samego środka ciała.',
    'medium',
    'Sprawdzić stopę/kamerę w rzeczywistym zgłoszonym snapshotcie, gdy będzie dostępny.',
    'Nie regulować szans obrony na podstawie wyglądu.',
  ],
  [
    'F4',
    'Keeper handover i długie wznowienia są stabilne',
    `Silny–słaby: błędy przy ${failures.rows.map((r) => number(r.at, 3)).join(' / ')} s; dwa main-cohort mecze cenzorowane na 7200 s.`,
    'Crash lub nieskończone preparation w powtarzalnym stanie.',
    'Pełne domknięcie obu okresów.',
    'Pełne seedy, replay jednego ticka, transient podwójny keeperRole i wyłączenie obserwatorów.',
    'Odrzucona stabilność. Awaria handover ma wąski odpowiednik mechaniczny; cenzorowane mecze zachowano osobno.',
    'high',
    'Najpierw PR172: keeper appointment przed geometry, potem wall/readiness i pętla naliczania straconego czasu.',
    'Usunięcie samej asercji/mapy może ukryć nieprawidłowe role lub umożliwić nielegalny restart.',
  ],
].map(
  ([
    id,
    candidateCause,
    observation,
    prediction,
    counterprediction,
    experiment,
    interpretation,
    confidence,
    implementationCandidate,
    regressionRisk,
  ]) => ({
    id,
    observation,
    candidateCause,
    prediction,
    counterprediction,
    experiment,
    measurement: observation,
    interpretation,
    confidence,
    implementationCandidate,
    regressionRisk,
  }),
);
writeFileSync(
  'docs/performance/PR171-hypothesis-results.json',
  JSON.stringify(
    {
      version: 1,
      fullMatches: b.fullMatches,
      totals,
      centralMidfield: cm,
      shotOutcomes: outcomeCounts,
      hypotheses,
    },
    null,
    2,
  ),
);
const table = [
  [
    'Metryka / zespół / mecz',
    'MFL średnia / mediana / P10–P90',
    'StatsBomb średnia / mediana / P10–P90',
  ],
  ...[
    ['Próby podań bez crosses', 'passesAttempted', 'passesWithoutCrosses'],
    ['Strzały', 'shots', 'shots'],
    ['Celne (definicje poniżej)', 'shotsOnTarget', 'shotsOnTargetConservative'],
    ['Gole', 'goals', 'goalsFromShots'],
    ['Rożne', 'corners', 'corners'],
  ].map(([label, mfl, real]) => [
    label,
    `${number(b.summary[mfl].mean)} / ${number(b.summary[mfl].median)} / ${number(b.summary[mfl].p10)}–${number(b.summary[mfl].p90)}`,
    `${number(ref.distributions[real].mean)} / ${number(ref.distributions[real].median)} / ${number(ref.distributions[real].p10)}–${number(ref.distributions[real].p90)}`,
  ]),
];
const markdownTable = (rows) =>
  rows
    .map(
      (r, i) =>
        `| ${r.join(' | ')} |${i === 0 ? '\n| ' + r.map(() => '---').join(' | ') + ' |' : ''}`,
    )
    .join('\n');
const fixtureTable = [
  ['Rodzina / odwrócona', 'Formacje', 'Wynik', 'Podania', 'Strzały', 'Czas kanoniczny s'],
  ...b.fixtures.map((r) => [
    `${r.fixture.family} / ${r.fixture.reversed}`,
    `${r.fixture.home.formation} / ${r.fixture.away.formation}`,
    `${r.score.home}:${r.score.away}`,
    r.reconciliation.passAttempts,
    r.official.home.shots + r.official.away.shots,
    number(r.time, 3),
  ]),
];
const normalShots = [
  ['Kontrolowany stan', 'Kategorie okazji', 'Opcje strzału / wykonalne', 'Pierwszy wybór AI'],
  ...probes.shots
    .filter((r) => r.seed === 'pr171-case-a')
    .map((r) => [
      r.name,
      r.opportunity.category,
      `${r.generated} / ${r.executableAtSnapshot}`,
      r.initialChosen?.type ?? 'brak',
    ]),
];
const questions = [
  `Rozkłady: ${b.fullMatches} pełnych meczów, ${b.teamRows.length} obserwacji zespołu; tabela powyżej i baseline.json.`,
  'Porównywalne strukturalnie: release podań po wyłączeniu crosses, shots/outcomes, gole, rożne. Kontrola przyjęcia, possession i live time nie są bezpośrednio zgodne.',
  'MFL passes zawierają throw-ins i dystrybucję GK, wyłączają crosses; touches oznaczają epizody kontroli, nie pojedyncze dotknięcia stopy.',
  `${totals.passesAttempted} uzgodnionych release; nadmiar nie wynika w tej próbce z dublowania oficjalnej księgi. Stary presentation event może się powtórzyć.`,
  `${number(b.summary.passesPerControlledSequence.mean)} podań na controlled sequence i ${number(b.summary.passesPerLiveMinute.mean)} na live minutę zespołu; rozkłady i jawne mianowniki w JSON.`,
  `${counters.passBackward ?? 0} wstecz / ${counters.passLateral ?? 0} boczne / ${counters.passForward ?? 0} forward; ${counters.reciprocalConsecutivePass ?? 0} kolejnych powrotów. To nie są identyczne definicje długiej pętli.`,
  `${cm.receptions}/${totals.passesCompleted} ukończeń do CM (${number((100 * cm.receptions) / totals.passesCompleted)}%); indywidualne minuty/formacje i oba udziały w midfield-connectivity.json.`,
  `W ${cm.samples} próbkach CM: ${cm.generated} generated, ${cm.credible} credible, ${cm.rankedFirst} ranked first. To oceny stanów, nie wszystkie rzeczywiste decyzje.`,
  'Opcje mogą istnieć i przegrywać z innym wsparciem; presja obniża forecast. Nie udowodniono jednej uniwersalnej przyczyny udziału CM ani konieczności bonusu pozycyjnego.',
  `${stage('controlled')} controlled → ${stage('final_entry')} final-entry → ${stage('box_entry')} box-entry. Główna utrata występuje przed regularnym dostępem do wykończenia.`,
  `${events('sampled_executable_shot')} próbkowanych stanów z wykonalną opcją; wiarygodność ${stage('credible_position')} sekwencji. Sam wygenerowany daleki shot nie jest dobrą okazją.`,
  `${counters.samplesShotBelowPass ?? 0} próbek shot-below-pass / ${counters.samplesWithShot ?? 0} próbek z shot. Oddzielone od rzeczywistej selekcji.`,
  `${counters.shotSelectionsObserved ?? 0} zaobserwowanych zmian latestAction na shot; ${totals.shots} release publicznych. Kontrolowane naturalne wybory oraz późniejsze strzały są rozdzielone w probes JSON; brak pełnego identyfikatora anulowanej selekcji.`,
  `Pełne mecze: ${JSON.stringify(outcomeCounts)}. Osobne 72 przepisane kontakty: ${JSON.stringify(shotCounts)}.`,
  'Mechanizm obrony działa w kontrolowanych stanach. Niski naturalny wolumen i jakość okazji nie pozwalają oszacować populacyjnej skuteczności bramkarzy.',
  `${totals.corners} rożnych; niskie strzały/crosses oraz ograniczenie kierunku odbić. Udział każdego czynnika w lidze nie jest oszacowany.`,
  '8/8 testów zadanej trajektorii i ostatniego dotknięcia daje właściwe corner/goal-kick w obu orientacjach. To nie dowodzi realizmu generowania defleksji.',
  'W straight fixture prompt pojawia się w trakcie niedokończonego carry. Presja ma osobny przypadek; nie wyłączono reakcji na nową sytuację.',
  'Behind/turn potrafią odzyskać piłkę; nie odtworzono uniwersalnego porzucania. Wszystkie 9 przypadków zachowuje kontakt, gap, odzyskanie i wynik.',
  'Live indirect: menu po 10.675 s i legal ready; DEV od razu mimo taker_not_ready. Oryginalny mecz pozostaje nieodtworzony.',
  'Zmiana kierunku/celów działa bez teleportacji. Przy gotowym kickoff jeden keeper wciąż 48.10 m od własnego końca; luka taktyczna, nie automatycznie złamanie Law 8.',
  'Live penalty: około 0.0695 m środka ciała od linii. Nie odtworzono wady oryginalnego obrazu; położenie stóp i projekcja wymagają jego snapshotu.',
  'Tak: goal target → click punkt (w tym wysokość) → technika → potwierdzenie, ze współdzielonym goalIntentToPitch i alternatywą klawiatury.',
  'Wsparte: recykling/niedobór wejść, ograniczenie odbić/orientacji, niedokończona relokacja, keeper-handover crash, live/DEV różnica i problemy liveness.',
  'Odrzucone w badanym zakresie: oficjalne pass micro-contact inflation, całkowicie niedziałające saves, uniwersalny live indirect prompt przed gotowością.',
  'Niepewne: populacyjna trudność pressing/keeper, dokładny udział pozycji i utility w CM, wpływ carry prompts na naturalne straty oraz oryginalny screenshot.',
  `Koszt: nowy audit wobec istniejących observerów ${number(perf.incrementalAuditRuntimePercent)}%; cały research wobec plain ${number(perf.allResearchRuntimePercent)}%. Małe seryjne próby, nie FPS ani dowód przyspieszenia.`,
  'Dwa pełne U-17 potwierdzone hashem całego stanu z wyłączonymi observerami; 9 krótkich przebiegów również identycznych. Cenzorowane replay sprawdzono osobno.',
  'Najpierw keeper handover/restart liveness i wiarygodna księga; potem orientacja/defleksje, kreacja/CM/shot rejection oraz human intent lifecycle.',
  'Rzeczywiste frozen decisions w końcowej tercji, izolowane duty/pressure i keeper normalne kontaktu, wpływ interakcji nowego celu, poprawny live-clock reference. Bez kwot.',
];
const report = `# PR171 — Match Reality Diagnostic Audit\n\nBaza: scalony PR170, \`1b7e2e0be1c36fe0fb8ddf730440b8ba2126842c\`. Audyt i badania, bez zmian rankingu, fizyki, prawdopodobieństw ani zapisów kariery.\n\n## Wynik i zakres\n\n${b.fullMatches} pełnych meczów kanonicznych z rzeczywistymi wygenerowanymi profilami; ${b.censored.length} przebiegi main-cohort osiągnęły limit 7200 s bez full_time. Dwie orientacje silny–słaby zakończyły się odtwarzalnym błędem geometrii po zmianie bramkarza. Próby cenzorowane i awarie nie są normalizowane do pełnych meczów. Dodatkowe seedy senior_balanced/wide_direct uzupełniają próbę; dobór nie zależy od wyniku.\n\nPodania są rzeczywiście gęste, a wejścia do niebezpiecznych stref i strzały rzadkie. Mechanizm saves działa. Potwierdzono ograniczenie kierunku defleksji i zgubienie orientacji w callerze strzału, lukę gotowości powrotu keeperów i awarię keeper handover. Udział CM jest niski, ale nie przypisujemy całej różnicy jednemu współczynnikowi.\n\n## Audyt początkowy i plan wykonania\n\nPrzejrzano PROJECT_STATE/ROADMAP, MATCH_BEHAVIOUR_CALIBRATION, PR152/156/157/162/163/168/170 oraz aktualnych właścicieli passDecision, shotOpportunity/options/resolver, goalkeeperIntervention, carryPursuit i restartLifecycle/laws/geometry. Błędna nazwa PR162_COMBINED z briefu nie istnieje; właściwy aktualny dokument to PR162_INTEGRATED_MATCH_REALISM_AUDIT.\n\n1. Ustalić definicje i właścicieli, zamrozić bazę.\n2. Stage A: cztery 30-sekundowe smoke i diagnostyczne regresje.\n3. Stage B: sześć rodzin × obie orientacje, deterministyczne seedy.\n4. Stage C: cztery uzupełniające mecze po wykryciu cenzorowania; osobne odtworzenie dwóch crashy i dwóch stanów liveness.\n5. Zamrożone kontrfaktyczne stany, 22 wybory AI, 72 osobne kontakty strzeleckie, 9 carry, 5 restart i 8 crossing.\n6. Referencja StatsBomb, observer parity/koszt, produkcyjna przeglądarka, pełne verify i plan PR172.\n\n| Istniejący właściciel | Pomiar / pozostała luka |\n|---|---|\n| playerMatchStats + matchCentreStatistics | Oficjalne próby/ukończenia/odbiorcy, epizody kontroli, minuty, sieć, posiadanie, wznowienia. Crosses mają odrębną księgę. |\n| matchFlowTelemetry/calibration | Tempo, podania/kierunki, strzały, obrony, possession spells. Krótki osobny test uzgadnia flow/public/nowy lejek. |\n| PR162 AttackingFunnelTracker | Controlled/progression/final/box/shot, przyczyny końca i przestrzeń. Rozszerzono opt-in o okresy, zegary, histogramy i CM sampling; bez drugiego silnika. |\n| PassingConnectivityTracker | Sieci i reciprocity, odległości, forecast CM przy release. Próbka do jednego ticka przed akcją nie jest dokładnym zapisem wewnętrznego rankingu. |\n| PR163 OffensiveContinuationTracker | Fizyczny release, wynik/przyjęcie, follow-up, cross/cutback, pięć sekund kontynuacji. |\n| PR168 tactical evaluator / agency / carryPursuit | Heurystyka i intencja są oddzielone od fizycznego wyniku; pierwotny debug użytkownika pozostaje niedostępny. |\n\nNieobserwowalne w pełnej próbie: każdy wewnętrzny ranking tuż przed wyborem, wszystkie odrzucone opcje przed generowaniem, niezależna gotowość taktyczna każdego receivera, pełne anulowane selekcje shot ID oraz oryginalna projekcja penalty. Fizyczne mikrokontakty per zawodnik nie są zebrane w pełnej kohorcie; publiczne control episodes są. Kohorta jest spectator: brak okazji decyzji ludzkiej wynika z konfiguracji, a jeden rozstrzygnięty wybór jest sprawdzony osobno w przeglądarce. Te braki nie są uzupełniane wymyślonymi danymi.\n\n## Słownik i zgodność definicji\n\n| Metryka | MFL / referencja / porównywalność |\n|---|---|\n| Próba podania | Jeden PassDiagnostic.passId fizycznego release; includes throws i GK distribution. StatsBomb Pass bez flagi cross; obie strony includes throws. Strukturalnie porównywalne, końcowa jakość reception różni się. |\n| Ukończenie / przyjęcie | MFL rzeczywisty teammate control/contact; StatsBomb brak pass.outcome. Deflection/recipient nie dowodzą tej samej kontroli. Częściowo zgodne. |\n| Długość | MFL <18 / 18–30 / ≥30 m; direction >5 m forward, <−2 m backward, reszta lateral. Lokalna definicja, bez narzucania provider progressive. |\n| Cross / cutback | Kanoniczne oddzielne cross sourceAction/intent; nie dorabiać klasyfikacji z samego położenia. |\n| Touches | Publiczne touches to epizody kontroli PR152. Fizyczne mikrokontakty contactControlTelemetry są odrębne. Nie porównywać 1:1 z provider Ball Receipt. |\n| Posiadanie | MFL czas ostatniego ustalonego live-possession, także lot; setup/postGoal poza mianownikiem. Provider possession IDs opisują inne sekwencje. Procentów i duration nie traktować jako zgodnych. |\n| Sekwencja lejka | Początek przy kontrolowanym owner; lot/loose nie rozpoczyna nowej. Zmiana team/stoppage zamyka. Starts in final/box nie są automatycznie wejściem. |\n| Shot / on target | Jeden released shot ID, wynik aktualizuje go raz; final goal/save = on target. Block/frame poza nim. StatsBomb Goal/Saved/Saved to Post, bez Saved Off Target; frame rozróżniony. Zbliżone, nie identyczne. |\n| Corner / goal kick / free kick | MFL award, a StatsBomb Pass typu Corner to wykonanie. Jeden niewykonany końcowy award może różnić totals. |\n| Live / elapsed | MFL live excludes setup/postGoal; per90Elapsed używa final seconds wraz z doliczeniem. Referencja elapsed sumuje Half End okresów 1–2. Nie ma zgodnego live-clock. |\n| Dostępny CM / viable shot | Próbkowane forecast/ranking w cooldown≤0, najwyżej raz na 2 s. Nie są pełnym licznikiem faktycznych decyzji; goal visibility/xG to heurystyka. |\n| Zakończenie ataku | Canonical loss cause + restart; backward/hold to działania wewnątrz sekwencji, nie automatyczna strata. Nie utożsamiać end claim z dowiedzioną przyczyną błędu technicznego. |\n\n## Dane rzeczywiste\n\nData: **StatsBomb Open Data** ([repozytorium](https://github.com/statsbomb/open-data), [opis eventów](https://github.com/statsbomb/open-data/tree/master/doc), [Media Pack / logo](https://statsbomb.com/media-pack/)). Rewizja \`${ref.commit}\`, 12 pierwszych chronologicznych spotkań grupowych MŚ 2022, 24 zespołowe obserwacje; match IDs, daty, immutable URLs i SHA256 plików są w reference-comparison.json. Nie kopiujemy eventów do gry. Logo poniżej jest niezmodyfikowaną kopią zasobu media-pack; dokładny mirror zapisano w images/pr171/README.md. Jest to seniorski turniej elitarny; nie stanowi celu celności/tempa dla akademii. Brak adekwatnej referencji U-17 jest jawnym ograniczeniem.\n\n<img src="images/pr171/statsbomb-logo.png" alt="StatsBomb" width="240" />\n\n${markdownTable(table)}\n\nMFL completion: średnia ${number(b.summary.completionPercentage.mean)}%, mediana ${number(b.summary.completionPercentage.median)}%, zakres ${number(b.summary.completionPercentage.min)}–${number(b.summary.completionPercentage.max)}%. Referencyjna liczba podań ma rozrzut ${ref.distributions.passesWithoutCrosses.min}–${ref.distributions.passesWithoutCrosses.max}, strzałów ${ref.distributions.shots.min}–${ref.distributions.shots.max}; zero-shot realnego zespołu jest zachowane. Nie ma dokładnego celu ani kwoty.\n\n## Kohorta i niepewność\n\n${markdownTable(fixtureTable)}\n\nRaw raporty pozostają w work/pr171-full poza Git; publiczne kompaktowe pliki zachowują manifesty, SHA256, kompletne publiczne statystyki, per-period ledger, sieci i bounded traces. Łączny czas ścienny pełnych runów: ${number(b.totalWallMs / 60000)} min; część była równoległa i konkuruje z verify, więc nie jest to benchmark wydajności. Wszystkie mają dt=0.025 s. Zwykłe CI nie uruchamia kohorty.\n\nMean/median/P10/P90/min/max/SD i liczby obserwacji są w baseline.json; CI średniej liczy bloki projektu z zależnymi mirrorami, a nie 2×team×match jako niezależne próby. Jest eksploracyjny dla wybranych fixture, nie reprezentatywny dla ligi. Wyników z 7200 s bez końca nie przelicza się na 90. U-17 ma tylko jedną parę seedów; formacja/style/atrybuty nie tworzą pełnego factorial.\n\n## Lejek ataku i udział CM\n\n${stage('controlled')} kontrolowanych sekwencji → ${stage('final_entry')} z final-entry → ${stage('box_entry')} z box-entry → ${stage('credible_position')} z próbkowaną wiarygodną pozycją → ${totals.shots} fizycznych strzałów. Stages są zbiorami epizodów, events są częstotliwościami; long-range shot nie musi przejść przez box, więc nie mnożyć tych stopni jako obowiązkowego liniowego łańcucha. Final-continuation trwa ≥2 s. Atak może zacząć się już wysoko.\n\nPasses/controlled sequence: średnia ${number(b.summary.passesPerControlledSequence.mean)}, mediana ${number(b.summary.passesPerControlledSequence.median)}; passes/live minute zespołu: ${number(b.summary.passesPerLiveMinute.mean)}, P10–P90 ${number(b.summary.passesPerLiveMinute.p10)}–${number(b.summary.passesPerLiveMinute.p90)}. Histogramy mają domknięte górne koszyki ≥64 podań/≥600 s; nie są dokładnymi surowymi percentylami duration. Domknięte sekwencje nie obejmują otwartej sekwencji cenzorowanego meczu.\n\nCM: ${cm.receptions} rzeczywistych przyjęć (${number((100 * cm.receptions) / totals.passesCompleted)}% team completions łącznie), ${cm.attempts} prób podań. Rozkład per zawodnik obejmuje faktyczne minuty, share of attempts i share of completions; te mianowniki nie są wymienne. Sampling CM: ${cm.generated}/${cm.samples} wygenerowanych, ${cm.credible} credible forecast, ${cm.rankedFirst} najwyżej w rankingu. Próbki nie oznaczają wszystkich rzeczywistych ofert/wyborów ani dowodu, że dany cel został pominięty w konkretnym release.\n\nKontrolowany CM pod presją: score badanego odbiorcy 53.772→7.684, expected retention około 0.960→0.449. Otwarty gifted90 vs ordinary50 zmienia score 53.548→53.996, w obu wygrywa inne krótkie wsparcie (także CM). Nie dowodzi to automatycznie preferencji skrzydeł. W pełnych meczach sieci i spatial moments pokazują udział, ale do korekty pozycji/utility trzeba utrwalić zróżnicowane rzeczywiste zamrożone stany.\n\n## Strzały, obrony i rożne\n\n${markdownTable(normalShots)}\n\nTabela pokazuje pierwszy naturalny wybór AI po ocenie wspólnej polityki, bez wymuszania shot. W eight-second follow-up mogą paść późniejsze strzały innego zawodnika; nie są wykonaniem pierwotnie odrzuconej opcji. Pierwsza piłka jest dostawą innego aktora, nie własnym touch; pushed-ball świadomie bada rozbieżność nominalnego owner i fizycznego gap.\n\nNaturalne outcomes: ${JSON.stringify(outcomeCounts)}. Osobne przepisane 72 strzały: ${JSON.stringify(shotCounts)}. Są osiągalne catch/parry, block i miss; nie jest to empiryczne save% ligi. Keeper weakness/pozycja i blocker mają swoje komórki.\n\n\`deterministicRebound\` narzuca znak X zależny od orientacji zamiast normalnej kontaktu; \`handleShotContact\` podaje \`shooter.team\`, tracąc endsSwitched. Osiem zamrożonych par wejść wykazuje różnicę po przerwie. \`parry\` i \`parry_away\` nie sterują tym fizycznym kierunkiem. To niezależne ograniczenie obok niskiego wolumenu. Osiem supplied last-touch/outgoing crossing daje poprawne corner/goal-kick w obu kierunkach, także po zmianie ostatniego dotknięcia. Nie jest to dowód poprawnego wygenerowania każdego block→behind-goal/parry→behind-goal; właśnie tych fizycznych wariantów brakuje i PR172 powinien je zbudować bez fabrykowania award.\n\n## Ciągłość, wznowienia i awarie\n\n9 carry probes zachowuje initial pursuit/agency, pierwszy prompt z ownsBall/ballGap/destinationGap, odzyskanie, realny ground contact i wynik. W straight prompt jest przed końcem odległego celu; behind-ball/sharp-turn pokazują zachowanie części naprawy PR168. Nie twierdzimy, że wszystkie takie prompty powodują stratę. Wrogi owner w intercepted ma fizyczną pozycję przy piłce; out/unreachable nie zyskuje magnetycznego odzyskania.\n\nLive indirect free kick: decyzja i legal readiness po 10.675 s. DEV setup: menu od razu mimo taker_not_ready. Live penalty: 11.3 s, keeper center 0.0695 m od linii, DEV 0 m. Brak oryginalnego obrazu i modelu stopy nie pozwala orzec, że zgłoszony kadr był fizycznie błędny. [IFAB Law 14](https://theifab.com/laws/latest/the-penalty-kick/) dotyczy części stopy przy kopnięciu.\n\nHalftime: directions/targets zmieniają się, bodies relokują fizycznie. Przy pierwszej zgodzie po 22.75 s jeden keeper ma depth≈48.10 m. [Law 8](https://theifab.com/laws/latest/the-start-and-restart-of-play/) wymaga własnej połowy, więc to luka taktycznej kompletności, nie automatycznie naruszenie przepisów. Szatnia pozostaje ceremonią.\n\nSilny–słaby crash: ${failures.rows.map((r) => `${r.reversed}: ${number(r.at, 3)} s`).join('; ')}. Każdy pre-crash snapshot odtwarza błąd jednym tickiem. Podczas wejścia GK nadal istnieje emergency goalkeeperRole na zawodniku pola; geometry wyklucza dwóch keeperów z outfield, lecz umieszcza jednego, a spreadCluster dereferencjonuje brakujący punkt. Kontrfaktyczne usunięcie jedynie tego przejściowego flag daje 22 cele. Zachowano pełne seedy i mały reproducer; produkcja pozostaje niezmieniona.\n\nDwa main-cohort limity 7200 s mają osobne replays bez observerów i kontekst restart/timekeeping. Central possession reversed stoi od 489.225 s w free_kick_wide z wall_developing; stracony czas i requiredEndAt rosną wraz z oczekiwaniem. To błąd liveness, nie normalny rozkład doliczenia. Press-low w drugiej połowie także pozostaje w free_kick_wide/preparing z wall_developing; wymagany koniec wynosi 7380.025 s przy limicie 7200 s. Pełny kontekst obu stanów i identyczne hasze replay bez observerów zapisano w censored-replays.json.\n\n## Observer, pamięć i walidacja\n\nRead-only observer nie jest importowany przez normalny runtime meczu, nie zapisuje save i nie steruje rankingiem. LRU identities≤512, pending origins≤64, ślady 32/24, audit samples≤64, shot records≤128; agregaty liczą dalej. Mapy mają klucze z ograniczonego rosteru, dwóch teamów/okresów i skończonych eventów; brak historii klatek. Stare eventy prezentacji są filtrowane przez canonical release timestamp/ID. Regresja obejmuje powtórzenie i ponowną emisję po wyparciu z cache.\n\nPełne U-17 w obu orientacjach (oba hasze ON/OFF, ticks i manifesty zachowane w observer-equivalence.json): identyczny SHA256 całego kanonicznego stanu przy observer ON/OFF (wynik, statystyki, decyzje, ledgery). Krótka seria: wszystkie ${perf.rows.length} hasze identyczne. Flow/public pass totals uzgodnione. Ranking noise jest niezależnie seed-derived; żaden współdzielony stan RNG nie jest zmieniany. Nie deklarujemy identycznej liczby wszystkich wywołań niezależnych generatorów diagnostycznych.\n\nPo rozgrzaniu każdego trybu, seryjne 3×60 s: plain ${number(perf.timings.plain)} ms; existing ${number(perf.timings.existing)} ms; extended ${number(perf.timings.extended)} ms. Przyrost nowego audit ${number(perf.incrementalAuditRuntimePercent)}%; całości research ${number(perf.allResearchRuntimePercent)}%. Ujemna różnica median nie dowodzi przyspieszenia: w tej małej próbie zmienność maskuje dodatkowy koszt audytu. Po 60 s serialized retained payload wynosi 126005 B dla istniejących observerów i 136045 B z audit (+10040 B); surowe czasy są w observer-equivalence.json; nie są izolowanym V8 heap ani FPS. Normalna kariera nie włącza tych śladów, save delta=0 przez brak integracji serializacji.\n\nPełne \`npm run verify\`: **${verification.status}**. ${verification.summary} Końcowe sprawdzenia CLI są zapisane w verification.json. Bez osłabiania testów, workerów lub timeoutów.\n\nBrowser: production build, nowa kariera pr171-browser, CM Rozgrywający → Play3D → rzeczywiste „Podaj do nogi” → Simulate Remainder → wynik 2:1 i jeden rozstrzygnięty wybór → reload i jedno appearance. Nie opisujemy tej hybrydy jako pełnego browser-played 90-min meczu. Żaden audit panel nie został dodany do gameplay. Produkcja z jawnym DEV query otwiera Lab: rzeczywiste modele/stadion WebGL, pauza i pobrany benchmark sesji (SHA w browser.json). CLI diagnostic/export pozostaje poza zwykłą karierą. Szary ekran na zrzucie podania to tryb ukrytego przewijania; osobny zrzut Lab potwierdza rendering.\n\n![Lab — rzeczywisty stadion i modele WebGL](images/pr171/lab-3d.png)\n\n![Kariera — decyzja podania podczas ukrytego przewijania](images/pr171/career-human-pass.png)\n![Zapisany wynik](images/pr171/career-result.png)\n\n## PR172 — kolejność wdrożenia\n\n| Priorytet / przyczyna | Moduły i wąska korekta | Efekt pomiarowy / ryzyko / regresja |\n|---|---|---|\n| P0 keeper handover | substitutions, matchGoalkeeper, restartGeometry: uzgodnić keeper appointment po wejściu, przed geometry; jawnie zagwarantować target każdemu uczestnikowi. | Obie strong_weak kończą bez exception; powtórzyć ten sam jeden tick i zmianę GK w obu kierunkach. Nie ukrywać nielegalnego składu samym fallbackiem. |\n| P0 restart liveness | restartLifecycle/Geometry/Laws, stoppageLedger/timekeeping: zidentyfikować wall_developing i nieosiągalne cele; rozdzielić przyczynę czekania od pętli added-time. | Oba censored replays dochodzą do legalnego release/full_time bez timeout/teleport. Chronić mur i human ownership. |\n| P1 defleksja/orientacja | matchSimulation handleShotContact, ballFlight: zachować pełny orientation; dopiero osobno projektować normalną kontaktu i energię/rozróżnienie parry. | Symetryczne fizyczne wejścia po przerwie; block behind/in-play, parry behind/to-attacker, rapid last touch i niezmienny shot ID. Ryzyko wzrostu rebound goals. |\n| P1 kreacja i CM | tacticalPositioning/support, passDecision, matchActions: najpierw rzeczywiste frozen states od generation po wykonanie; zmieniać jeden wykazany człon. | Raportować udział CM, retained progression, final→box i jakość strat; bez minimalnych liczników. Ryzyko odsłonięcia środka lub masowych strat. |\n| P2 shot choice/contact | shootingOpportunity/options, onBallPreparation, resolver: kontrolować wiarygodne odrzucone opcje i kontakt pushed-ball, nie podnosić globalnie shot utility. | Ten sam open striker/winger/block/first-time/counter działa i może chybić; sprawdzić selected→release/cancel po stabilnym ID. |\n| P2 human intent | playerDecision, possessionAgency, carryPursuit/Execution: domknięcie carry i ważność celu osobno od pilnej nowej sytuacji. | Straight/reached/behind/turn, rzeczywista presja, przechwyt i out; brak magnesu, target completion guarantee i blokady ważnych decyzji. |\n| P2 halftime | restart readiness/targets: określić i sprawdzić taktyczną gotowość bramkarza przed drugą połową. | Właściwy własny koniec i release bez teleportacji/ceremonialnego obowiązku szatni. |\n| UX po mechanikach | TacticalMatchSandbox, renderer/model/goalCoordinates: goal → click horizontal+height → technika → execute; keyboard, sliders jako alternatywa. | Goal point roundtrip w obu orientacjach, anulowanie/fokus/replay, fizyka i shot type pozostają wspólne. Istniejący world-goal picker już daje punkt; zmienia się kolejność interakcji. |\n\nWyższe priorytety to mechanicznie odtworzone poprawki. Pozycja/ranking i tempo mają proponowane eksperymenty, nie dowiedziony uniwersalny współczynnik naprawczy. Pełny rejestr observation/prediction/counterprediction/measurement/confidence/risk: hypothesis-results.json.\n\n## Zachowana roadmapa\n\nPR172 mechaniki zgodne z dowodami → PR173 generacje/siła świata → PR174 summary/PlayStyles. W PR174: spójne start/sub/entry/exit/partner i wyłącznie modelowany powód zmiany (nie wnioskować poor performance z oceny). Po PR174 UX: zwarty pojedynczy wiersz fixture, zbiorczy wiersz archiwum sezonu, bez duplikatów historii; kalendarz podąża za career.currentDate, pokazuje prawdziwe terminy, trening/życie/urazy i rzeczywisty okres niedostępności. Nie tworzyć treningów dla pustych komórek. Udowodniony blokujący błąd daty może mieć oddzielny wcześniejszy maintenance PR.\n\n## Odpowiedzi na 30 pytań odbioru\n\n${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\n## Mapa dowodów\n\n| Artefakt | Zawartość |\n|---|---|\n| [PR171-baseline.json](performance/PR171-baseline.json) | Manifesty, seedy, role, per-period ledger, publiczne statystyki i rozkłady |\n| [PR171-attacking-funnel.json](performance/PR171-attacking-funnel.json) | Lejek, straty, histogramy i bounded traces |\n| [PR171-midfield-connectivity.json](performance/PR171-midfield-connectivity.json) | Przyjęcia CM, ekspozycja/rankingi i sieci |\n| [PR171-reference-comparison.json](performance/PR171-reference-comparison.json) | Definicje, immutable źródła StatsBomb, SHA256 i rozkłady |\n| [PR171-controlled-probes.json](performance/PR171-controlled-probes.json) | Naturalne decyzje AI, CM i carry |\n| [PR171-shot-resolution.json](performance/PR171-shot-resolution.json) | 72 osobne przepisane kontakty strzałów |\n| [PR171-restart-continuity.json](performance/PR171-restart-continuity.json) | Live/DEV restart, przerwa i ostatnie dotknięcie |\n| [PR171-mechanical-counterfactuals.json](performance/PR171-mechanical-counterfactuals.json) | Kierunek odbicia i przejściowe role keeperów |\n| [PR171-engine-failures.json](performance/PR171-engine-failures.json) | Seedy i one-tick replay awarii silny–słaby |\n| [PR171-censored-replays.json](performance/PR171-censored-replays.json) | Bezobserverowe replay i kontekst restart/timekeeping |\n| [PR171-observer-equivalence.json](performance/PR171-observer-equivalence.json) | Pełne hasze ON/OFF, koszt i retained payload |\n| [PR171-hypothesis-results.json](performance/PR171-hypothesis-results.json) | Obserwacja, przewidywanie, kontrprzewidywanie, wynik, niepewność i ryzyko |\n| [PR171-verification.json](performance/PR171-verification.json) | Bramka verify i końcowe kontrole skryptów |\n| [PR171-browser.json](performance/PR171-browser.json) | Smoke produkcji, commit/reload i eksport DEV |\n\n## Odtworzenie\n\n\`npm ci\`, potem \`npm run generate:world-db\`. Research jest jawnie opt-in:\n\n\`npm run benchmark:reality-audit -- --families=youth_native,senior_balanced,central_possession,wide_direct,press_low\`\n\n\`npm run benchmark:reality-audit -- --families=senior_balanced,wide_direct --replicate=extra-a\`\n\n\`node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr171Failure.ts\`\n\n\`node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/diagnosePr171Censored.ts\`\n\n\`npm run benchmark:reality-audit -- --mode=confirm --families=youth_native\`\n\n\`npm run benchmark:reality-probes\`\n\n\`node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr171Mechanics.ts\`\n\n\`npm run benchmark:reality-reference -- --download\` (jawny download tylko do research cache). Offline używa utrwalonego cache/revision; immutable commit/URL w JSON pozwala odtworzyć dokładną referencję.\n\nPo zatrzymaniu innych obciążeń: \`node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr171Performance.ts\`, następnie \`node scripts/summarizePr171.mjs\` i \`node scripts/reportPr171.mjs\`. Zmiana optional replicate dodała tryb w harnessie bez zmiany domyślnych fixture; hash każdej użytej wersji harnessu jest jawny w receiptach, ten sam frozen core sourceHash. Nie łączyć danych z folderu pr171-superseded.\n\nWymagana bramka: \`npm run verify\`. Ograniczenia i niepowodzenia są częścią dowodu, nie pominiętymi próbkami.\n`;
writeFileSync('docs/PR171_MATCH_REALITY_DIAGNOSTIC_AUDIT.md', report);
console.log(
  `wrote report with ${b.fullMatches} complete fixtures and ${hypotheses.length} hypotheses`,
);
