# PR170 — Match Atmosphere, Stylized Visual Polish & Career UI Refinement

Baza: scalony PR169, 77fd3a33946b7f0a14733a76d9820d29b15366f4.

## Audyt, kolejność i ponowne użycie

Przeczytano PROJECT_STATE, ROADMAP oraz raporty PR161, PR165, PR168, PR169.
Sprawdzono modele/twarze, animacje, projekcję klatek, replay, kamerę, stroje,
CareerApp/CareerView/SeasonView, oferty/akceptację, ledger, kalendarz i zapis.

1. Zamrożenie PR169, produkcyjnego buildu, rzeczywistych karier i zrzutów.
2. Wspólna polityka ofert w generowaniu, hydratacji i walidacji przyjęcia.
3. Finanse i kalendarz pod niezależnie przewijaną tabelą.
4. Usunięcie starego HUD; funkcje klawiatury w panelu decyzji.
5. Rozwinięcie PR161: stadion, batche, prawdziwa ławka, modele i materiały.
6. Krótkie przejścia z kanonicznych zdarzeń.
7. Testy, produkcyjny Edge, pomiary przed/po i pełne niezmienione verify.

PR161 zachowuje StadiumModel, kamery, replay i goalResponse; PR165 twarze,
DNA i stroje; PR168 ocenę zainteresowania/roli; PR169 historię i ocenę występu.
Nie powstał drugi silnik, terminarz ani właściciel zatwierdzenia wyniku.
Nie zmieniono źródeł src/core/matchSimulation, parametrów futbolu, rozwoju,
mechanik ekonomii, zależności ani formatu zapisu.

## Implementacja i 30 odpowiedzi odbioru

1. **Systemy PR161.** Rozwinięto [stadium.ts](../src/app/match/tacticalRenderer/stadium.ts),
   istniejącą konfigurację, kit identity, frameProjection, replay i goalResponse.
   Scenery nie jest przebudowywane przy każdym renderze Reacta.
2. **Trzy stadiony.** Community: jedna wyższa trybuna i odkryte krótkie sektory;
   compact: nierówne wysokości boków; bowl: pełny wyższy obwód i cztery dachy.
   Dodano sektory, pasy klubowe, podpory, tunel, obudowę ławek, strefę techniczną
   i chorągiewki. Bliskie dachy są odcinane według kamery. Skala 105 × 68 m,
   bez colliderów. Porównywalne zrzuty poniżej.
3. **Ograniczona widownia.** Tułowie i głowy w dwóch InstancedMesh; grupy ubrań,
   odcienie skóry, sylwetki siedzące/stojące. Limit <2500 osób; próba 282/662/1583.
   Po prawdziwym golu najwyżej 96 rozproszonych reakcji w 10 Hz przez ≤2,6 s.
   Test „batches each archetype...” sprawdza granice, dwie geometrie i powrót
   do spoczynku. Statyczne moduły batched według geometrii/materiału/boku dachu.
4. **Tożsamość.** deriveStadiumConfiguration używa haszu ID gospodarza i kolorów
   prawdziwego stroju. Brak RNG futbolu, marek komercyjnych i zewnętrznych assetów.
5. **Rzeczywiste przejścia.** [MatchOccasion.tsx](../src/app/match/MatchOccasion.tsx)
   czyta początek, half_time, faktyczny goal/substitution i full_time/abandoned.
   Pokazuje krótki podpis, bez teleportacji lub choreografii zmieniającej stan.
   Pełny fixture galerii ma prawdziwy gol 48:07 i koniec 0:1.
6. **Pominięcie.** „Pomiń oprawę”/zwinięcie końca zmienia wyłącznie lokalny stan
   podpisu. Nie zatrzymuje ani nie przyspiesza futbolu. Test pominięcia bez mutacji
   oraz klawiatura Edge w czterech szerokościach. Podpis wydarzenia trwa <3 s
   czasu meczu; przerwę/koniec można zamknąć.
7. **Reakcja na gol.** [animation.ts](../src/app/match/tacticalRenderer/animation.ts)
   dodaje deterministyczne warianty pozy strzelca. PR161 zachowuje role,
   rzeczywisty czas/położenie i pilne odzyskiwanie piłki. Zmieniają się kości,
   nigdy root, kontakt ani posiadanie. Istniejące regresje goal urgency/restart
   i replay pozostają w pełnym verify.
8. **Stabilny wygląd.** [playerModel.ts](../src/app/match/tacticalRenderer/playerModel.ts)
   poprawia goleń/buty bez nowych geometrii; animacja ma mały przeciwruch tułowia.
   Face/DNA, włosy, wiek, keeper i stroje zachowują dotychczasowych właścicieli.
   Nowy test materiału zachowuje identity; istniejące visualPlayerModel i
   visualAppearance obejmują spójność kreator/profil/mecz/replay.
9. **Zależności.** package.json/lock bez zmian. Użyto obecnego Three,
   MeshStandardMaterial i współdzielonych geometrii; brak nowego render pass.
10. **Korzyść cieniowania.** Opcjonalne faceted to flatShading materiałów.
    W taktycznej kamerze brak wyraźnej przewagi czytelności; GPU 2,339 ms wobec
    classic 1,233 ms w compact. Porównanie w galerii; efekt nie jest domyślny.
11. **Fallback.** Classic domyślne, przełączanie nie regeneruje twarzy ani
    zasobów. Minimalny stadion ukrywa detale, widownię i ławkę techniczną.
    [technicalArea.ts](../src/app/match/tacticalRenderer/technicalArea.ts)
    ma jeden InstancedMesh, ≤30 rzeczywistych osób ×6 części. Dane pochodzą
    wyłącznie z ławki/departed w [frameProjection.ts](../src/app/match/tacticalRenderer/frameProjection.ts).
    Aktywni, staging i wyrzuceni nie są siedzącą ławką; wejście/zejście PR161
    zachowuje czas. Kontrakt klatki nie zawiera rosteru sztabu; referencja managerId
    w klubie nie potwierdza obecności osoby przy ławce. Nie wymyśla się sztabu.
    Dekoracje nie mają playerId pickera, a dawny replay bez ławki jej nie wymyśla.
12. **Nadmiarowy status.** Osobna linia „imię · Na boisku” usunięta.
    Ławka, zmiana i wykluczenie pozostają w odpowiednim MatchCentre.
13. **Żółte pole.** Usunięto JSX/CSS interaction-hint. Smoke sprawdza zero
    takich elementów po PR i jeden w bazie; nie zmieniono tylko koloru.
14. **Klawiatura.** [DecisionTargets.tsx](../src/app/match/DecisionTargets.tsx)
    przenosi select oraz X/Y do panelu. Realni aktywni gracze, piłka, bramka
    i cele kanoniczne są filtrowani projectContextualInteractions. Punkt
    ograniczony do 105 × 68 m. Wybór sam nie wykonuje akcji. Edge wykonał
    „Podaj do nogi”; zapis ma resolved: 1.
15. **Legitymowane decyzje.** Koledzy/rywal/piłka/punkt/bramka, menu kontekstowe,
    kliknięcia boiska, zwykłe przyciski klawiatury i suwaki strzału z potwierdzeniem/
    anulowaniem. Restart, replay, prędkości, kamera, kondycja, statystyki,
    „Symuluj do końca” i powrót zachowują funkcję. Diagnostyka jest zwijana.
    Nowe testy HUD oraz dotychczasowe renderer/shot/restart i prawdziwy smoke.
16. **Sześć ofert.** [professionalOfferPolicy.ts](../src/core/professionalOfferPolicy.ts)
    ustala MAX_EXTERNAL_OFFERS=6. Generowanie, hydratacja i akceptacja używają
    tej samej polityki; ukryta stara oferta jest odrzucana jako nieaktualna.
    PR168 zachowuje zainteresowanie i preferencje; obecny klub jest wykluczony
    przed rankingiem. Równie wiarygodna alternatywa ogranicza prawie identyczne
    role (ta sama prognoza, reputacja ±2, pensja ±5%), bez kwot ligowych.
    Nie wymusza sześciu klubów; starszy gracz zachowuje limit pięciu.
    Testy 0/1/3/6/12 oraz istniejący deterministyczny safety net.
17. **Odnowienie.** Osobny slot, bez końcowego obcięcia listy. Browser przyjął
    niezależnie renewal i external; oba kontrakty zachowane po reloadzie.
    Hydratacja nie przelicza podpisanych/proponowanych umów.
18. **Dwa rzędy.** Trzy kolumny powyżej 1150 px, sześć kart w dwóch rzędach
    przy 1920/1366; Edge sprawdza kolumny i dwa offsetTop. Wszystkie przyjęcia
    są dostępne przez scroll. Obramowania prostokątne, stabilny akcent klubowy.
    Widoczne: klub/rozgrywki, poziom, środowisko, rola/pozycja, pensja/kontrakt,
    prognoza konkurencji, szansa/ryzyko. Pełna konkurencja i opłata rozwijane.
19. **Mniejsze okna.** 601–1150 px: dwie kolumny, ≤600: jedna. Edge sprawdza
    1920×1080, 1366×768, 820×1180, 390×844: oferty, kalendarz, finanse i 3D,
    dostępność kontrolek, fokus i brak poziomego przepełnienia strony.
20. **Rzeczywiste finanse.** [financePresentation.ts](../src/app/career/financePresentation.ts)
    i [FinanceView.tsx](../src/app/career/FinanceView.tsx) czytają ledger.
    Polskie kategorie: stypendium, praca dodatkowa, rozwój i trening,
    leczenie i regeneracja, edukacja, życie codzienne, wynagrodzenie, premia
    za podpis. Przychód/wydatek ma znak i opis. Pensja, środki, bonus umowny,
    sumy, kategorie, ostatnie 10/cała historia i kontrakt; główna karta zachowana.
21. **Saldo.** Suma transakcji od istniejącego modelowego zera, data/ID rozstrzyga
    duplikaty. Źródło z faktycznego sourceFactId, jeżeli dostępne. Premia umowna
    nie jest doliczana drugi raz. Brak księgi daje „—”, pusta zero, ujemne saldo
    jest dozwolone. Unit test wszystkich kategorii/roundtrip oraz odczyt
    przeglądarkowy bez zmiany zapisu. Rzeczywisty fixture pro: 28 000 PLN.
22. **Autorytatywny terminarz.** [CareerCalendar.tsx](../src/app/career/CareerCalendar.tsx)
    używa buildSeasonTimeline, careerCalendar.fixtures, zdarzeń, księgi udziału
    i leagueSeason. Brak drugiego generatora i fikcyjnych przyszłych meczów.
    Okres urazu tylko ze startDate/recoveryDate; bez daty końca brak prognozy.
23. **Nawigacja bez symulacji.** 42 dni od poniedziałku, miesiące/Dziś/strzałki,
    stała data symulacji, rozróżnienie planu/rozegranego/zdarzenia/urazu.
    Kliknięcie pokazuje rywala, miejsce, rozgrywki, status/wynik i CareerMatchDetails.
    Brak callbacku rozgrywania/zapisu. Przy braku głównego currentDate starszy
    zapis używa careerCalendar.currentDate; regresja obejmuje serialize/hydrate.
    Browser wybiera plan i ukończony fixture,
    zachowując cały zapis. Zmiana sezonu/klubu resetuje lokalny miesiąc.
24. **Duże tabele.** [App.css](../src/app/App.css): dwa główne panele, tabela
    z własnym scrollem nad kalendarzem; 12 px, mniejszy padding, liczby do prawej,
    sticky header, akcent klubu i poziomy overflow tabeli na telefonie.
    Dane 12/16/20/24 przechodzą createLeagueSeason/leagueSeasonSchema;
    kalendarz mieści się w 1366×768. Tylko fixture pojemności, bez nowych lig.
25. **Ładowanie.** Pierwszy 3D 280 967 → 284 104 B CDP, drugi 0 → 0 B.
    JS kariery 173 923 → 176 065 B. Dokładna metoda i ograniczenia poniżej.
26. **CPU.** Release_minimal 25,23× → 24,35×; normal 19,15× → 17,91×.
    Trzy pary, identyczne hasze; brak deklaracji przyspieszenia.
27. **Klatki/pamięć.** Draw calls 964/983/1009 → 901/903/903. CPU/GPU, p95,
    geometrie i heap w tabelach. Największy wzrost buforów 154 392 B.
28. **Niezmienność futbolu.** Osiem konfiguracji minimal/standard × classic/
    faceted × kosmetyczna kamera ma ten sam pełny stan po 160 tickach.
    Dwanaście prób przed/po zachowuje hasze stanu, statystyk, zdarzeń i RNG.
    Fingerprint źródeł silnika jest identyczny.
29. **Krótka kariera.** Dashboard → kalendarz → fixture → Play3D → rzeczywiste
    podanie → Simulate Remainder → powrót → finanse → reload → następny 3D.
    Zapis ma canonical_plus_summary, rozstrzygniętą decyzję i fakt wyniku.
    Księga udziału jest identyczna po reloadzie. Transfer/renewal osobno.
30. **Rezerwacja etapów.** PR171 niezależny audyt hipotez i rzeczywistych rozkładów;
    PR172 wyłącznie kalibracja poparta dowodami; PR173 pokolenia/siła świata;
    PR174 lekka symulacja/PlayStyles; PR175+ ligi, puchary i świat.
    Bez zmian podań, strzałów, bramkarza, rożnych, wzrostu, G/A i ekonomii.

## Pomiary

Windows 11 10.0.26200, Ryzen 7 260, Radeon 780M, 16 logicznych CPU, 32 GB RAM,
Node 24.19.0, Edge 155.0.4283.45. Baza zamrożona na PR169. Nie użyto
niekontrolowanej obserwacji użytkownika 5–6 s/min jako baseline.

### CPU bez renderera

[PR170-cpu.json](performance/PR170-cpu.json): trzy naprzemienne pary świeżych
szeregowych Node, seed pr170-baseline, 60 s meczu, jawna polityka decyzji,
bez innych testów/buildów/przeglądarki podczas pomiaru.

| Tryb                                |      PR169 |      PR170 | Zmiana czasu | Tempo przed → po |
| ----------------------------------- | ---------: | ---------: | -----------: | ---------------: |
| release_minimal, bez obserwatorów   | 2378,11 ms | 2464,20 ms |       +3,62% |  25,23× → 24,35× |
| normal, ograniczony kontekst/replay | 3132,83 ms | 3350,88 ms |       +6,96% |  19,15× → 17,91× |

Nie wykazano przyspieszenia. Krótka próba nie prognozuje całego meczu.
Fingerprint produkcyjnych źródeł matchSimulation przed/po:
8268384293d8aa583c9ee6742c205170fa600460c005e8d19d9bc147ef3b75f4.
Wszystkie 12 prób ma identyczne hasze pełnego stanu, graczy, statystyk,
59 istotnych zdarzeń i losowości. Stan obejmuje wynik, kartki, urazy i decyzje.

### Renderer i GPU

[PR170-render.json](performance/PR170-render.json): trzy naprzemienne pary,
produkcyjnie zbundlowany prawdziwy renderer, 1440×900 DPR1, ta sama klatka,
stroje i kamera, 100 RAF/próbę, 11 pierwszych poza statystyką.
Mediana trzech median; p95 CPU submission. GPU:
EXT_disjoint_timer_query_webgl2, próbki disjoint pominięte.

| Standard  | Draw calls |    CPU mediana |        CPU p95 |      GPU mediana |    Widzowie |
| --------- | ---------: | -------------: | -------------: | ---------------: | ----------: |
| community |  964 → 901 | 3,30 → 2,50 ms | 4,80 → 3,40 ms | 1,696 → 1,630 ms |   664 → 282 |
| compact   |  983 → 903 | 2,00 → 1,90 ms | 2,30 → 2,30 ms | 1,243 → 1,233 ms |   924 → 662 |
| bowl      | 1009 → 903 | 2,00 → 2,00 ms | 2,40 → 2,60 ms | 1,337 → 1,242 ms | 1860 → 1583 |

Cała scena: 204 geometrie, 221 → 222 materiały (dodatkowy ławki).
Sam stadion: dwie geometrie/sześć materiałów. 18 prawdziwych osób ławki obok
22 aktywnych modeli. Instancing zmniejsza draw calls mimo bogatszej architektury.

| Pamięć    | Bufory geometrii/instancji |             JS heap po GC |
| --------- | -------------------------: | ------------------------: |
| community |        253 704 → 276 328 B | 24 873 567 → 25 088 494 B |
| compact   |        270 344 → 338 568 B | 24 917 247 → 25 170 474 B |
| bowl      |        330 248 → 484 640 B | 25 007 983 → 25 386 286 B |

Bufory obejmują eksport sceny/instancje, nie pełny VRAM. Heap to estymata
Chromium po jawnym GC, nie pomiar alokacji/s. Maksymalny przyrost buforów:
154 392 B. Minimalny bowl: 958 → 893 draw calls, CPU 2,20 → 2,00 ms,
GPU 1,359 → 1,193 ms. Minimalny tryb ukrywa detale, zachowuje współdzielone
zasoby; nie należy przypisywać mu zwolnienia całej pamięci. Brak tworzenia meshów
i geometrii co klatkę. Ławka aktualizuje istniejące macierze; dispose zwalnia
zasoby i instancje. Faceted compact: CPU 2,00, GPU 2,339 ms wobec classic
1,90/1,233 ms. Headless RAF/CPU submission nie jest obietnicą FPS całej gry.

### Ładowanie i transfer

[Smoke przed](performance/PR170-smoke-before.json) /
[po](performance/PR170-smoke-after.json): ta sama prawdziwa kariera, bez
wstrzykiwania stanu meczu. Produkcyjny HTTP z Brotli, CDP encodedDataLength
z narzutem HTTP, Resource Timing osobno encodedBodySize. Świeży profil;
drugi mecz po prawdziwym wyniku i reloadzie w tym samym profilu.

| Miara                                           |     PR169 |     PR170 |
| ----------------------------------------------- | --------: | --------: |
| JS kariery do wyboru fixture, z małym MatchGame | 173 923 B | 176 065 B |
| CSS kariery                                     |   7 512 B |   8 096 B |
| Baza świata                                     | 192 195 B | 192 195 B |
| Pierwszy 3D, CDP                                | 280 967 B | 284 104 B |
| Pierwszy 3D, payload Brotli                     | 280 110 B | 283 247 B |
| Drugi 3D, nowy transfer                         |       0 B |       0 B |
| Kliknięcie → pierwszy widok                     |   2443 ms |   2286 ms |
| Kliknięcie → drugi widok                        |    706 ms |    704 ms |

Przyrost pierwszego 3D: 3137 B (1,12%), JS kariery 2142 B (1,23%).
Brak pobrania CareerCanonicalMatch/TacticalMatchSandbox/model/Three przed
wyborem 3D. Drugi import korzysta z cache; zero transferu potwierdza CDP,
nie same ponowione wpisy Resource Timing. Czasy otwarcia są pojedynczymi
obserwacjami. Pomiar ładowania: e1fa18a; końcowe poprawki dotyczą koloru tekstu
podsumowania (kilkadziesiąt bajtów CSS) i odczytu daty starszego zapisu w karierze.
Nie zmieniają mierzonej ścieżki z istniejącym currentDate. Skrypt umożliwia powtórzenie.

## Przeglądarka i galeria

[PR170-browser-after.json](performance/PR170-browser-after.json):
siatka 3/3/2/1, wszystkie przyjęcia dostępne, fokus dat, plan i ukończony fixture,
finanse bez zmiany zapisu, osobne przyjęcie transferu/odnowienia z reloadem.
[PR170-match-ui.json](performance/PR170-match-ui.json): cztery szerokości 3D,
klawiaturowe pominięcie, kamery, detale/materiały, fokus, brak poziomego overflow.
Tabele 12/16/20/24 przechodzą createLeagueSeason/leagueSeasonSchema; większe daty
są wyłącznie fixturem pojemności, nie nowymi ligami. Kalendarz mieści się w 768 px.
Oba smoke zachowują resolved: 1 po „Podaj do nogi”, źródło canonical_plus_summary
i identyczną księgę udziału po reloadzie. Raporty mają puste listy pageerror.

| Widok           | Przed                                                               | Po                                                                 |
| --------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Community       | [PR169](images/pr170/stadium-community-standard-classic-before.png) | [PR170](images/pr170/stadium-community-standard-classic-after.png) |
| Compact         | [PR169](images/pr170/stadium-compact-standard-classic-before.png)   | [PR170](images/pr170/stadium-compact-standard-classic-after.png)   |
| Bowl            | [PR169](images/pr170/stadium-bowl-standard-classic-before.png)      | [PR170](images/pr170/stadium-bowl-standard-classic-after.png)      |
| Minimal         | [PR169](images/pr170/stadium-bowl-minimal-classic-before.png)       | [PR170](images/pr170/stadium-bowl-minimal-classic-after.png)       |
| Cieniowanie     | [classic](images/pr170/stadium-compact-standard-classic-after.png)  | [faceted](images/pr170/stadium-compact-standard-faceted-after.png) |
| Przerwa         | [PR169](images/pr170/match-half_time-before.png)                    | [PR170](images/pr170/match-half_time-after.png)                    |
| Rzeczywisty gol | [PR169](images/pr170/match-goal-before.png)                         | [PR170](images/pr170/match-goal-after.png)                         |
| Koniec          | [PR169](images/pr170/match-full_time-before.png)                    | [PR170](images/pr170/match-full_time-after.png)                    |
| Klawiatura      | [PR169](images/pr170/gameplay-keyboard-before.png)                  | [PR170](images/pr170/gameplay-keyboard-after.png)                  |
| Kariera         | [PR169](images/pr170/dashboard-before.png)                          | [PR170](images/pr170/dashboard-after.png)                          |
| Oferty          | [PR169](images/pr170/offers-before.png)                             | [PR170](images/pr170/offers-1366.png)                              |
| Finanse         | [PR169](images/pr170/finance-offers-before.png)                     | [PR170](images/pr170/finance-offers-after.png)                     |

Dodatkowo: [1920](images/pr170/offers-1920.png), [820](images/pr170/offers-820.png),
[390](images/pr170/offers-390.png), [kalendarz planu](images/pr170/calendar-fixture-1366.png),
[rozegrany fixture](images/pr170/calendar-completed.png),
[finanse bez pensji](images/pr170/finance-dashboard-after.png),
[finanse 390](images/pr170/finance-390.png), [mecz 390](images/pr170/match-responsive-390.png),
tabele [12](images/pr170/table-12.png)/[16](images/pr170/table-16.png)/[20](images/pr170/table-20.png)/[24](images/pr170/table-24.png).

Pełny fixture renderera: prawdziwy seed pr161-full-match-sanity, 0:1,
gol 48:07, koniec 92:00, hash
bc2e84c7b467ab4e9b98685241a9151ece68d07c01834705256acf348098c329.
ID stadionu w galerii zmienia tylko oprawę tego samego meczu; normalna gra
używa rzeczywistego gospodarza. Zrzuty laboratoryjne zawierają DEV.

## Testy i odtwarzanie

Pełny lokalny **npm run verify: PASS — 1788 testów**, lint, TypeScript, build:
205 plików/1727 testów głównych +52 integracyjne +4 kontraktu meczu +5 kariery.
Końcowy pełny przebieg również zakończył się sukcesem. Po ostatniej korekcie
odczytu daty i doprecyzowaniu testu kamer powtórzono 15 nowych testów oraz lint
dotkniętych plików; wynik PASS. Końcowy build zawiera poprawkę daty.
[Zapis weryfikacji](performance/PR170-verification.json).
Timeouty, workery, workflow i
assertions poprawności nie są osłabione. Dawne oczekiwania ośmiu ofert
zmieniono na sześć zgodnie z wymaganiem.

- [pr170Presentation.test.ts](../src/app/match/tacticalRenderer/pr170Presentation.test.ts):
  batche, widownia, prawdziwe ID/picking, materiały i osiem kosmetycznych konfiguracji.
- [pr170Hud.test.tsx](../src/app/match/pr170Hud.test.tsx):
  rzeczywiste cele/bramka/X/Y i pominięcie bez mutacji lub commit.
- [pr170Career.test.tsx](../src/app/pr170Career.test.tsx):
  osiem kategorii, równe daty, znaki, saldo ujemne/zero/brak, serialize/hydrate,
  readonly i klawiatura kalendarza/finansów, luty/granica roku,
  0/1/3/6/12 ofert, renewal, starszy gracz, legacy i stale offer.

Pełna regresja obejmuje istniejące PR161/165 goal urgency/restart, replay,
orientację, shot aiming, bramkarza, zmiany, twarze, dispose i kontrakt wyniku
U-17/pro. Nie deklarujemy ręcznego przejścia 25 sezonów.

Odtwarzanie: Node 24, npm ci, Edge i Playwright (może być zewnętrzny przez
MFL_PLAYWRIGHT_MODULE). Obok checkoutu baseline-pr169 z bazy, jego zależności
i build produkcyjny. Brak nowej zależności w grze.

    npm run verify
    node scripts/preparePr170Evidence.mjs --full
    node scripts/benchmarkPr170Cpu.mjs ../baseline-pr169
    node scripts/benchmarkPr170Render.mjs
    $env:MFL_PR170_PHASE='before'
    node scripts/benchmarkPr170Browser.mjs
    node scripts/benchmarkPr170Smoke.mjs
    $env:MFL_PR170_PHASE='after'
    node scripts/benchmarkPr170Browser.mjs
    node scripts/benchmarkPr170Smoke.mjs
    node scripts/benchmarkPr170MatchUi.mjs

--full tworzy prawdziwy pełny mecz; bez flagi tylko krótki fixture. Pomiary
uruchamiać szeregowo bez innych testów/buildów. Dwa gzipy w performance/fixtures
zawierają prawdziwe zapisy PR169; ładowanie przez IndexedDB. Nie trafiają do buildu.

Ograniczenia: brak indywidualnej AI widzów, fikcyjnego sztabu, ciężkiej
choreografii i motion capture. Ławka to sylwetka, nie drugi pełny model twarzy.
Jeden fixture i headless GPU nie opisują wszystkich urządzeń; bez obietnic
poprawy CPU/FPS i bez pomiaru VRAM/alokacji na sekundę. Faceted pozostaje
eksperymentem opcjonalnym. PR171–PR175+ zachowują opisany zakres i kolejność.
