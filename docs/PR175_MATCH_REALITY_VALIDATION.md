# PR175 — Independent Match Reality Validation

**Ocena: NOT READY jako źródło statystycznej kalibracji PR177.** Nowe 12 pełnych meczów daje średnio 1.17 strzału i 1775.50 podań na mecz. Klubowa referencja ma odpowiednio 25.50 i 1166.17. Te różnice mają większe znaczenie niż wiarygodnie wyglądający końcowy wynik.

PR dostarcza niezależną walidację, powiązane ledgers, kontrolowane próby, korekty **diagnostyki** i jawną ocenę gotowości. Nie zmienia produkcyjnej piłki, decyzji, RNG, zegara, asekuracji ani formatu save. Nie znaleziono wystarczająco izolowanej nowej usterki mechanicznej uzasadniającej zmianę współczynników. Brak takiej zmiany jest wynikiem bramek dowodowych, a nie deklaracją realizmu.

## 1. Źródła i audyt

Baza: scalony PR174 **d6556eba33d240bfc6ed845e256b185e9a24bc4a**, head review **63957f998884e4f8397164ada636070940fbdb3e**. Hash wszystkich produkcyjnych plików matchSimulation: **9f6123b5e9861d07b945253c0f1a98934326fb66da8246ca85fd96735c761d21**. Frozen K: **afa0c77c984b8a5b5040dbd976836496c4ccc54034de214f0392a26a426278da**.

Przeczytano PROJECT_STATE, ROADMAP, MATCH_BEHAVIOUR_CALIBRATION i raporty PR171–174; zbadano canonical stepping, ranker, pass reception/first-touch, shot opportunity/eligibility/execution, goalkeeper intervention, restart laws/last-touch, combination lifecycle, threat memory i career accounting. Wykorzystano istniejące factories/trackers oraz opt-in loader faktycznych decyzji PR172. Nie ma drugiego symulatora.

Różnica K→merged dotyczy combinationPlay: każdy runner wymaga dwóch dostępnych nieuczestniczących graczy asekuracji; runner nie może liczyć siebie. [Source manifest, exact diff i hashe harnessów](performance/PR175-source-baseline.json). Historyczne receipts/archiwa pozostają niezmienione.

## 2. Ponownie ustanowiona baza

Wszystkie 16+8 osiąga full_time; pełne wejścia każdej pary są identyczne. Spośród 24 whole-state outcomes 16 pozostaje identycznych względem K, a 8 się zmienia. To nowe pomiary post-review, nie przemianowane dane K.

| Metryka | Oryginalne 16 K→merged | Wcześniej obejrzane 8 K→merged |
|---|---:|---:|
| passesAttempted | 33609→33661 | 14132→14210 |
| shots | 24→24 | 11→9 |
| goals | 19→18 | 6→4 |
| possessionLost | 4080→4028 | 1671→1700 |
| fouls | 276→282 | 47→43 |
| corners | 3→4 | 6→5 |

[Każda para, delta i rozkład](performance/PR175-merged-baseline-comparison.json). Oryginalne 16 obejmuje osiem seed/design blocks z lustrami; wcześniej reserved osiem ma cztery bloki. Nie są świeżym holdoutem.

## 3. Nowe fixtures i zasady walidacji

Przed zmianami gameplay zamrożono 12 seedów i pełne input hashes: sześć development, sześć validation. Brak mirrors. Warianty obejmują U-17, seniorów, siłę, 4-3-3/4-4-2/4-2-3-1/3-5-2/3-4-2-1, possession/direct/press/counter, pace, technikę i keeper skill. Preskryptywne atrybuty to jawne stress strata, nie losowa populacja polskiej ligi. Dwa youth designs współdzielą bazową populację klubów i mają różne ustawienia/XI.

[Frozen manifest](performance/PR175-new-fixture-manifest.json), [final candidate freeze](performance/PR175-candidate-freeze.json). Validation została odczytana dopiero po freeze; nie zastosowano późniejszego tuningu. No production gameplay correction accepted: development and controlled evidence isolate severe access/selection discrepancies but do not establish a safe narrow mechanical/coefficient repair. Freeze unchanged merged PR174 for one sealed validation evaluation; no tuning after opening it. [Końcowa walidacja](performance/PR175-post-correction-validation.json).

Staged runners zapisują zakończone mecze, potrafią wznowić zgodne receipts i zachowują failure state. Limit 7200 s nie jest automatycznym full_time. Kosztownych cohortów nie dodano do verify. Zakres 12 nowych meczów pozostawiono przy 24 historycznych oraz dodatkowych replay/career/controlled runs; nie udaje on precyzji 24 niezależnych nowych spotkań.

## 4. Real-football reference i definicje

<img src="https://static.hudl.com/craft/productAssets/statsbomb_icon.svg" alt="StatsBomb" width="48" height="48" />

**Dane: StatsBomb Open Data**, immutable commit **4b73468fc5b0f1950f9f66fada70ad3a4f9327cb**. Zachowano 12 chronological group-stage MŚ 2022 z PR171. Dodano 12 chronological available Bundesliga 2023/24, competition 9/season 281, periods 1–2, bez selekcji po wyniku. Każdy event-file i lista meczów mają SHA256. Pinned inventory nie dostarczył odpowiedniej youth reference użytej do kalibracji.

[Metodologia i wszystkie źródłowe URL/hashe](performance/PR175-reference-methodology.json). Research podlega [StatsBomb user agreement](https://github.com/statsbomb/open-data/blob/4b73468fc5b0f1950f9f66fada70ad3a4f9327cb/LICENSE.pdf) i [attribution terms](https://github.com/statsbomb/open-data/blob/4b73468fc5b0f1950f9f66fada70ad3a4f9327cb/README.md); [provider media pack/logo](https://statsbomb.com/media-pack/). Nie redystrybuuje się event dumps ani nie wymaga downloadu w normalnych testach.

MFL pass = released PassDiagnostic, wraz z throws/restarts/GK distribution, bez crosses i non-shot headers. Comparator StatsBomb usuwa cross flag, lecz reception/control i possession IDs pozostają nieidentyczne. MFL shot = rzeczywisty shot ID; initial block/save i final goal mogą być etapami tej samej próby. Nie sumuje się ich jako rozłącznych wyników. MFL corners są awards, a provider Corner passes są rzeczywistymi deliveries; niewykonane końcowe wznowienie może dać różnicę definicji. World Cup i Bundesliga są porównaniem struktury seniorów, nie U-17 targetem. Per-90 używa rzeczywistej sumy okresów; live-minute comparison z real football nie jest obliczane, bo brak zgodnego zegara live.

## 5. Rozkłady i niepewność

| Na mecz | Nowe 12: średnia / mediana / zakres | MŚ12: średnia | Klub12: średnia |
|---|---:|---:|---:|
| passesAttempted | 1775.50 / 1832.00 / 1356–2156 | 1039.58 | 1166.17 |
| shots | 1.17 / 1.00 / 0–4 | 21.25 | 25.50 |
| goals | 0.75 / 0.50 / 0–2 | 2.75 | 3.67 |
| corners | 0.50 / 0.00 / 0–2 | 9.50 | 9.50 |

[Match/team-match/per90, SD, P10/P90, pełny zakres, każdy outlier i splits](performance/PR175-independent-match-distributions.json). Jednostką wyniku jest mecz/design, nie tick, posiadanie ani strona drużyny. Nie deklaruje się istotności, population CI ani identyczności distribution między youth/senior. Duża liczba kontaktów nie zwiększa liczby niezależnych meczów. Kontrolowane variants i repeated replays są zależne.

## 6. Lejek i największy bottleneck

| Obserwowalny etap | Epizody |
|---|---:|
| controlled | 3076 |
| generated_support | 2775 |
| progressive_candidate | 2820 |
| progressive_selected | 2338 |
| physical_progression | 1604 |
| shot_candidate | 2214 |
| executable_shot_candidate | 2214 |
| final_third_control | 632 |
| box_entry_candidate | 218 |
| penalty_area_control | 69 |
| credible_opportunity | 19 |
| shot_selected | 6 |
| physical_shot_release | 8 |

Właściwy wniosek: podaż niebezpiecznych kontrolowanych stanów jest bardzo mała. 28207 actual owner choices zawiera tylko 54 credible/high_value observations w 19 epizodach. Z tego 52 ma generated shot, 5 wybiera shot, a alternatywy to carry=38, pass=9, hold=2. Widoczna jest również selekcja przeciw marginalnym strzałom, ale ticki tej samej okazji nie są osobnymi szansami.

ID epizodu, player/action-choice, canonical pass/shot/combination i physical timestamps są w pełnym archiwum. Shot candidate i selection to osobne fakty. Rutynowy zaakceptowany shot przechodzi eligibility/preparation/contact/release w jednej transakcji; nie ma fikcyjnego asynchronicznego wind-up. Incoming ma revalidation przy kontakcie. Wybranych hooks=8, releases all-phase=14, links=8, selected-without-release=0. Restarty mogą ominąć owner hook. [Pełny funnel](performance/PR175-possession-to-shot-funnel.json).

Rzeczywiste progressive releases do box target z zewnątrz: 2; wyniki={"completed":1,"intercepted":1}. Forecast spełnia istniejące audytowe warunki w 2 przypadkach; target nie dowodzi actual box control. [Physical pass-to-recipient chains](performance/PR175-territory-to-danger.json).

To nie jest oracle wszystkich możliwych przestrzeni: generated_support/progression/box candidates są audytowalnymi propozycjami rankera, a nie dowodem, że każdy niewygenerowany ruch był niemożliwy. Exit causes odróżniają claim/interception/tackle, failed control, pass-out, foul/restart, goal i period end; nie każde niestrzelające posiadanie jest wadą. Najmniejszy przyszły repair powinien izolować pojedynczy łańcuch final-third→box/credible option przed zmianą wag.

## 7. Cadence i recykling

21306 release IDs zgadza się z oficjalnymi attempts. Kierunki: {"forward":6333,"lateral":5087,"backward":9886}; first-time execution=417; reciprocal consecutive=1416. Mediana długości=16.26 m, kontrola→wybór/release=0.95 s, lot→rozstrzygnięcie=1.25 s, reception→next release=0.95 s. Physical/awareness preparation nakładają się; nie dodaje się ich mechanicznie. Owner timings mają 20403 zgodnych ścieżek; stare hints/restarts/incoming nie udają długiej kontroli. Self-reclaim jest oddzielony od teammate completion.

Clock exposure jest osobnym istotnym czynnikiem: średnio **87.03 min live** z 92.03 min elapsed (94.56%). Tożsamość passes/match = passes/live-minute × live-minutes jest dokładna dla MFL. [FIFA 30.11.2022](https://vod.fifa.com/refereeing/news/collina-weve-asked-referees-to-calculate-stoppage-time-more-accurately) raportowała średni actual playing time zbliżony do 59 min w dotychczasowych meczach i maksimum 67.5 min w France–Australia. To inna, szersza próba z niepodanym N i bez identycznej anotacji; użyto jej jako kontekstu bardzo długiej ekspozycji, **nie** do wyliczenia reference passes/live-minute z cudzych totals. Mało wyjść piłki, shots i restartów łączy się z długim live; nie skrócono sztucznie zegara ani nie wprowadzono przerw do osiągnięcia celu.

511 epizodów ma >=4 pass i <5 m retained gain; 98 traci >=10 m chwilowego zysku; 344 zawiera >=2 reciprocal exchanges. To deskryptory, nie etykiety błędu. Brak realnego matched contact clock uniemożliwia stwierdzenie, że wszystkie kopnięcia są fizycznie za szybkie. Nie wdrożono cooldownu. [Cadence](performance/PR175-passing-cadence.json), [recycling](performance/PR175-possession-recycling.json).

## 8. Strzały, gole, keepers i restarty

Gole=9, shot releases=14; final outcomes={"goal":9,"block":1,"save":4}, źródła goli={"penalty":4,"open_play":5}. Dodatkowy, nierozłączny rebound flag=2 wymaga wcześniejszego wyniku tego samego shot ID oraz canonical deflection/keeper evidence; penalty rebound zachowuje także źródło penalty. Wszystkie score transitions zachowano. Duplicates=0/0; brak release poza own-goal=0. Wysoka konwersja nie jest naprawiana kasowaniem goli ani dopisywaniem prób. Mean/median shot distance=9.46/10.09 m. Natural selection jest daleka od równomiernego zestawu strzałów z 12–30 m.

Oddzielny complete-state replay wszystkich 24 historical fixtures rozlicza 33 shots i 22 goli; źródła={"open_play":12,"set_piece_sequence":4,"penalty":6}; shot contexts={"open_play":24,"penalty":9}. Niepowiązane gole poza own-goal=0, duplicate shots/goals=0/0. Każdy final hash zgadza się z nową bazą, a dawne K receipts pozostają historyczne. [Historical goal-source ledger](performance/PR175-historical-goal-sources.json).

| Kontekst fizycznego strzału | Historyczne 24: strzały / gole | Nowe 12: strzały / gole |
|---|---:|---:|
| open_play | 24 / 16 | 8 / 5 |
| penalty | 9 / 6 | 6 / 4 |

Kontekst open_play obejmuje też strzały po rozegraniu wznowienia; źródło całej sekwencji jest osobnym polem. Same karne nie wyjaśniają ekstremalnej skuteczności: historyczny kontekst open_play nadal daje 66.67%, nowy 62.50%. Nowe osiem strzałów open_play ma średni dystans 8.29 m i zakres 4.55–12.00 m. To bardzo wąska selekcja sytuacji, nie dowód poprawnej kalibracji skuteczności ani ilościowe rozdzielenie accuracy/GK/selection.

Historyczne 24 strzały w tym kontekście mają średni dystans 9.33 m, medianę 9.14 m i zakres 4.63–20.37 m; rozkład presji i pełne geometrie są w ledgerze. Nieliczne dalsze próby nie stanowią wystarczającej próby do osobnej kalibracji dalekich strzałów.

Legal restart restriction potrafi przetrwać wiele posiadań; lastBoundaryCrossing może opisywać wcześniejsze wyjście. Finalny projector odrzuca te stare wskazówki bez continuous possession lineage. Raw hints pozostają zachowane w archiwum. Regression tests chronią przypadki starego restartu i starego gola. [Shot i goal ledgers](performance/PR175-shooting-outcomes.json).

208 prescribed shots (13 one-factor variants ×16 common seeds) przechodzi przez prawdziwy release/flight/defender/keeper. Base: {"goal":6,"save":10}; pressure: {"block":2,"save":9,"miss":2,"goal":3}; 30m: {"miss":9,"save":4,"goal":2,"block":1}; lane defender: {"block":13,"miss":2,"goal":1}; weak keeper: {"goal":14,"save":1,"block":1}; first-time slow: {"goal":5,"save":9,"post":1,"block":1}. Warianty nie są populacją naturalnych meczów, a częściowa non-monotoniczność małych próbek nie uzasadnia dostrajania accuracy. [Pełne physical outcomes i GK projections](performance/PR175-controlled-mechanisms.json).

Official natural saves=5, corners=6. Zero interwencji bez odpowiednich shots nie dowodzi wady GK. Audyt 6 rożnych sprawdza linię końcową, tożsamość i stronę ostatniego dotknięcia obrońcy oraz stronę wznowienia; rozbieżności=0. Brak quotas/teleportacji. [Keeper/corner/set-piece lifecycle i preparation durations](performance/PR175-goalkeeper-and-corners.json). Domyślne testy PR172 nadal obejmują physical glancing block→natural corner w obu orientacjach.

## 9. Pozycje, kombinacje i pressing

CM receptions=2112/16722 (12.63%), 29.52 na player-90. Użyto rzeczywistych minut, formacji, odejść/zmian i within-team shares. Slot central_midfielder nie rozdziela wszystkich duties; nie ogłoszono role realism na podstawie jednej liczby. [Player/role rows](performance/PR175-positional-involvement.json). Kontrolowane gifted/ordinary receiver probes zachowują ranking i forecasts; brak uniwersalnego OVR/CM bonusu.

Ukończone canonical combinations=77, pass_and_go=65, overlap=10, third_man=2. 77 ma późniejszy wybór runnera, 0 credible subsequent choice, 0 conservative shot linkage. Wymagany jest konkretny continuation Pass ID, actual reception i dalsza kontrola runnera do jego następnego fizycznego podania. Późniejszy recykling nawet w tym samym posiadaniu nie tworzy linku; raw broad hints są zachowane oddzielnie. [Conversion ledger](performance/PR175-combination-conversion.json). Ten licznik nie jest efektem przyczynowym względem kontrfaktycznego braku kombinacji.

20 controlled team continuations obejmuje press/third-man/overlap/underlap, open/covered/timed/weak/recovering. Pięć central press variantes daje pięć loss events i zero shots. Timed overlap może się ukończyć; underlap często przegrywa z alternatywą albo wygasa. Nie osłabiono pressera, rest cover ani offside. Naturalne przyczyny scarcity poza konkretnymi ranking/expiry observations pozostają częściowo nierozdzielone.

Threat memory: 11249 selected pass choices ma niezerowy adaptation term, ale 10 same-geometry history/context probes nadal zaczyna carry. Same flag changes nie są dowodem lepszego wyniku. [Actual contributions/memory](performance/PR175-pressing-and-adaptation.json), [history counterfactuals](performance/PR175-tactical-adaptation.json).

## 10. Obrona i dyscyplina

Nowe 12: tackles attempted=1661, won=690, interceptions=1324, possessionLost=2958, fouls=131, yellow=3, red=1. Legal challenges i fouls są oddzielnymi faktami. [Każdy canonical defensive counter i strata](performance/PR175-defence-and-discipline.json). Mała heterogeneous próba i skrajnie rzadka ofensywa nie ustanawiają skalibrowanego referee distribution.

## 11. Hipotezy i decyzje o korektach

9 pierwszych stanów z predeclared categories ma dokładny whole-state replay i 8s canonical counterfactuals selected/best generated progressive/best generated shot. Dodatkowe 10 dev-strength obejmuje po obejrzeniu development osobny credible/no-candidate case. Zachowano także niepowodzenia, niedostępne alternatives i score/loss outcomes. W credible carry at 1341.4s zarówno wybrane prowadzenie, jak bezpośredni shot dają gola; odrzucenie shot nie było automatycznie błędem. Inny forced shot nie daje gola. [Frozen cases/outcomes](performance/PR175-natural-counterfactuals.json), [dev-strength](performance/PR175-natural-counterfactuals-dev-strength.json).

W stanie at 81s model opisuje okazję jako credible, lecz piłka jest 1.274836 m od ciała i settled shot eligibility=false. Brak kandydata nie był błędem generowania. [19 frozen-state readiness/awareness/contact audits](performance/PR175-perception-clock-audit.json). Jest to jawnie wybrany zestaw stanów, nie match-rate sample.

Nie przyjęto gameplay correction. Wsparte przyczyny opisowe nie izolują bezpiecznej zmiany pojedynczego mechanizmu, a każdy globalny bonus zmieniłby wiele sytuacji bez dowodu. Odrzucono: quotas, universal progressive/shot/CM bonus, stały pass cooldown, weaken keeper/defender, forced corners/fouls, loosening cover. Przyjęto tylko poprawne **badawcze** rozliczanie persistent hints i self-reclaims. [Hipotezy, gates i negatywne wyniki](performance/PR175-hypothesis-tests.json).

Końcowe reguły projekcji źródeł i ścisłych powiązań kombinacji dopracowano podczas audytu po akwizycji; nie są prerejestrowanym testem statystycznym. Dotyczy to także odrzucania starych wskazówek kontroli w pomiarze czasu. Reguły stosuje się jednakowo do development/validation, raw observations pozostają zachowane, a nowe regresje chronią odtworzone błędne przypisania. Nie zmieniono na tej podstawie polityki gry ani zamrożonych wejść. Formalna prerejestracja dokładnych miar i nowe nieodczytane fixtures pozostają wymagane dla przyszłego potwierdzającego eksperymentu kalibracyjnego.

## 12. Walidacja, determinism i career contracts

Sealed six oceniono na zamrożonym źródle 9f6123b5e9861d07b945253c0f1a98934326fb66da8246ca85fd96735c761d21; development/validation outcomes są osobne. Nie twierdzi się, że identyczny source stworzył nową poprawę before/after. [Final validation](performance/PR175-post-correction-validation.json).

2 kompletnych świeżych canonical matches z detailed observers/actual-choice hook i bez nich kończy się identycznymi **pełnymi** hashes oraz ticks. Pełna natural-capture replay także równa się pierwotnemu całemu stanowi. Trzy serial window repeats każdego trybu i all-tick profiler zachowują stan. Source/save schemas/RNG nie zmieniają się.

Dwa nowe pełne careers: U17 choices=25, reloads=50, active=6, score=0:1; pro choices=51, reloads=51, active=5, score=0:3. Sprawdzono human decisions przez zwykły applyPlayerDecision, canonical autonomous continuation, wynik/minuty/rating, save/hydrate, duplicate no-op, powrót i następny fixture. Default career-match contracts sprawdzają również canonical-plus-summary i nie przypisują fikcyjnych indywidualnych kontaktów końcówce. [Career receipt](performance/PR175-career.json). Nie jest to nowy ręczny browser playthrough ani subiektywna ocena animacji; UI pozostało bez zmian.

## 13. Koszt i pełna weryfikacja

[Serial performance](performance/PR175-performance.json): 60s identycznego fixture, warm-up i trzy próby/mode; whole-state equality, all-2400-tick inclusive spans dla AI/planning/movement/collision/accounting. Osobna powtórka mierzy rzeczywiste wywołania reconcile/release/candidate kombinacji przez loader badawczy, z liczbą wywołań przy aktywnej intencji. Inclusive spans nakładają się i obejmują narzut zegara; nie są udziałem CPU całego meczu ani pełnym kosztem współdzielonego ruchu/prognoz. Full-match plain processes mają CPU/wall/memory i równają się observed hashes. Concurrent cohort wall times nie są porównaniem wydajności.

Production source jest identyczny z merged PR174: brak podstaw do twierdzenia o nowym przyspieszeniu lub gameplay overhead. Detailed research jest opt-in i ma osobny koszt. Memory snapshots nie są izolowanym peak benchmarkiem. Startup/save/load zachowuje payload i ma osobne serial receipt. Badawcze archiwa nie wchodzą do career saves.

| Tryb 60 s / mediana trzech prób | CPU, ms | Wall, ms | Zachowany payload, bajty |
|---|---:|---:|---:|
| plain | 1609.00 | 1451.42 | 0 |
| existing | 1782.00 | 1474.80 | 13830 |
| detailed | 1531.00 | 1482.91 | 243670 |

Stosunek CPU detailed/plain wynosi 0.95. Dwa pełne przebiegi bez obserwatorów: dev-youth: CPU 174.66 s, wall 159.65 s; dev-balanced: CPU 176.06 s, wall 169.24 s. Są to pomiary tej maszyny, bez wniosku o populacyjnym przyspieszeniu. Startup dla obu etykiet wykonuje ten sam kod produkcyjny; różnice czasu to zmienność pomiaru, a wszystkie 14 payloadów save ma ten sam hash.

Mediana CPU detailed poniżej plain przy jednocześnie wyższym wall nie dowodzi przyspieszenia przez diagnostykę ani zerowego narzutu. Trzy krótkie próby nie izolują scheduler/JIT/GC; nie uzyskano stabilnego dodatniego oszacowania przyrostowego CPU. Większy zachowany payload jest zmierzony osobno. Czasów instrumentowanych cohortów z równoległego research nie używa się jako porównania narzutu.

Full-match CPU/wall obejmuje pętlę całego meczu, bez importów, tworzenia fixture, końcowego hashowania i zapisu JSON; nie jest czasem życia całego procesu. Osobny benchmark startup rozlicza tworzenie kariery, parse/validation świata oraz save/load.

| Wywołania kombinacji w osobnych 60 s | Wszystkie / z aktywną intencją | Wall łącznie / z aktywną intencją, ms |
|---|---:|---:|
| reconcileCombination | 4829 / 137 | 1.08 / 0.22 |
| enumerateCombinationPasses | 56 / 2 | 0.09 / 0.00 |
| observeCombinationRelease | 29 / 1 | 4.67 / 0.35 |

**npm run verify: PASS**, 1894 testów, lint, TypeScript i production build. Sześć nowych regresji sprawdza read-only/dedup/choice-release linkage, stale source attribution i odrzucenie późniejszego shot po recyklingu. Dotychczasowe tests, limits, workers, assertions, fixtures/goldens i CI command bez zmian. [Dokładna komenda, środowisko, log i wcześniejsze nieudane próby](performance/PR175-verification.json).

## 14. Ocena i dalszy najmniejszy zakres

**NOT READY.** Physical identity/law/exactly-once contracts i diagnostyka mogą wspierać PR177; naturalne pass/shot/goal/save/corner/role frequencies nie są wiarygodnym targetem summary calibration. Nie przeskakuje się tego ograniczenia dlatego, że final scores wyglądają znajomo.

Najmniejszy repair: odtworzona sekwencja final-third control→box access/credible opportunity, z osobnym sprawdzeniem candidate generation, aktualnego ruchu wsparcia, physical forecast i ranking terms. Potem pojedyncza wąska korekta, paired continuations, material turnover/defence regressions oraz **nowy** sealed set, ponieważ validation PR175 jest już consumed. Brak ogólnego redesignu w tym PR.

PR176 może badać generational renewal/world strength przez 20–25 sezonów przy zachowanych kontraktach. PR177 summary/PlayStyles musi respektować powyższą zależność. PR178 career UX/shot menu i PR179+ world expansion pozostają osobnymi etapami; bez fractional IDs.

## 15. Odpowiedzi na wszystkie 40 pytań

| # | Odpowiedź |
|---|---|
| 1 | Tak: 16 historycznych i 8 wcześniej obejrzanych pełnych meczów na scalonym d6556eba. Cały stan zmienił się w 8/24 par względem K; identyczne hashe wejść. |
| 2 | 12 nowych seedów/projektów: 6 development +6 zamkniętej walidacji. Zero lustrzanych duplikatów w nowym zbiorze; wspólna populacja dwóch U-17 ogranicza wnioski populacyjne. |
| 3 | StatsBomb Open Data, commit 4b73468f…: 12 pierwszych chronologicznych grupowych MŚ 2022 oraz 12 pierwszych dostępnych Bundesliga 2023/24, okresy 1–2. Seniorzy nie są targetem U-17. |
| 4 | Tak: 1775.50 podań/mecz wobec 1166.17 w klubowej referencji bez crosses. Zobacz także per-90 i rozkład, nie tylko średnią. |
| 5 | Ekspozycja live=87.03 min/mecz + krótki cykl kontroli/lotu + powtarzalna cyrkulacja przy rzadkim groźnym dostępie. To razem zwiększa clock totals. Nie zidentyfikowano jednego wadliwego współczynnika ani pozornych pass-ticków. |
| 6 | Mediana control→release 0.95 s, release→resolution 1.25 s; 1416 kolejnych wymian zwrotnych. Brak porównywalnego realnego zegara kontaktów, więc nadmiernej prędkości fizyki nie uznano za dowiedzioną. |
| 7 | 511/3076 epizodów ma >=4 podania i <5 m zachowanego postępu; 98 oddaje >=10 m wcześniejszego zysku. Część cyrkulacji jest konstruktywna; sama długość nie oznacza defektu. |
| 8 | Przede wszystkim przed dobrym dostępem: 3076 posiadań → 632 z final-third control → 69 z box control → 19 z wiarygodną heurystyczną okazją. Etapy nie są obowiązkowo liniowe. |
| 9 | 54 rzeczywistych obserwacji decyzji w 19 epizodach. To proxy modelu, nie walidowane real-world xG ani tyle niezależnych szans. |
| 10 | 52 z tych obserwacji zawiera shot candidate; 2 nie zawiera. Pełne ranking calls są w archiwum. |
| 11 | Wiarygodne alternatywy: carry=38, pass=9, hold=2; wybrany strzał 5. Kolejne obserwacje tej samej okazji są zależne. |
| 12 | 8 wybranych w owner/incoming hooks; 8 powiązanych fizycznych releases. Wszystkie strzały all-phase=14; restarty mogą ominąć owner hook. Niepowiązane selekcje=0. |
| 13 | Rzadkie kontrolowane wejścia i dobre geometrie, następnie częste carry/pass zamiast marginalnego strzału. Brak dowodu masowego gubienia już zaakceptowanych rutynowych strzałów w przygotowaniu. |
| 14 | Historyczne 24 mają 6/22 goli z karnych; nowe 12: 4/9. Same karne nie wyjaśniają wysokiej konwersji: historyczny kontekst open_play daje 16/24 goli/strzałów, nowy 5/8. Naturalna selekcja małego dystansu jest istotną wskazówką; nie rozdzielono ilościowo błędów accuracy/GK/wyboru sytuacji. Block/save→goal zachowuje ten sam shot ID. |
| 15 | Score transitions=9; duplicate release IDs=0, duplicate goal IDs=0; bez powiązanego release poza own-goal=0. Wcześniejsze kohorty K zachowano bez zmian. |
| 16 | Final outcomes: {"goal":9,"block":1,"save":4}. Oficjalne saves=5; początkowy block/save może współistnieć z późniejszym golem tego samego ID. |
| 17 | Fizyczna osiągalność i kontakt działają w 208 próbach; naturalne interwencje są zbyt nieliczne do oceny populacyjnej jakości. Base={"goal":6,"save":10}, weak keeper={"goal":14,"save":1,"block":1}. |
| 18 | 6 naturalnych rożnych; 6 zbadanych granic, 0 rozbieżności linii końcowej/ostatniego kontaktu obrońcy/strony wznowienia. Brak sztucznych kontaktów; częstość daleka od referencji. |
| 19 | 77 ukończonych: pass_and_go=65, overlap=10, third_man=2. Completion nie jest certyfikatem groźnej okazji. |
| 20 | 0 ukończonych ma potem wiarygodną decyzję runnera w tej samej kontroli po konkretnym podaniu kontynuacji, przed jego następnym fizycznym podaniem; 0 ma powiązany strzał. To asocjacja z zachowaną tożsamością, nie randomizowany efekt. |
| 21 | CM 2112/16722 przyjęć (12.63%), 29.52 /player-90. Wagi minut/formacje jawne; brak duty-time ledger nie pozwala uznać całej roli za skalibrowaną. |
| 22 | W tej samej otwartej geometrii gifted/ordinary receiver quality=0.983/0.770, lecz retained estimate jest nasycony na 0.96 w obu; oba przyjęcia są bezpieczne. Wygrywa inny CM. To wyjaśnia tę parę, nie dowodzi ogólnego ignorowania skill ani uzasadnienia uniwersalnego bonusu. |
| 23 | Naturalne ending counts są w receipt. W kontrolowanym underlap open/timed/recovering wybrano inną akcję, weak wygasł, covered nie dostał intencji; nie ma podstaw do usunięcia asekuracji. |
| 24 | Pięć wariantów centralnego pressingu kończy się stratą. Timed support daje lokalny postęp, ale nie ukończoną kombinację/strzał. Nadal brak dowodu skutecznej ogólnej ucieczki z pressingu. |
| 25 | Adaptation ma niezerowy człon w 11249 wybranych podaniach, ale 10 kontrolowanych różnych historii/kontekstów nadal otwiera carry. Nie wykazano ogólnej poprawy wyniku adaptacji. |
| 26 | Nie wdrożono globalnej agresji. Lokalne kontrfakty zachowują wszystkie straty i wyniki; canonical loss po strzale/golu nie jest automatycznie turnoverem obronnym. Więcej prób bez gola nie dowodzi lepszego futbolu. |
| 27 | Nowe 12: faule 131, yellow 3, red 1, accepted tackle attempts 1661. Rozkład jest opisowy i stratyfikowany; nie potwierdza populacyjnego targetu sędziego. |
| 28 | Nie przyjęto nowej poprawki produkcyjnej. Potwierdzono i poprawiono diagnostyczne przypisanie stale retained restart/boundary hints oraz odróżniono self-reclaim od ukończonego podania. Fizyka/AI/format save pozostają byte-identical. |
| 29 | Wsparte: mała podaż niebezpiecznych kontrolowanych geometrii, gęsta realna cyrkulacja, ranking marginalnych strzałów poniżej carry/pass, słaba konwersja combinations→danger. Wkłady pojedynczych wag nie są izolowane. |
| 30 | Odrzucono uniwersalny shot/progressive/CM bonus, stały pass cooldown, goalie/defender nerf oraz luźniejsze safety guards. Przepisane strzały dowodzą możliwości mechanizmu, nie częstości naturalnej. |
| 31 | Tak dla zamrożonego finalnego źródła: 6 dotąd nieodczytanych fixtures. Nie ma accepted gameplay correction, więc nie przypisuje się im before/after poprawy. |
| 32 | Nie zadeklarowano poprawy gry. Niezależna walidacja potwierdza diagnozę/ograniczenia; mechanizmy i wynik nie są relabelled jako sukces kalibracji. |
| 33 | Produkcja ma ten sam hash co scalony PR174. Nowe opt-in observers mają osobno zmierzony koszt; pełne plain replays i seryjne okna nie uzasadniają twierdzenia o przyspieszeniu gry. |
| 34 | Tak: 2 pełne nowe mecze ON/OFF, identyczne całe canonical final-state hashes i ticks; wszystkie okna/profiler także zgodne. |
| 35 | Dwa pełne career paths: U17 50 reloadów/25 jawnych decyzji; pro 51 reloadów/51 jawnych decyzji. Save/hydrate, duplicate no-op i następny fixture przechodzą; hybrid contracts w verify. |
| 36 | Pozostają ilościowy wkład off-ball support/risk/threat w brak wejść, realna kalibracja okazji, conditional natural keeper quality, duty-specific CM usage, pressing escape i statystyki U-17. |
| 37 | NOT READY. Skrajny niedobór strzałów i rożnych oraz nadmierna cyrkulacja czynią model niewiarygodnym celem populacyjnej kalibracji summary. |
| 38 | Tożsamości, minuty, legalne zdarzenia, exactly-once result commit, actual pass/shot release ledgers i warunkowe fizyczne kontrakty. Nie częstości goli/strzałów/saves/corners ani udziały pozycyjne jako targety. |
| 39 | Najmniejszy następny repair: jeden odtworzony łańcuch final-third control→box access/credible choice, z analizą rankingu i ruchu wsparcia, kontrfaktami i nowym sealed set. Nie kolejny globalny mnożnik strzałów. |
| 40 | Tak, PR176 może badać 20–25 sezonów generacji/świata przy zachowanych kontraktach; PR177 pozostaje zablokowany w zakresie statystycznej kalibracji do canonical football. Kolejność PR176→177→178→179+ zachowana. |

## Odtwarzanie

Node 24, zależności z niezmienionego lockfile. Wszystkie raw inputs/outcomes i dokładne harnessy: [evidence index](performance/PR175-evidence-index.json). Plik gzip zawiera mapę exact bytes; restore według nazw, zachowaj hash wersji. Seed manifest jest już frozen i runner nie pozwala go nadpisać. Reference download jest jawny i opcjonalny.

Archiwalny katalog pr175-measured-harnesses zachowuje trzy kopie użyte do adaptation/career/startup przed końcowym porządkowaniem CRLF i pustych linii na końcu pliku. Bieżące skrypty mają ten sam kod wykonywalny; zgodność po tej normalizacji sprawdzono bajtowo. Pozostałe harnessy cohort/performance zachowują dokładne bajty wersji pomiarowej.

Poniższe komendy używają PowerShell; checkout bazowy w ostatnim benchmarku musi mieć źródła scalonego PR174. W tym środowisku Windows ustawiono TEMP/TMP na zapisywalny katalog roboczy przed testami. Finalizer weryfikacji wymaga zapisanego logu i kodu wyjścia; nie zmienia komendy ani ustawień testów. Hashe zachowania wcześniejszych plików opisują dokładne bajty początkowego checkoutu Windows; normalizacja zakończeń linii w innym checkoutcie może zmienić hash tekstu bez zmiany bloba Git. Nowe harnessy i receipts PR175 mają wymuszone LF.

```text
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr174Cohort.ts --output-dir=../pr175-merged-historical --resume
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr174Cohort.ts --families=senior_balanced,wide_direct --replicate=extra-a --output-dir=../pr175-merged-historical --resume
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr174Cohort.ts --held-out --families=youth_native,senior_balanced,strong_weak,press_low --output-dir=../pr175-merged-reserved --resume
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr175GoalSources.ts --group=original
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr175GoalSources.ts --group=extra
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr175GoalSources.ts --group=reserved
node --experimental-transform-types --import ./scripts/registerPr172DecisionObserver.mjs scripts/benchmarkPr175.ts --split=development --output-dir=../pr175-development --resume
# Zamroź candidate przed odczytaniem validation; nowy tuning wymaga nowego holdoutu.
node --experimental-transform-types --import ./scripts/registerPr172DecisionObserver.mjs scripts/benchmarkPr175.ts --split=validation --output-dir=../pr175-validation --resume
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr175Controlled.ts
node --experimental-transform-types --import ./scripts/registerPr172DecisionObserver.mjs scripts/benchmarkPr175Natural.ts
node --experimental-transform-types --import ./scripts/registerPr172DecisionObserver.mjs scripts/benchmarkPr175Natural.ts --id=dev-strength
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/auditPr175Frozen.ts
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr175Adaptation.ts
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr175Career.ts
node scripts/benchmarkPr175Reference.mjs --download
# Po zakończeniu innych obciążeń:
npm run verify 2>&1 | Tee-Object -FilePath ../pr175-verify.log
$LASTEXITCODE | Set-Content ../pr175-verify-exit.txt
node --experimental-transform-types --import ./scripts/registerPr175Performance.mjs scripts/benchmarkPr175Performance.ts
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr175.ts --mode=plain --ids=dev-youth,dev-balanced --output-dir=../pr175-plain
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr175Startup.ts --baseline-root='SCIEZKA_DO_CHECKOUTU_PR174'
node scripts/finalizePr175.mjs --mode=historical-goals
node scripts/finalizePr175.mjs --mode=verification
node scripts/finalizePr175.mjs --mode=performance
node --experimental-transform-types --import ./scripts/registerTypescriptLoader.mjs scripts/reportPr175.mjs
node scripts/renderPr175Report.mjs
```
