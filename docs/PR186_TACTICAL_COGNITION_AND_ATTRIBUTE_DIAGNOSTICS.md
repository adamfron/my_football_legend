# PR186 — Tactical Cognition, Team Familiarity & Attribute Diagnostics

## 1. Wnioski i decyzje

PR186 dostarcza izolowane, wykonywalne prototypy wspólnej taktyki, znajomości
schematów, reakcji, komunikacji i ograniczonej indywidualnej oceny. Dodaje próby
celowej główki, composure, 1v1/sweeping, przyjęcia/nawrotu i pojedynku oraz
diagnostykę kandydatów i kontaktu. **Nie zmienia kodu istniejących mechanizmów
live, domyślnego B `state-value-v1`, schematu 28 atrybutów ani zapisów kariery.**

Najważniejsze ustalenia:

- B/R1/R2/R3 dzielą generator i wycenę. Role, ciągłość intencji i fazy wprowadzają
  różnice organizacyjne, ale nie cztery niezależne modele poznawcze.
- W kontrolowanych stanach oczekiwanie bramki wariantów driven/placed/chip
  jest wspólne, choć ich fizyczne wykonanie jest różne. To potwierdzona
  rozbieżność wymagająca implementacji i szerszej walidacji w PR187.
  Istniała przed PR185; sama nie wyjaśnia zmiany wyniku PR184→PR185.
- Znajomość wzorca zmienia czas rozpoznania i osiągniętą pozycję. Nie zwiększa
  siły, celności ani zasięgu. Faktyczny ruch i późniejsze podanie są fizyczne.
- Heading rozróżnia celność celowej główki przy identycznym dotarciu do piłki.
  Composure rozróżnia wykonanie pod presją, z identycznym wynikiem kontroli bez presji.
- Bramkarskie wyniki są ograniczone przez kontekst i niewykonane zamiary strzału.
  Brak rozdzielenia części pasm pozostaje wynikiem niejednoznacznym.
- Pełne B/R3 odtwarzają końcowe stany PR185 dokładnie. Nie ma dowodu poprawy
  meczu ani podstaw do strojenia współczynników pod ten jeden projekt SW.

**Canonical pozostaje NOT READY do kalibracji summary.** Trzy nowe polityki
PR187 mają oddzielne kontrakty i hipotezy; żadna nie została zarejestrowana jako
polityka produkcyjna. Nie dokonano promocji ani przemianowania historycznych polityk.

## 2. Baza i zachowane dowody

Baza: merge PR185 `e5b1a5cbbeb32f22be0278ad4a6800c3beea5496`.
Historyczne pomiary PR184/185 zachowują bajty i SHA-256 w
[`PR186-baseline.json`](performance/PR186-baseline.json). Harness sprawdza ich
niezmienność przy `--replay`. Nie przenumerowano starych prób na wyniki PR186.

[`PR186-source-manifest.json`](performance/PR186-source-manifest.json) zawiera
posortowane ścieżki i hashe źródeł z normalizacją CRLF→LF. Indeks i archiwa mają
wersję schematu, seedy, konfigurację i własny hash. Koszt CPU/RSS jest osobnym
wynikiem niedeterministycznym; nie wchodzi do hashy fizycznych prób.

Pełne mecze zachowują dokładne wejścia i stan otwarcia badanych okien w archiwach.
Ich `sourceSha256` jest hashem treści źródeł, podczas gdy mikroharness hashuje
manifest plików. Są to różne jawne receptury. Pełne mecze wykonano podczas prac
nad modułami badawczymi; późniejsze zmiany dotyczyły aparatury, nie kodu live.
Końcowy bridge porównuje historyczne wejścia i końcowe stany PR185 oraz
niezmienione pliki silnika, zamiast utożsamiać te dwa hashe.

## 3. Mapa architektury

| Etap               | Konkretne źródło                                                                                                                    | Informacja i wyzwalanie                                                                                           | Koszt / ograniczenie                                                                            |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Obserwacja         | `decisionReadiness.ts:16–50`, `decisionObservation.ts`; `coachIntelligence.ts:103`, `teamThreatMemory.ts:560`                       | Sygnatura geometrii i presji, epizod piłki; pamięć zagrożeń co 2 s; pozycje dla trenera co 5 s                    | O(22) dla sygnatury; brak pełnej indywidualnej mapy widzenia w starych politykach               |
| Kontekst taktyczny | `tacticalRoles.ts:378–479`, `roleTactics.ts:36`, `tacticalPreferences.ts`, `tacticalSituations.ts`                                  | Własny przydział roli/instrukcji, faza, profil i kondycja; trener ocenia plan rzadko (`coachIntelligence.ts:192`) | Ograniczony katalog ról; coach adaptability wpływa m.in. na częstość oceny, nie jest dyscypliną |
| Kandydaci          | `decisionPolicy.ts:19`, `roleTactics.ts:172`, `shootingOptions.ts:272`                                                              | Hold, carry, strzały, cross, bieżący carry, role/space passes, zwykłe podania, kombinacje                         | Zwracane maks. 48, maks. 3 sposoby dostarczenia; kolejność ma znaczenie                         |
| Wykonalność        | `passLaunchPlan.ts`, `playerArrival.ts`, `firstTouch.ts`, `shootingOptions.ts:367`, `onBallPreparation.ts`                          | Przybycie, kontakt, przygotowanie, spalony, noga i wysokość                                                       | Lokalny prognozowany lot i ETA; nie oddzielny pełny mecz dla każdej opcji                       |
| Wycena             | `decisionStateValue.ts:50,115,206`, `passDecision.ts:73`, `shootingOpportunity.ts:38`                                               | Wspólny model wartości kontrolowanego stanu, strat, gola i kontynuacji                                            | Horyzont carry 2,5 s, discount 12 s; prognozy ruchu/kooperacji są założeniami                   |
| Wybór              | `decisionPolicy.ts:130`, `matchActions.ts:803–927`                                                                                  | Sortowanie i niezależny seed szumu kompetencji; istniejący kontekst roli/fazy                                     | Maks. 48 ocen; częste ponowne rankingi trzeba mierzyć oddzielnie od akcji                       |
| Przygotowanie      | `decisionReadiness.ts:36,61`, `onBallPreparation.ts`, `matchActions.ts:888`                                                         | Percepcja 0,12–0,30 s; minimalny odstęp pełnego rankingu 0,1 s, spokojny 0,55 s; rearming po kontakcie 0,12 s     | Ponowny ranking nie znaczy gotowości wykonania; ręczne wybory mają własną ścieżkę agency        |
| Wykonanie          | `matchActions.ts:1008`, `canonicalMovement.ts`, `footContact.ts`, `ballContactGeometry.ts`, `shotResolver.ts`, `matchSimulation.ts` | Te same akcje i fizyka dla człowieka i NPC; rzeczywisty ruch, impuls, lot, kolizje                                | Stały krok 0,025 s; wybrana intencja może być odrzucona przy wykonaniu                          |
| Feedback           | `footballIntelligenceDiagnostics.ts`, `matchFlowTelemetry.ts`, `teamThreatMemory.ts`, `coachIntelligence.ts`                        | Fakty kontaktów, podań, szans i powtarzanych problemów; obserwatorzy poza stanem kariery                          | Ograniczone pamięci i próbki; dotychczas brak trwałej indywidualnej znajomości wzorców          |

To audyt dostępu, nie deklaracja, że obecny model ma już ograniczoną wiedzę
każdego gracza. Stare funkcje dostają cały `TacticalMatchState`: widzą dokładne
pozycje/prędkości, a prognozy przeciwników korzystają z ich rzeczywistych zdolności.
Jest to informacja uprzywilejowana względem proponowanej percepcji zawodnika.
Nie znaleziono odczytu przyszłych realizacji fizycznego RNG przez ranking.
Nowe polityki wymagają adaptera percepcji; samo ukrycie RNG tego nie rozwiązuje.

### Wspólna wycena i limit kandydatów

Historyczne identyfikatory pozostają: legacy `legacy-pr176`, B `state-value-v1`,
R1 `role-value-v1`, R2 `role-intent-v1`, R3 `phase-role-hybrid-v1`.
R1 zmienia organizację/rolową wartość; R2 dodaje podtrzymywane intencje; R3
fazy i oczekiwania. Wszyscy czterej używają `rankStateValueActions` i
`evaluateStateValueAction`. Legacy zachowuje odmienną starszą ścieżkę.

Strzały powstają przed rozbudową listy podań. W 36 kontrolowanych snapshotach
nie zginął żaden element menu strzałów. Nie dowodzi to kompletności wszystkich
okazji meczowych. Rola/space passes powstają przed zwykłymi partnerami, a
kombinacje późno. `addPass` przerywa lokalną pętlę po limicie, lecz zewnętrzne
pętle mogą nadal generować dalsze propozycje, zanim końcowe `slice(0,48)` je utnie.
Może to kosztować CPU i faworyzować wcześniejsze rodziny. Nie zmieniono kolejności
bez pomiaru skutków. Licznik meczowy `atCandidateCap` liczy rankingi o 48
**ocenionych** elementach; nie jest pełnym licznikiem odrzuconych propozycji.

## 4. Rozbieżności decyzja–wykonanie

| Obserwacja                                                     | Status i decyzja                                                                                                                                                                                                                                      |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wspólne oczekiwanie gola dla driven/placed/chip                | Potwierdzone w 12 snapshotach. `decisionStateValue.ts` używa ogólnego `evaluateShootingOpportunity`, podczas gdy `shotResolver.ts` wykonuje profil konkretnej techniki. Test porównuje rzeczywiste wektory startowe. Etapować wycenę technik w PR187. |
| Gotowa intencja, niedostępna stopa lub przygotowanie           | Potwierdzone w kontrolowanych epizodach i śladach. Poprawne rozpoznanie nie gwarantuje wykonania przed utratą piłki. Bez obniżania fizycznych wymagań.                                                                                                |
| Przyjęcie kontra późniejszy odzysk                             | Mierzone osobno w istniejącym laboratorium; czas odzysku nie jest celnością pierwszego dotknięcia.                                                                                                                                                    |
| Technique/dribbling oraz firstTouch/agility                    | Częściowo rozdzielone: kontakt, nawrot i pojedynek dają różne odpowiedzi. Brak podstaw do podziału/usunięcia atrybutów.                                                                                                                               |
| Wycena retencji kontra szansa                                  | Zachowawcza cyrkulacja jest obserwowana; złe proporcje wartości pozostają hipotezą. Nie dodano premii za strzał, postęp ani zakazu cofania.                                                                                                           |
| GK sweeping i 1v1                                              | Istnieją rzeczywiste mechanizmy approach, reaction i claim. Część późnych strzałów nie dochodzi do wykonania; dokładny odczyt lotu ogranicza badanie błędnej percepcji. Zachować wynik niejednoznaczny.                                               |
| Skok i główka                                                  | Pionowy stan/skok i aerial eligibility istnieją; live automatyczne planowanie wybicia nadal etapowane z PR185. Celna główka nie jest dodatkowym zasięgiem.                                                                                            |
| Foot surface/weak foot/tarcie/spin/presja, carry/turn i osłona | Zachowano mechanizmy i dowody PR185. Nowy audit nie uzasadnia strojenia globalnej fizyki.                                                                                                                                                             |

Nie zastosowano poprawki gameplay tylko po to, aby wykazać dodatni rezultat.
Naprawiono natomiast aparaturę: podanie `through_ball` jest rozpoznawane jako
wykonane podanie; wynik zaplanowanego strzału musi należeć do jego ID i czasu
rzeczywistego release. Późniejsza akcja innego gracza pozostaje wynikiem epizodu.

## 5. Współpraca i znajomość taktyki

`tacticalCognition.ts` zawiera schematy Zod obserwacji, wzorców, wiadomości,
wymagań trenera i wiedzy. `tacticalCognitionLab.ts` łączy je z istniejącymi
rolami, `integrateCanonicalMovement`, kosztem fitness i zwykłym pass resolverem.

Trzy typowane wzorce to wsparcie kontry, bieg po obserwowanym przygotowaniu
deep playmakera i dwa rozstawione kąty wyjścia spod pressingu. Mają jawny trigger,
uprawnione instrukcje ról, zależność od właściciela piłki, rejon/czas, wymagane
dwie jednostki asekuracji oraz powody odmowy. Intencja nie jest nowym MatchAction.
Pozycje ustala się tylko jako wejście aparatury; późniejsze przemieszczenie
pochodzi z ograniczonego przyspieszenia, orientacji, hamowania i równowagi.
Następnie normalne ticki meczu rozstrzygają podanie, rywala, kontakt i spalony.

W surowych wynikach są obserwacja, recognition/intention, każda próbka ruchu,
dotarcie lub jego brak i rzeczywisty rezultat podania. Dla system coach i
prepared, familiarity 0,1→0,9 daje 0,7995→0,2595 s rozpoznania. Wsparcie kontry
przemieszcza się średnio 6,516→9,140 m; playmaker run 6,516→9,387 m.
To skutek jawnego modelu opóźnienia i kanonicznego ruchu, nie odkryte empiryczne
czasy reakcji piłkarzy. Wsparcie kontry kończy się czterema ukończonymi podaniami,
a długie podanie playmakera trzema i jednym wyjściem poza boisko w każdym
z dwóch pasm. Rzeczywisty długi release ma ponad 30 m; aktywne przygotowanie
jest wymaganym cue, a wygasłe przygotowanie go nie wyzwala. Ten test nie
rozstrzyga jakości wzorca przeciw mocnej obronie ani przewagi familiar graczy w konwersji.

Minimalna wiedza eksperymentalna przechowuje wzorzec/signature, rolę, partnera,
trzy znajomości i liczbę istotnych ekspozycji. Nie jest częścią karty ani save.
System, rola i partner są różnymi składnikami; positionFamiliarity nadal opisuje
pozycję. GameReading/concentration określają percepcję; nie zastępują stażu w klubie.

Model rozróżnia inteligentnego nowego gracza, doświadczonego średniego czytelnika,
adaptującego się do nowej roli i gracza z dużą swobodą. Odpowiednie kontrasty
zmieniają wiedzę, role familiarity, reading lub coach freedom osobno. Nie dowodzi
to jeszcze optymalnego tempa uczenia ani poprawy realnego meczu.

## 6. Trener i adaptacja

Coach `adaptability` istnieje w profilu i częstości przeglądu planu.
Wymagania prototypu są osobną konfiguracją: complexity, changeFrequency,
discipline, creativeFreedom i rehearsal. Wysoka adaptowalność trenera nie
oznacza swobody zawodników. Nie dodano trwałych coach-card ratings.

Uczenie zachodzi po istotnym treningu, kompatybilnej sytuacji lub kooperacji;
idle i nieistotne ekspozycje nie uczą. Hidden player adaptability wpływa na tempo
przyswajania, professionalism na komponent treningowy. Kompatybilna rewizja
obniża przydatność system familiarity dla dotkniętego wzorca; zachowuje rolę,
partnera i inne rekordy. Nie ma uniwersalnego postępu za minuty meczu.

Trzy archetypy i pasma adaptability 20/60/100 mają po 32 ekspozycje. Tinkerer
otrzymuje jawne rewizje co osiem ekspozycji; wynik jest demonstracją założeń
modelu, nie walidacją wpływu trenerów na wyniki. Discipline/freedom są badane
oddzielnie przy indywidualnym wyborze. Rehearsal pozostaje parametrem projektu;
nie przypisano mu potwierdzonego samodzielnego efektu meczowego.

## 7. Reakcje, przygotowanie i utracone okna

Tryby motor/prepared/deliberate są funkcjonalnymi interwencjami badawczymi.
Nie stanowią trzech wdrożonych schedulerów ani modelu neurologicznego.
96 epizodów rozdziela observation, recognition, intention, bazowe przygotowanie,
przebieg action-specific preparation margin, rzeczywisty release i anulowanie.

Regresja `pr186-timing-debug` z zamykającym rywalem pokazuje: szybkie rozpoznanie
10,08 s, intencja 10,10 s, kontakt/strzał dopiero 10,40 s. Przy wymaganiu
przygotowania 1,2 s ta sama poprawna intencja nie zostaje wykonana przed utratą
kontroli. Deliberate może rozpoznać okazję po jej zamknięciu. Nic nie przywraca
piłki ani nie przesuwa jej do stopy. Szybko wykonany strzał może skończyć się blokiem.

Pole `intendedOutcome` dotyczy wyłącznie strzału z właściwym ID; `episodeOutcome`
może należeć do późniejszej akcji. To istotny negatywny wynik aparatury: zamrożony
zamiar nie oznacza zatrzymania świata, a utrata piłki może uruchomić zwykłe AI.
Surprise contact/orientację i dostępność powierzchni pokrywają zachowane testy
footContact PR185 oraz nowe moving-header/reach negative controls; pełny motor
controller ratunkowych kontaktów pozostaje do zbadania.

## 8. Motywacja i komunikacja

36 interpretacji kontekstu obejmuje neutral/protecting/chasing, zmęczenie i presję,
osobisty bodziec oraz trzy filozofie. Opcje i bliskie wartości są wstrzykniętymi
wejściami eksperymentu. Cztery wybory odbiegają od instrukcji przy stracie wartości
0,01; 32 pozostają team-support. Tolerancja jest ograniczona do 0,02. Nie jest to
kanoniczna walidacja osobowości. Ambicja nie mapuje się na strzał, agresja na faul,
a execution/outcome quality pozostają puste do faktycznego wykonania.

Komunikat ma nadawcę, odbiorcę, zaobserwowanego rywala, zakres do 22 m, czas
ważności 1,2 s, pewność i autorytet. Odbiorca może go przyjąć, odrzucić lub
nie zrozumieć. Opponent profiles, cele i przyszłe akcje nie są przekazywane.
Leadership wpływa na zaufanie; pewność opiera się na reading. Treść insight jest
na tym etapie zadana przez badacza, nie wykrywana przez gotowego lidera live.

W ośmiu parach relevant i inaccurate advice zostały przyjęte; expired było
niedostępne, low-authority odrzucone. Relevant przyspiesza rozpoznanie i zmienia
ruch; inaccurate kieruje w inny fizyczny rejon. Proste podania ukończyły się we
wszystkich tych warunkach. Nie ma więc dowodu, że sama rada poprawia konwersję.
Żaden komunikat nie podnosi techniki partnera ani nie zastępuje planu trenera.

## 9. Eksperymenty atrybutowe

Pełny plan przyczynowy, confounders, invariants, negatywne kontrole i falsyfikatory:
[`PR186-experiment-design.json`](performance/PR186-experiment-design.json).
Pięć pasm 20/40/60/80/100 używa sparowanych seedów. Powtórki deterministycznych
torów nie są dodatkowymi niezależnymi scenariuszami. Null oznacza brak pomiaru,
nie zero błędu ani pomyślne ukończenie.

| Test                         | Wynik 20→100 i interpretacja                                                                                                                                                                                                                    |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Heading, ruchoma piłka 8 m/s | Reach i wykonanie 16/16 w obu pasmach; średni fizyczny błąd celu 2,520→0,698 m, on-target 14→16. Przy presji błąd 4,286→2,498 m. Jest różnica wykonania, bez dodatkowego reach.                                                                 |
| Composure                    | Bez presji identyczny błąd 0,856 m. Z markerem 6,415→1,526 m i on-target 4→15/16. Rozróżnia konkretny popyt wykonania, nie ogólną mądrość decyzji.                                                                                              |
| SetPieces, controlled curl   | Bez presji 1,354→0,422 m; z presją 2,872→1,932 m. Pomiar po rzeczywistym specjalizowanym launch i lotach.                                                                                                                                       |
| OneOnOnes                    | Cztery zadane chwile strzału, placed/chip i lustrzane cele. Osobno raportowane scheduled shot outcomes i wyniki całego epizodu. Późny zamierzony strzał często nie jest fizycznie dostępny. Nie ogłaszamy walidacji ani nieaktywności atrybutu. |
| GoalkeeperSweeping           | Rzeczywiste podanie i wyścigi do trzech głębokości; przy 96 m istnieje meaningful choice. W tych warunkach pasma nie rozdzieliły wyników. Niedokładny/stary odczyt bramkarza wymaga adaptera percepcji w następnym etapie.                      |
| FirstTouch/agility           | First contact quality i later recovery są oddzielne. FirstTouch zmienia przyjęcie; agility zmienia również fizyczny nawrót (1,110→0,557 s w danym torze). Nie są to niezależne, idealnie ortogonalne odpowiedzialności.                         |
| Technique/dribbling          | Technique zmienia przyjęcie; body-only turn jest kontrolą bez piłki. Feint przeciw commit/delay kończy się ucieczką we wszystkich badanych pasmach, więc ten miernik pozostaje nasycony i nie rozstrzyga redundancji dribbling.                 |

Pozostałe odpowiedzialności mają pełny indeks odczytów w
[`PR186-attribute-source-inventory.json`](performance/PR186-attribute-source-inventory.json).
Odczyty w nowych plikach research są jawnie nowymi eksperymentami, nie dowodem
wcześniejszego działania live. Positioning współtworzy arrival/cover/keeper approach;
reading i concentration występują w percepcji, aerial i rolach. Leadership ma
dotychczas m.in. kontekst summary/rozwój, a nie globalny mnożnik współpracy canonical.
Determination występuje m.in. przy restartach i rozwoju; aggression w willingness
to challenge; ambition/professionalism mają rzeczywiste odpowiedzialności kariery,
treningu i transferów (`development.ts`, `npcTransferMarket.ts`, `npcRetirement.ts`).
Nie dodano im dowolnych nowych funkcji meczowych. Nie zmieniono żadnej karty.

Hidden adaptability ma już zastosowanie w `positionLearning.ts`. Poza generowaniem
profili i nowym eksperymentem nie znaleziono bezpośrednich odczytów hiddenProfile
w istniejącym katalogu `matchSimulation`. PressureResistance, consistency i
importantMatches nie dostają tu arbitralnego wpływu live; brak bezpośredniego
odczytu w tym katalogu nie jest dowodem zbędności całego pola kariery.

## 10. Kontakty i bezpieczeństwo

Typowany, maszynowo czytelny plan:
[`PR186-contact-plan.json`](performance/PR186-contact-plan.json),
`footballContactResearchPlan.ts`. Oddziela intentional, improvised, incidental i
potentially illegal. Obejmuje powierzchnie stopy/outside, thigh/chest/torso/head,
heel/toe, first-time/volley/half-volley, overhead/acrobatic, shielding/contests,
ricochets, hands/arms i roulette/kompozycje istniejących dotknięć.

PR185 foot surfaces, pionowy jump, aerial eligibility, volley/half-volley,
defensive challenges, goalkeeper handling i swept body capsules już istnieją
częściowo. Specjalizowane strzały/podania nie korzystają jeszcze ze wszystkich
tych samych powierzchni. Nie opisujemy całego repertuaru jako nieistniejącego.

Każda przyszła próba musi osobno ocenić wykonalność (zasięg, elastyczność, obrót,
balans), zagrożenie pobliskiej osoby, rzeczywisty kontakt i jego następstwa,
kwalifikację przewinienia oraz wznowienie i karę. Wysokość stopy sama nie
rozstrzyga czerwonej kartki. Nie implementowano nowego klasyfikatora przewinień.
Plan oparto na aktualnym [IFAB Law 12](https://www.theifab.com/laws/latest/fouls-and-misconduct/),
sprawdzonym 24.10.2026: niebezpieczna gra bez kontaktu, przewinienie kontaktowe,
recklessness/excessive force i ich sankcje wymagają różnych przesłanek;
bezpieczna przewrotka jest dopuszczalna. Handball wymaga oddzielnego kontekstu
ruchu ręki, pozycji i wyjątków; przypadkowe odbicie nie wystarcza do automatycznej decyzji.

Nowe regresje pokazują rzeczywisty skośny kontakt z kapsułą i brak kontaktu przy
przejściu przez fizyczną lukę; odpowiedź nie dodaje energii nieruchomego ciała.
`ballFlight.ts:346` i `matchSimulation.ts:1245` już obsługują geometryczne normals
i kontynuację odbicia. Następny etap ma rozszerzać regiony ciała oraz sprawdzać
last touch, block, własne gole i restarty po całych łańcuchach odbić. Obecne testy
nie stanowią pełnej walidacji wszystkich łańcuchów ani ręki. Nie ma mnożnika
szansy rykoszetu za strzelanie w tłok.

## 11. Mecze rozwojowe i przyczyny cyrkulacji

Wykonano pełne powtórki jednego już zużytego projektu SW PR185 oraz 120-sekundowe
kontrole development SS z innymi formacjami. SS nie jest nową niezależną
confirmation cohort. B/SS z obserwatorem i bez niego ma identyczny stan końcowy.

| Pełny SW                                      |           B |          R3 |
| --------------------------------------------- | ----------: | ----------: |
| Podania / ukończone                           | 1974 / 1044 | 1838 / 1106 |
| Faktyczne strzały                             |          27 |          20 |
| Rankingi                                      |       14657 |       14869 |
| Strzał w rankingu / najwyżej oceniony         |   1633 / 28 |   1720 / 20 |
| Najwyżej oceniony hold                        |         516 |         454 |
| Szybkie podania zwrotne (para do 8 s)         |         188 |         207 |
| Podania cofające ponad 2 m                    |         450 |         532 |
| Podania postępowe ponad 12 m                  |         431 |         338 |
| Próbki opportunity >0,1 / niedostępny kontakt |       6 / 5 |      11 / 8 |

Liczba rankingów strzału nie jest liczbą niezależnych szans ani wykonanych prób.
Większość wystąpień menu może dotyczyć słabego strzału. Rank #1 nie gwarantuje
release (B: 28 vs 27), a półsekundowe próbkowanie pomija krótkie okna.
W B trzy otwarte okna wysokiej opportunity zakończyły się strzałem. W R3 dwa
z pięciu nie mają zaobserwowanego release w obrębie okna. Przy otwarciach
699,050 s i 3504,050 s stopa była dostępna, lecz wszystkie trzy techniki
odrzuciła bramka przygotowania, a ranking wybrał carry. Ich stany i pełne
rankingi są w archiwum. To potwierdza lokalny mechanizm niedostępności tych
strzałów w chwili otwarcia; bez kontrfaktycznego replay nie dowodzi, że skrócenie
przygotowania poprawiłoby całe posiadanie lub wyjaśniło regresję PR184→PR185.

Pełne końcowe SHA-256:

- B `efbe24439a12484a870e2617577d5ccb304392f36f7480b11e8295cdf5f2ed46`.
- R3 `16de85216d7e374719fbe0cac1a0e3a764adf2751fa7c1e0d127c56ff5e0d6f1`.

To dokładnie stany PR185. Pamiętamy porównanie PR184→185: B 1866→1974 podań i
33→27 strzałów; R3 1721→1838 i 43→20. Nowe dane potwierdzają cyrkulację,
częstą selekcję alternatyw oraz znaczenie fizycznej dostępności, ale nie ustalają
jednoznacznego mechanizmu całej zmiany między wersjami. Trzeba odtwarzać te same
zamrożone sytuacje z aparaturą PR184/185 i oddzielnie zmieniać prognozę retencji,
wykonanie przyjęcia oraz readiness. Sam wzrost liczby strzałów nie jest celem.

Telemetria archiwizuje również holds, wejścia w tercję/pole karne, threat flow,
odbiór, przejścia, bramkarzy i restarty. Nie zastępujemy ich sztucznym wynikiem
„lepszego futbolu”. Wysoka skuteczność i inne ograniczenia historycznych spotkań
pozostają ostrzeżeniem. Nie otwarto przyszłych niezależnych projektów SS/SW/WW.

## 12. Konkretne zmiany i zakres korekt

Nowe moduły są importowane przez laboratoria i testy, bez aktywacji w schedulerze
meczu lub kariery. Nie ma nowych zależności runtime, trwałej migracji stanu,
zmian save/replay, ręcznych akcji, identity, active minutes ani statystyk live.
Fizyczny kontakt i opposition nadal rozstrzygają wyniki epizodów.

Rozwiązano rozbieżności aparatury i dodano regresje do niezmienionego resolvera
kontaktów. Potwierdzoną rozbieżność wyceny technik strzału **zdiagnozowano jako
wymagającą dalszej implementacji**. Pełne poprawki shot expectation, GK perceived
reads, skokowego schedulera i ruchu podporządkowanego wzorcom wymagają PR187/188.
Nie ma poprawek gameplay wymagających fikcyjnego „before/after improvement”.

## 13. Ograniczenia

- Lokalna percepcja prototypu ma promień 36 m, szeroki stożek i niezależny jitter.
  Nie modeluje pełnej okluzji ani trwałej pamięci indywidualnej. Ruch runnerów
  jest izolowany od kontaktów ciało–ciało do fazy rzeczywistego podania.
- Wzorce mają krótki, zadany epizod; pełna event-sensitive kontynuacja i anulowanie
  przy zmieniającej się asekuracji wymagają adaptera live. Współrzędne celu są
  taktyczną hipotezą, nie przyznanym skutkiem.
- Równania uczenia, trust, near-tie tolerance i opóźnień są jawnymi założeniami.
  Zmiana wyniku takiego równania nie waliduje atrybutu piłkarza.
- Kierunkowe próby celności po release integrują lot do płaszczyzny celu;
  nie mierzą pełnej konwersji przeciw bramkarzowi ani bloków na tej drodze.
- Badanie keeperów ujawnia również niewykonane intencje i późniejsze obce akcje.
  Ich wyniki są oddzielne. Nie implementujemy fikcyjnie błędnego odczytu lotu.
- Udane wszystkie feinty oznaczają nasycenie testu, nie brak znaczenia dribbling.
- Crowded acrobatics ma macierz przyszłych testów i regresje geometrii, nie
  kompletną fizykę przewrotek ani wdrożoną nową kwalifikację sędziowską.

## 14. Wykonywalna specyfikacja PR187

`decisionResearchProtocol.ts` definiuje trzy nowe, niezarejestrowane identyfikatory,
schemat wejścia, typ funkcji i walidator wyniku. Wejście obejmuje wyłącznie bounded
observation, maks. trzy wzorce, jedną intencję i do 48 kandydatów; nie cały stan
meczu, ukryte profile lub RNG. Wyjście zawiera czas, evidence IDs, intencję,
wybór/continue/cancel/wait i zużycie budżetu. Walidator odrzuca nieznane dowody,
przeterminowane okna, obcego aktora, niewidocznego adresata i przekroczenie budżetu.
Przyszły runner musi parsować/kopiować wejście **przed** wywołaniem polityki i
zewnętrznie rozliczać koszt; samo deklarowane zużycie w śladzie nie dowodzi kosztu.

| Nowy eksperyment                 | Odmienny mechanizm                                                                           | Obalalny test                                                                                                                                                                      |
| -------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A Opportunity-Driven             | Rozpoznane lokalne okna, closing time, koszt utraconej możliwości i wykonalny release        | Więcej rzeczywiście wykorzystanych krótkich okien niż B przy tej samej percepcji; brak wzrostu działań na niewidocznych danych i brak wzrostu strat/kar nieuzasadnionego korzyścią |
| B Hierarchical Intent            | Jeden cel i do trzech zależnych zamiarów; podtrzymywanie do nowej informacji/utraty warunków | Mniej redundantnych rankingów i błędów koordynacji przy zachowaniu asekuracji; zmieniony warunek musi anulować zależny zamiar bez przypisywania sukcesu partnerowi                 |
| C Contextual Individual Judgment | Ograniczona interpretacja, presja, pewność, motywacja, coach demand i bounded discretion     | Powtarzalnie różne, wyjaśnialne wybory w bliskich opcjach; żadnej deterministycznej reguły trait→action, dowolnego szumu ani przekroczenia budżetu regret                          |

Pełne kroki algorytmów i ślady:
[`PR186-policy-specifications.json`](performance/PR186-policy-specifications.json).
Wspólne invariants: zasady, offside, agency, ta sama wykonalność, ten sam execution
engine, brak przyszłego RNG i maks. trzy lokalne forecasts. Każda polityka ma
osobne strumienie/bufory; obserwator nie wpływa na symulację. Nie wolno po cichu
zastąpić historycznego B nową „polityką B”.

Procedura PR187: najpierw zamrozić kontrasty rozwojowe i kryteria release/latency,
cover, progression, lost windows, cancellations, fouls/offside, CPU oraz różnic
między prognozą a wykonaniem. Porównać trzy nowe polityki z legacy/B/R1/R2/R3,
z tym samym ograniczeniem wiedzy i fizyką. Po decyzjach implementacyjnych zamrozić
**nowe, nieotwarte** SS/SW/WW (formacje, profile fizyczne, fitness, GK), oddzielić
development od confirmation, wykonać pełne mecze i human browser smoke.
Przed otwarciem wyników określić akceptowany koszt CPU i regresje każdej metryki;
brak przyspieszenia nie usprawiedliwia usunięcia trudnych testów. Pojedynczy
korzystny seed ani trzy warianty tego samego projektu nie są niezależnym dowodem.

## 15. Odtworzenie, wydajność i weryfikacja

```sh
npm run benchmark:pr186
npm run benchmark:pr186:replay
npm run benchmark:pr186:matches -- --policy=state-value-v1 --full
npm run benchmark:pr186:matches -- --policy=phase-role-hybrid-v1 --full
npm run benchmark:pr186:matches -- --policy=state-value-v1 --design=pr186-ss --seconds=120
npm run benchmark:pr186:matches -- --policy=state-value-v1 --design=pr186-ss --seconds=120 --observed=false
npm run verify
```

`PR186-evidence-index.json` jest indeksowanym punktem wejścia, `PR186-performance.json`
przechowuje koszt mikroharnessu. Osobne match receipts przechowują czas, CPU/RSS,
seedy, wejścia i hashe. Nie ma stałego dodatkowego kosztu ticka live, ponieważ
live nie importuje nowych modułów. Koszt jawnie włączonego research observera
nie jest przedstawiany jako koszt zwykłego meczu. Testy obejmują deterministyczną
powtórkę, neutralność obserwacji, kontakty, timing, atrybuty i kontrakty polityk.

Dokładny wynik poleceń i końcowe potwierdzenie znajdują się w
[`PR186-verification.json`](performance/PR186-verification.json). Początkowe
uruchomienie Vitest w sandboxie Windows zakończyło się EPERM przy rename pliku
tymczasowego, przed testami. Pełna weryfikacja używa przypiętego lokalnego npm,
zainstalowanego przez runtime pnpm, oraz standardowego niezmienionego `verify`.

Zmiana sekwencji jest jawna: PR186 stał się diagnostic/research foundation,
PR187 obejmuje implementację eksperymentalnych polityk, niedokończoną kalibrację
i następnie niezależną walidację transferu. Outstanding physics calibration
nie znika; większe elementy przechodzą do PR187/188. Generational renewal,
summary/PlayStyles, career UX i world expansion zachowują cały zakres w roadmapie.
Summary pozostaje zablokowane do przekonującej niezależnej walidacji canonical.
