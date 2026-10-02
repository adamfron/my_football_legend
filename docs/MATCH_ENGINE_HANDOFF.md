# Match Engine Handoff

## Filozofia

My Football Legend to deterministyczna symulacja kariery piłkarza: nie manager i nie zręcznościowa
gra ruchowa. Gracz wybiera znaczące decyzje, rutynowy futbol jest symulowany, a znaczący rozgrywany.
Każde zjawisko futbolowe ma jeden system kanoniczny.

## Architektura w jednej stronie

- `TacticalMatchState` jest kanoniczną migawką. `matchSimulation.ts` wykonuje przejścia.
- Fizyka działa zawsze przy `FIXED_MATCH_DT = 0.025`; planowanie celów ma cadence 0,1 s z
  natychmiastową invalidacją zdarzeniową.
- `matchActions.ts` enumeruje i uruchamia wspólne akcje człowieka/NPC; wyspecjalizowane pliki
  rozwiązują lot, kontakt, przyjęcie, prowadzenie i bramkarza.
- PR147 `defensiveChallenges.ts` wykonuje wspólne fizyczne próby standing/committed/slide/tactical;
  kontrolowany zawodnik nie wybiera sam techniki o wysokim ryzyku. `matchRules.ts` rozstrzyga
  faul/kartkę i korzyść na kanonicznych faktach, korzystając z istniejących wznowień.
- `actionEvents.ts` zachowuje kanoniczne dowody przez 12 s / maks. 96 zdarzeń. Mikrofeedback
  odczytuje czas wyświetlanej klatki live/lead-in/replay, nie animację ani zegar aktualnego core.
- `shootingOptions.ts` wyprowadza wspólne możliwości strzału i fizycznie osiągalny kontakt;
  `shotIntent.ts` oddziela technikę od kontaktu. `shotResolver.ts` nadaje jawny profil wykonania,
  a lot nadal obsługuje ten sam integrator 3D. Cel PR141 nie może spłaszczyć podcinki.
- `playerDecision.ts` jest czystą projekcją okazji. `decisionOutcome.ts` zamyka zdarzeniowe okno
  wyniku; checkpoint sprawczości może łańcuchować kolejną decyzję.
- `possessionAgency.ts` utrzymuje własność ludzkiego posiadania. Prowadzenie kończy się granicą
  decyzji przy waypoint albo istotnej zmianie sytuacji; upływ cooldown nie oddaje akcji AI.
- `matchMoment.ts` obserwuje; polityka prezentacji wybiera epizody, nie wyniki futbolu.
- `TacticalMatchSandbox.tsx` zarządza batchami i fazą widoku. Three.js tylko renderuje klatki.
- `matchFlowTelemetry`, statystyki i debug capture są obserwatorami i nie zużywają RNG.
- Benchmark `npm run benchmark:background` rozdziela core, telemetrię, moment, complete i profile.
- PR146 `npm run benchmark:performance` mierzy 10/45/90 min i tryby minimum/normal/DEV/capture,
  pełne hashe, pięciominutowe przedziały, podsystemy i kolekcje. Ref kanoniczny w UI jest
  niezależny od coalescingu React; wszędzie zachowano exact agency i 0,025 s.

## Inwarianty

1. `FIXED_MATCH_DT = 0.025` i jeden integrator fizyki piłki.
2. Prezentacja nie zużywa RNG, renderer nie rozstrzyga futbolu.
3. Flaga kontroli nie zmienia preferencji kolegów wobec adresata podania.
4. AI nie wykonuje wysokowartościowej akcji kontrolowanego gracza, gdy człowiek posiada epizod.
5. Udana akcja z zachowaniem/zdobyciem posiadania może prowadzić do kolejnej decyzji człowieka.
6. Sprawczość każdej znaczącej decyzji jest niezależna od polityki oglądania; polityka wybiera
   wyłącznie materiał do oglądania. Kontekst jest historią prezentacji, nigdy rollbackiem futbolu.
7. Podział tych samych ticków na batche nie zmienia wyniku.
8. Wybór wysokiego ryzyka nie gwarantuje kontaktu/odbioru/faulu; bez kontaktu nie ma przewinienia.
9. Faule/kartki i korzyść są faktami core. Etykieta albo gest nie może ich przyznać ani cofnąć.

## Ewolucja od PR126

- **Sprawczość/kamera/cel:** stabilne śledzenie, płaszczyzna bramki, checkpoint po akcji.
- **Orientacja/piłka:** orientacja ciała, jeden lot 3D i kontaktowa geometria.
- **Skrzydła/przyjęcie/prowadzenie:** relacje, dośrodkowania, plan podania, fizyczne przyjęcie i carry.
- **Flow/runtime:** stały krok, bezpieczne nadrabianie, semantyczne decyzje i żywotność wznowień.
- **Bramkarz:** pozycja, projekcja interwencji oraz wspólny kontakt catch/parry.
- **Momenty/tło/performance:** obserwacyjny `MatchMoment`, selektywna prezentacja, benchmark PR139 i
  kanoniczny multi-rate fast path PR140.

## Debug workflow

Reprodukuj w Single Match Lab ze stałym seedem. Do zgłoszenia dołącz benchmark-session JSON,
kanoniczny czas i ±10 s debug capture; WebM dodaj, gdy problem dotyczy ruchu. Porównuj wszystkie
tryby `npm run benchmark:background`, panel wydajności, decyzje prezentacji, flow/keeper telemetry
i seed. Preferowane dowody: stan przed/po, decision id, ball episode i action source.

## Znane problemy

- pełny rozkład zaangażowania, wolumenu podań i decyzji dla wszystkich pozycji wymaga dalszych playtestów;
- krótka próbka PR145 nie ustala końcowej skuteczności strzałów/bramkarzy w normalnych meczach;
- nowe łańcuchowanie epizodów wymaga długich testów manualnych;
- udział bramkarza i podania zwrotne wymagają obserwacji;
- brak zmęczenia, zmian, pełnej integracji kariery i kanonicznej oceny meczowej;
- PR147 wdraża spójny podzbiór przepisów, nie wszystkie edge cases IFAB; progi kontaktu,
  korzyści/DOGSO, reakcja ról na wykluczenie i pełny lejek podejścia wymagają dalszej kalibracji;
- modele i animacje 3D pozostają lekkim prototypem; kamera, hitboxy i baza strojów mają fundament PR141.

## PR143 — prezentacja i sprawczość

`projectPlayerAgency` jest jedyną projekcją własności decyzji: znaczący wybór człowieka albo
kanoniczna autonomia. Polityka nie wykonuje proxy; `resolveDevPlayerDecision` jest jawną delegacją
DEV. Jedna rzeczywista opcja menu nie zatrzymuje meczu. `PlayerAgencyTracker` liczy semantyczne
wejścia, osobno od liczby renderów i kandydatów materiału.

`PresentationContextHistory` zapisuje 10 Hz / 6 s / <=62 lekkie próbki również w tle. Gdy decyzja
istnieje w T, core stoi; lead-in od T−N pokazuje wyłącznie zapis, a zegar odpowiada tej klatce.
Interakcje są aktywne dopiero po dojściu do T. Wynik obserwuje dowody kanoniczne i krótki ogon;
nie wpływa na RNG ani wynik akcji. Replay jest osobnym stanem z własnym widocznym buforem.

## Roadmap

PR141–PR147 ukończone w opisanym zakresie; kalibracja realizmu dyscypliny pozostaje PR148.
PR145 używa osiągalnego punktu spotkania odbiorcy, legalnego autu z
zakazem ponownego kontaktu wykonawcy, loftu 3D oraz wspólnego oporu toczenia 3,2 m/s².
Cel podania nie wyhamowuje lotu. Kontakty i completed/received/network mają wspólne dowody;
rutyna i przechwyt należący do wcześniejszego kolegi nie tworzą bezsensownego promptu.
Reakcja i aktywny zasięg bramkarza są osobne od pasywnej kolizji ciała. Zachowano epizod
człowieka PR144 także po przyjęciu autu. Finalne verify: exit 0, 697 + 5 testów.
Próbka 3 × 600 s: projekcja 408 → 42 decyzje / 90 min; 224 kontrolowane strzały dowodzą
miss/save/goal, nie końcowego rozkładu zwykłych meczów. Definicje, stałe i pełne metryki:
[MATCH_BEHAVIOUR_CALIBRATION.md](MATCH_BEHAVIOUR_CALIBRATION.md).

PR146: DEV45 466,19 → 62,15 s, normal90 108,36 s; kanoniczne hashe A–D10/A–C90 i PR14545
pozostały równe. Verify exit 0, 720 + 5 testów. Normal nie płaci stale za flow/debug capture;
capture 40 Hz jest jawny, a WebM dodatkowo opt-in i widoczny. Milestone headless <5 min spełniony;
pełnego grywalnego czasu 4–6 min i video kosztu jeszcze nie zmierzono. Dokładne dowody:
[BACKGROUND_SIMULATION_PERFORMANCE.md](BACKGROUND_SIMULATION_PERFORMANCE.md).

Zweryfikowano **PR147 — Rules, Discipline & Match Feedback**: 777 + 5 testów, lint/build,
normal10 BEFORE/AFTER i pełna zgodność hashy minimum/normal/DEV10. Próbka ma 17 fauli,
13 żółtych i 5 wykluczeń po drugiej żółtej; nie jest realistycznie skalibrowana, a niższy czas
nie dowodzi optymalizacji przy zmienionym futbolu/składzie. Architektura, ograniczenia,
weryfikacja i benchmark: [RULES_DISCIPLINE_MATCH_FEEDBACK.md](RULES_DISCIPLINE_MATCH_FEEDBACK.md).
Dalej **PR148 — Possession Rhythm, Roles & Duel Calibration**, potem
**PR149 — Animation, Replay & Match Presentation v2**. Fatigue nie maskuje złej częstości ruchu.
Klubowy stadion docelowo ma stabilny seed/profil i niezależną zmienność środowiska; MFL nie
ma minigry budowy stadionu. Żaden późniejszy etap nie został włączony do PR147.
