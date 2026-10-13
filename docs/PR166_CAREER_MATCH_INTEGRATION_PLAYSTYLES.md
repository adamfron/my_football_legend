# PR166 — Career–Match Integration & Behavioural PlayStyles

Baza: scalony PR165, `ebb88a579098973cfefe72c26898c1b736541db4`, drzewo
`c34ad9b7556b604b17d98382fcc33a7e209bd044`. Zmiana łączy rzeczywisty terminarz
U-17 i profesjonalny z tym samym meczem, który działa w Match Lab. Dodaje sześć
stylów rozwijanych z powtarzalnych, rozstrzygniętych decyzji człowieka, retencję
wyników i naprawia fizyczną orientację drugiej połowy oraz duplikaty menu.

## Etapy i ustalenia audytu

1. Przeczytano stan projektu, roadmapę i raporty PR164–PR165 oraz adaptery,
   kalendarz, księgę udziału, rozwój, zapis, runtime, statystyki i prezentację.
2. Rozszerzono istniejący kontrakt o prawdziwe kohorty U-17, dobór trenera,
   dyscyplinę i jawne zakończenie przez przerwanie meczu.
3. Podłączono `MatchGame` do współdzielonego runtime; zapis jest transakcją
   istniejącej kolejki, a niezapisany mecz można deterministycznie rozpocząć ponownie.
4. Dodano trwałe, małe receipts i ograniczono bogate wyniki; następnie rozwój
   i kontekstowe efekty istniejących PlayStyles.
5. Naprawiono orientację geometrii/przepisów/prezentacji i mechaniczne duplikaty.
6. Przeprowadzono testy fizyczne, kariery, storage, UI, pełne `verify`, pomiary
   produkcji i kosztu CPU. Szczegółowe dowody i ograniczenia są poniżej.

PR164 przyjmował głównie ligi profesjonalne; dawny `MatchGame` korzystał z
narracyjnej symulacji, a fizyczny wynik nie zasilał pełnych konsekwencji kariery.
Całe wyniki pozostawały w historii bez limitu. Dawne zdobywanie stylów opierało
się na tagach/licznikach. Kierunek `home → +x` był zaszyty także po przerwie.
Identyczne widoczne etykiety mogły oznaczać zarówno duplikat, jak inne intencje.

## Architektura i własność danych

```text
advanceSimulationStep / istniejący kalendarz
  → realny fixture i dobór trenera / matchPresentation
  → lazy MatchGame: createCareerMatchInput → startCareerMatch
  → RunningLabGuard / ten sam canonical tick, interakcje, replay i renderer
  → CareerMatchEvidence.observe, każda kanoniczna zmiana
  → full_time lub abandoned → finishCareerMatch
  → applyCareerMatchResult, jedna księga seasonParticipation
  → kolejka zapisu v7 → CareerView → dalszy kalendarz
```

`activeMatch` pozostaje zgodnym wstecz markerem istniejącego przejścia. Jego
narracyjny runner nie jest wykonywany przez nowy ekran. Już ukończony marker
ze starego zapisu pokazuje wcześniejszy wynik; nie tworzy nowego meczu. Marker
nieukończony przygotowuje kanoniczny mecz od początku.

Adapter U-17 korzysta z aktualnych kohort, `getYouthSquadSelectionContext`,
resolvera świata, prawdziwych ID drużyn i definicji ligi. Obiekt klubowy służy
transportowi metadanych do współdzielonego runtime, bez tworzenia seniorów.
Seniorzy nadal pochodzą z overlay świata, transferów i rozwiniętego profilu.
Obie ścieżki używają `selectBestXI` i bieżącej kondycji. Kadra meczowa ma siedmiu
rezerwowych, zgodnie z hierarchią kariery. Produkcyjne UI nie używa `forceIntoXI`.

Pierwszy wybrany występ U-17 jest ważnym meczem. Kolejne rutynowe fixtures
nadal podlegają dotychczasowym regułom. Receipts kanoniczne liczą się do limitu
grywalnych meczów sezonu, tak jak dawne `interactive_match`; `simulate_all`
zachowuje istniejącą szybką ścieżkę. Ważny mecz może zostać rozegrany z ławki:
przewidywane minuty nie zastępują rzeczywistej decyzji trenera o wejściu.

## Kontrakty, skutki i zapis

Kontrakt v1 nadal waliduje Zod, właściciela kariery, świat, fixture, skład,
wejścia, chronologię zmian i fingerprint wejścia/wyniku; limit wyniku wynosi
96 kB. Nowe pola są opcjonalne przy starych danych: style, evidence,
`metricsSource`, statystyki kanoniczne, orientacja okresu i data wyzdrowienia.
Nie zwiększono wersji save v7 i nie zmieniono kolejki/migracji PR164.

Wynik fizyczny jest jedynym źródłem score, udziału, G/A, kartek, zmian,
kondycji i kontuzji. `seasonParticipation` ma jedną pozycję na fixture.
`matchHistory` jest projekcją rzeczywistych występów; niewykorzystana ławka
nie dodaje pozornego występu. Dokładne minuty, również poniżej jednej minuty,
pozostają w `canonicalStats`; stary integer `minutes` służy zgodności.
Archiwum i sumy udziału używają dokładnych minut. Znajomość sąsiedniej pozycji
rośnie raz przy zamknięciu zaplanowanego wiersza; dotąd uprzednio utworzony
ledger pomijał ten istniejący mechanizm. Rozwój używa istniejących reguł
`applyAppearanceConsequences`, bez dodatkowego losowania występu.

Nie ma kanonicznych xG/xA/oceny ani kompletnego denominatora strzałów na
bramkarza. Kompatybilne starsze pola liczbowe zachowują sentinele zero,
oznaczone `metricsSource: canonical`; UI pokazuje brak pełnych danych.
Archiwum przechowuje liczbę ocenionych i kanonicznych występów, żeby sezon
bez ocen pokazywał `—`. Projekcja GK zwraca brak xGA, procentu obron i bramek
zapobieżonych przy niepełnych danych. Gol w narracyjnym podsumowaniu nie ma
wymyślonego czasu; dostępne czasy kartek, zmian i urazów pozostają rzeczywiste.

Kondycja i urazy wszystkich uczestników trafiają do overlay świata, a uraz
kontrolowanego piłkarza również do istniejącej dostępności. Termin wyzdrowienia
pochodzi z daty meczu + `recoveryDays`; klasy muscle/joint/impact mapują się na
strain/joint_injury/bruise, bez dodatkowego modelu medycznego. NPC z receipts
odbywają istniejące kary: cztery żółte → jeden fixture, druga żółta → jeden,
bezpośrednia czerwona → trzy. Kolejne zaplanowane mecze klubu odbywają karę
także w trybie rutynowej symulacji. Pełny rozwój i style NPC pozostają PR167.

`abandoned` wymaga prawdziwego powodu i czasu zakończenia; zachowuje faktyczny
prowizoryczny score i udział. Fixture jest zamknięty z oznaczeniem przerwania,
bez punktów/tabelowego wyniku 3:0. Brakuje procesu późniejszej decyzji federacji;
to jawne ograniczenie, nie zwykły full time.

Receipt sprawdzany jest po walidacji właściciela/świata, przed bieżącym sezonem.
Dlatego identyczna próba po reload, archiwizacji lub zmianie sezonu jest no-op;
inny fingerprint jest odrzucany. Ekran ma blokadę podwójnego commitu i generację
sesji chroniącą przed starym callbackiem. Po nieudanym zapisie runtime i wynik
pozostają do ponowienia, a React nie pokazuje częściowo rozliczonej kariery.
Wyjście/refresh przed commitem rozpoczyna ten sam fixture od początku. Nie ma
checkpointów mid-match ani zapisu pełnego stanu silnika co klatkę.

## Retencja długiej kariery

Permanentny receipt zawiera fingerprint wyniku, właściciela, fixture/datę/kluby,
wynik/status, statystyki kontrolowanego zawodnika, accounting zespołów, istotne
fakty, dyscyplinę i małe agregaty stylów. Uczestnicy mają walidowany tuple v1:
ID, strona, start, minuty, G/A, YC/RC, kondycja, pozycja, 10 liczników i uraz.
Kolejność liczników dokumentuje `RETAINED_COUNTERS` w `careerMatchSummary.ts`.
Brak licznika jest `null`, nie fikcyjnym pomiarem. Reader dyscypliny rozumie
także starsze obiektowe summaries.

Bogate `result` zachowują tylko ostatnie trzy fixtures aktywnego sezonu.
Kolejny zapis i kompaktowanie historii usuwają resztę bogatego evidence oraz
szczegóły wszystkich poprzednich sezonów. Fingerprint, podsumowanie i provenance
pozostają. Replay jest pamięcią działającego runtime; nie jest trwałym archiwum
wideo. Nieznany/niepoprawny stary payload zachowuje się zamiast cicho go usuwać.
Lekki moduł retencji nie importuje silnika 3D do startowej ścieżki persistence.

## Sześć stylów

Każdy styl wymaga co najmniej czterech meczów, ośmiu kwalifikujących sytuacji,
dwóch rozstrzygniętych sukcesów, dwóch różnych kontekstów, 180 minut doświadczenia
i właściwych umiejętności ≥45. Porażka może wnosić kwalifikującą próbę; sam
szczęśliwy wynik bez znaczącego kontekstu nie kwalifikuje. To mierzalny lokalny
heurystyczny kontekst, nie pełny obiektywny sędzia jakości decyzji z PR168.

| Styl | Kwalifikująca się decyzja | Rzeczywisty, ograniczony efekt |
|---|---|---|
| Podanie progresywne | świadome podanie ≥8 m naprzód, omijające rywala | przygotowanie takiego podania krótsze o 0,025 s |
| Gra między liniami | ruch w przestrzeń między liniami z faktyczną progresją >0,02 | kierunkowe przyjęcie pod presją w ataku pozycyjnym krótsze o 0,025 s |
| Odbiór i pressing | aktywny pressing, przechwyt albo próba odbioru przy posiadaczu, bez celowego faulu taktycznego | bliska antycypacja ruchu posiadacza +0,02 s w zasięgu 8 m |
| Chłodna głowa pod bramką | strzał z ≤25 m pod presją ≥0,15 | przygotowanie tego strzału krótsze o 0,025 s |
| Nieustępliwy silnik | znaczący wysiłek po 60. minucie z faktyczną progresją >0,02 | po 3600 s pracy odzyskiwanie gotowości podczas odpoczynku +3% |
| Rozpoczęcie gry | progresywne podanie GK ≥8 m pod presją ≥0,15 | przygotowanie takiego podania krótsze o 0,025 s |

Ulgi przygotowania mają łączny limit 0,04 s. Koszt energii, długotrwała kondycja,
gotowość fizycznego kontaktu, geometria i skuteczność pozostają w silniku. Żaden
styl nie gwarantuje kontaktu, podania ani gola i nie dodaje RNG. Style mają
wpływ dopiero w następnych meczach; payload składu/substytucji niesie istniejące ID.

Observer deduplikuje ID decyzji, ocenia dopiero resolved outcome, ogranicza
kwalifikację do jednej na styl w pięciominutowym oknie i maksymalnie ośmiu
na fixture. Zachowuje 12 ostatnich outcomes oraz małe agregaty per styl.
Progres jest sumowany z permanentnych receipts między sezonami; fakt zdobycia
ma jedno stałe ID i wskazuje receipts. Profil pokazuje nazwy, progres, wymagania,
datę, skutki i widoczne ogłoszenie zdobycia. Stare poprawne unlocki zachowują się.
Samo bierne utrzymywanie ustawienia, linii lub containment nie zbiera stylu
odbioru nawet przy bliskim posiadaczu i późniejszym odzyskaniu piłki przez zespół.

## Zmiana stron i menu

`endsSwitched` jest opcjonalnym, walidowanym stanem meczu/zespołu/piłkarza.
`attackDirection` rozdziela klubową stronę `home/away` od kierunku fizycznego.
Po przerwie zmieniają się anchory, formacja, własna bramka, forward value,
spalony, kontakty/odbicia, GK, wznowienia, pressing, strzały i cele człowieka.
Stare pamięci zagrożeń/preparation/offside są czyszczone. Pozycje i prędkości
ciał zostają ciągłe; gracze dochodzą do nowych celów wznowienia. Zmiany, klatki
replay, linia spalonego, kamera i wybór bramki niosą tę samą orientację.
Score nadal należy do logicznych klubów. Jest to naprawa poprawności,
bez polityki wymuszania ofensywy lub ponownej kalibracji podań/pressingu.

Menu deduplikuje target + resolution już przy projekcji, a następnie grupowaniu.
Identyczna mechanika zachowuje pierwsze ID. Inne intencje zostają i otrzymują
polskie doprecyzowanie intencji/delivery/celu. ID zwykłych akcji jest stabilnym
hashem mechaniki zamiast numerem w tablicy. Restart i zwykłe menu korzystają
ze wspólnej reguły; poprawka nie ukrywa prawidłowych wyborów.

## UX i wygląd

Wprowadzenie pokazuje ligę, datę, prawdziwe kluby, składy trenera, rezerwę i
udział kontrolowanego piłkarza. Runtime pokazuje score, czas, okres, stan udziału,
zmiany/przerwę i podsumowanie dostępnych liczników. Wybór celu z listy wspiera
klawiaturę i prowadzi do tych samych interakcji co kliknięcie na boisku.
Po legalnym zakończeniu osobny przycisk zapisuje wynik i wraca do kariery.
Diagnostyka/reset/scenariusze DEV pozostają w Lab; normalna kariera je ukrywa.
Używa tego samego visualContext daty, twarzy, kitów, stadionu i replay PR165.

## Walidacja i pomiary

**Końcowe `npm run verify` PASS**: ESLint, 1619 testów głównych w 197 plikach,
31 testów wznowień/renderera, cztery testy kontraktu (trzy pełne fizyczne mecze:
U-17 raz i pro dwukrotnie), pięć testów pełnej kariery oraz TypeScript/build.
Łącznie **1659 testów**, około 18 minut. Ostatnie rozszerzone testy orientacji
(GK wysokiej piłki, siatka po golu, telemetry i dynamiczne cele krycia) przeszły
dodatkowo 5/5; wszystkie są również objęte końcowym verify, z pełnymi fixtures.
Przed tym przebiegiem doprecyzowano próg progresji efektu GK (13/13 testów stylów PASS).
Produkcyjny test naturalnie wybranego rezerwowego ujawnił odczyt nieistniejących
statystyk przed wejściem: widok teraz odczytuje summary dopiero po zarejestrowaniu
uczestnika i pokazuje stan ławki. Pula UI przeszła 20/20, finalna asercja ławki
1/1 oraz Match Centre 5/5; końcowe ESLint, TypeScript i build również PASS.
Końcowe pełne verify obejmuje nową regresję ławki, dokładne minuty archiwum,
ostateczne efekty stylów i poprawki orientacji; wcześniej przeszło także 1658 testów.
Manifest źródeł i walidacji: [PR166-verification.json](performance/PR166-verification.json).

U-17: **1:0**, 8 świadomych wyborów, koniec przy 5581,05 s, wynik **34 591 B**,
zapis **97 213 B**. Profesjonalny fixture `pro_51–pro_63`, 2027-08-29:
**0:0**, koniec 5460 s, 25 uczestników, trzy zmiany, siedem świadomych wyborów
(pięć rozstrzygniętych), wynik **29 179 B**. Dwa przebiegi
pro mają ściśle identyczny wynik i evidence. Commit zachowuje konsekwencje po
reload, a ponowne zastosowanie wyniku nie zmienia kariery.
Pierwszy input U-17 jest również identyczny po save/hydrate przed startem,
co sprawdza deterministyczny restart niezatwierdzonego fixture.
Receipts: [U-17](performance/PR166-youth-contract.json),
[pro](performance/PR166-professional-contract.json).

Wczesny verify ujawnił reset prędkości ciał przy przerwie i błędne traktowanie
starego adaptera bez sezonu jako U-17. Poprawiono źródło bez osłabiania istniejących
asercji. Kolejny run miał jeden timeout 30 s w istniejącym UI teście zmiany
zawodnika podczas równoległej przeglądarki. Bez zmian limitu: izolowana pula
19/19 przeszła, następnie całe verify przeszło bez równoległego browser benchmarku.

- `careerMatchContract.test.ts`: rzeczywiste U-17 bez wymuszenia XI, pełny mecz
  z decyzjami, commit → save → hydrate → ponowny commit → dalszy kalendarz;
  profesjonalny fixture z rzeczywistym wyborem trenera rozgrywany dwa razy,
  ścisła równość wyników/evidence i odrzucenie złego świata/kariery/fixture/składu.
- `pr166CareerMatch.test.tsx`: premature finish, dwuklik, nieudany zapis i retry
  na tym samym runtime, callback po unmount; to test granicy React, nie mock futbolu.
- `pr166CareerConsequences.test.ts`: prawdziwie wybrany rezerwowy, kanoniczne
  wejście i krótki występ, niewykorzystana ławka, brak dostępności, zgodność
  hierarchii siedmiu rezerwowych, daty urazów, GK, kary NPC z obu wersji summaries.
- `pr166PlayStyles.test.ts`: wszystkie sześć progów/odblokowań, save/load,
  kolejne sezony, ponowna ocena, nieistotne próby i efekty rzeczywistych funkcji.
- `pr166OrientationMenus.test.ts`: obie drużyny × lustrzane formacje, brak
  przeskoku ciał/bramek na granicy połowy, gole/geometria/GK/spalony/wznowienia/
  kamera oraz zachowanie odrębnych intencji w obu menu.
- Istniejące testy storage, starych zapisów, pełnej kariery, substitucji,
  human ownership, restartów, replay i deterministycznych goldenów pozostają.
  Nie zmieniono workerów ani limitów czasowych testów.

Pomiary CPU: trzy naprzemienne pary baseline/PR166, świeży Node 24.19.0,
ten sam host Windows, bez równoległego benchmarku przeglądarki lub testów.
Próbka zawiera 2400 ticków po 0,025 s. `interactive` obejmuje projekcję agency,
`background` używa ticku po wcześniejszym probe. Rendering/scheduler UI nie
wchodzą do czasu. Początkowe 200 probes może stać na oczekującej decyzji;
background następuje po interactive w procesie, więc JIT/GC mają wpływ.

| Scena / ścieżka CPU | PR165 mediana | PR166 mediana | Zmiana |
|---|---:|---:|---:|
| Zwykły początek, interactive, brak eligible wyborów w próbce | 4444,3 ms | 4408,1 ms | −0,81% |
| Zwykły początek, background | 2715,4 ms | 2688,1 ms | −1,00% |
| Kontrolowany bliski wolny, interactive, 4 wybory | 2274,3 ms | 2315,0 ms | +1,79% |
| Kontrolowany bliski wolny, background, 4 wybory | 1715,2 ms | 1575,7 ms | −8,13% |

W każdej parze zgadzają się próbki score/time/decisionIndex/ball. Krótkie okna
nie ustalają całomeczowego speedup ani FPS. Heap po próbkach PR166 wynosi
80–143 MB; to nieprzymuszony GC pomiar working heap/RSS, nie dowód retained
memory lub braku wycieku. Raw timings i memory:
[PR166-cpu.json](performance/PR166-cpu.json).

Produkcja w Edge: rzeczywista kariera `pr166-youth`, Jan Junior/LS, pierwszy
fixture **2026-09-05, Vistula Nova – Polonia Przemyśl U-17**, rzeczywisty wybór
trenera. 30 wyborów poprzez normalne cele/menu (29 rozstrzygniętych w zapisanym
kanonicznym evidence), celowe podania do partnerów i doskok, obie połowy,
końcowe **0:0** przy 90+02:27,
commit, tabela/terminarz, następny ważny fixture 2027-04-17, restart bez commitu
i reload identycznego kalendarza. Zero błędów strony, brak diagnostyki DEV.
Native WebGL2 działał na ANGLE/AMD Radeon 780M/D3D11; nie mierzono GPU/FPS.
Osobny preflight otworzył realnie wybranego rezerwowego (napastnik, ten sam
seed), bez wymuszenia XI i bez odczytu statystyk przed wejściem.
Próby ŚP w tym seedzie zakończyły się 0:0 bez eligible human decisions, również
w trybie całego meczu; commit/reload/kolejny fixture działały, lecz próby te nie
spełniły asercji pokrycia wyborów UI. Nie podniesiono sztucznie częstości agency.
[Receipt tych prób](performance/PR166-reduced-moments-smoke.json) zachowuje
to ograniczenie; pełny pozytywny smoke używa naturalnej roli skrzydłowego.
Pierwsza próba menu wybrała 26 razy hold i nie zdobyła żadnego evidence stylów;
końcowa próba wybiera podania do realnych adresatów i wymaga resolved outcome
w rzeczywistym zapisie IndexedDB.
Snapshoty: [wprowadzenie](images/PR166-career-introduction.png),
[boisko](images/PR166-career-pitch.png), [koniec](images/PR166-career-full-time.png),
[reload](images/PR166-career-reload.png).

| Transfer HTTP, ten sam Brotli11/cache, bajty z CDP | PR165 | PR166 |
|---|---:|---:|
| Zimne menu | 115 864 | 120 297 |
| Zimne wczytanie istniejącej kariery, dodatkowo po menu | 238 767 | 235 828 |
| Menu + zimny ekran zapisanej kariery | 354 631 | 356 125 |
| Kreator aż do career home, dodatkowo po pierwszym menu | 410 850 | 408 421 |
| Pierwszy kanoniczny fixture po zimnym career home | brak takiej ścieżki | 277 466 |
| Przejście intro → boisko, moduły już pobrane w intro | brak takiej ścieżki | 0 |
| Ponowny start niezapisanego fixture | brak takiej ścieżki | 0 |
| Następny rzeczywisty grywalny fixture w tej samej stronie | brak takiej ścieżki | 0 |

Suma zimnego menu/kariery rośnie o 1494 B (+0,42%). Career home pobiera dane
świata, ale nie MatchGame/TacticalMatchSandbox/model 3D. Względem startu po
kreatorze pierwszy mecz potrzebuje więcej bajtów, ponieważ zimny zapis nie ma
już renderer/model z podglądu kreatora w pamięci. Baseline ma narracyjną ścieżkę
kariery; nie przedstawiamy jej kosztu jako równoważnego pierwszemu 3D fixture.
Pomiar obejmuje response overhead i lokalną politykę cache/kompresji, nie
nagłówki wdrożonego hostingu. Pełne request lists i artefakty:
[PR166-browser.json](performance/PR166-browser.json). Po poprawce walidacji
archiwum i końcowym buildzie powtórzono cold transfer oraz intro/start/restart:
[PR166-transfer-final.json](performance/PR166-transfer-final.json); tabela
używa tych finalnych wartości. Zero bajtów następnego rzeczywistego fixture
oraz poniższe próbki heap pochodzą z pełnego smoke, wykonanego przed tą
jednolinijkową poprawką archiwum; runtime i renderer pozostały takie same.

Jednopunktowy working heap po creator/home: PR165 27,82 MB, PR166 28,46 MB;
po meczach/reload PR166 76,32 MB. GC i wcześniejsze wizyty mają wpływ; te próbki
nie dowodzą spadku memory ani opisują VRAM. Kanoniczny zapis z produkcji ma
**101 456 B UTF-8**. Benchmark długiej kariery rozpoczyna się dokładnie tym
zapisem, później używa rzeczywistych routine fixtures i save/hydrate przy rollover:

| Faktycznie zakończone sezony | Rozmiar zapisu UTF-8 | Bogate wyniki kanoniczne |
|---:|---:|---:|
| 0, jeden rozegrany kanoniczny mecz U-17 | 101 456 B | 1 |
| 1 | 160 882 B | 1, jeszcze przed rollover |
| 5 | 715 076 B | 0 |
| 10 | 915 128 B | 0 |
| 20, 562 fixtures w archiwum w chwili pomiaru | 1 222 458 B | 0 |

Fingerprint i score pierwszego meczu zachowują się w każdym sprawdzonym
milestone/archiwum. Osobna **próba pojemności** dodaje kopie prawdziwego receipt
do tej rzeczywistej długiej kariery: 120 receipts → **2 085 185 B**, 600 →
**5 622 785 B**. Odpowiada to nominalnie 6 lub 30 kanonicznym fixtures rocznie
przez 20 lat, ale nie są to niezależnie zagrane mecze. Historyczny routine-only
PR164 miał 1 211 563 B przy innym seedzie; nie jest parowanym porównaniem.
600 receipts przekracza istniejący soft budget 3 MB. Bogate payloady są bounded,
natomiast permanentne fakty/statystyki nadal rosną liniowo; dalsze pakowanie lub
osobne archiwum to przyszła praca, bez kasowania idempotencji i rekordów.
Raw measurements: [PR166-long-career-storage.json](performance/PR166-long-career-storage.json).
Próba rzeczywistego zapisu po podaniach ujawniła dawny integer constraint
archiwalnego wiersza minut. Archiwum waliduje teraz dokładne nieujemne minuty;
regresja kanonicznego cameo sprawdza snapshot → save → parse bez zaokrąglenia.
Po poprawce 17/17 testów konsekwencji/persistence oraz wszystkie 20 rollovers
i checkpoints storage przeszły. Historyczne integer minuty nadal są poprawne.

Niezależny pełny test U-17 sprawdza również retencję 600 rzeczywistych
payload copies, z najwyżej trzema rich results aktualnego sezonu; zapis
ma **4 641 163 B**:
[PR166-youth-contract.json](performance/PR166-youth-contract.json).
To próba serializacji/retencji, nie druga kampania fizycznego futbolu.

Odtworzenie: `node --experimental-transform-types --import
./scripts/registerTypescriptLoader.mjs scripts/benchmarkPr166Cpu.mjs <source>
open_play` lub `free_kick_close`; źródło baseline ma wskazane wyżej drzewo.
`benchmarkPr166Browser.mjs <baseline-dist>` używa Playwright z opcjonalnego
`MFL_PLAYWRIGHT_MODULE`, Edge i loopback Brotli11. Nie dodaje zależności produktu.
Domyślny smoke używa LS i `key_player`; `MFL_PR166_BROWSER_POSITION`,
`MFL_PR166_BROWSER_SEED` i `MFL_PR166_BROWSER_POLICY` wybierają normalne
opcje kreatora/prezentacji. Preflight napastnika na ławce jest osobny.
`--transfer-only` mierzy finalny build i startup/restart, zapisując osobny
receipt; nie zastępuje pełnego smoke z resolved outcomes.
`benchmarkPr166Storage.ts <actual-browser-save>` przechodzi przez rzeczywiste
rollovers, routine fixtures i save/hydrate; capacities są osobno oznaczone.

## Odpowiedzi na 24 pytania

1. **Świeża kariera U-17:** tak; rzeczywisty pierwszy wybrany fixture, bez
   prologu seniora. Pełny test `careerMatchContract` i production browser smoke.
2. **Profesjonalna:** tak; ten sam adapter overlay świata i pełny fixture
   dwukrotnie bez `forceIntoXI`, z celowymi decyzjami.
3. **Ten sam silnik co Lab:** tak; wspólne `RunningLabGuard`, kanoniczne
   ticki i player/contextual interactions. React obsługuje tylko przejście i zapis.
4. **Rzeczywiste drużyny i piłkarze:** tak; ID ligi/kohort/świata, składy,
   aktualne profile, kondycja, urazy i kary. Nie ma losowego zamiennego składu.
5. **Trener ma znaczenie:** tak; porównanie XI i siedmiu rezerwowych z
   `deriveSquadHierarchy`, produkcyjne `forceIntoXI=false`.
6. **Ławka/brak wejścia:** do wejścia kanoniczna symulacja bez agency; po
   wejściu decyzje eligible. Unused bench = zero minut, bez matchHistory występu.
7. **Decyzje człowieka:** selected/resolved/intent/actor i kontekst w evidence;
   autonomiczne kroki nie zwiększają liczby świadomych decyzji.
8. **Zakończenie i powrót:** tylko full_time/abandoned, walidacja i kolejka
   storage przed ekspozycją kariery. Browser i test retry sprawdzają przejście.
9. **Zgodny wynik w widokach:** fixture/ledger/history/archive korzystają z
   jednego commitu. Przerwanie ma jawny status i nie zdobywa punktów tabeli.
10. **Podwójny commit:** identyczny fingerprint = no-op także po reload i
    archiwizacji; inny = błąd. Blokady UI chronią dwuklik/stary callback.
11. **Błąd zapisu/przerwanie:** wynik pozostaje do retry po błędzie storage;
    niezapisany fixture restartuje od początku, bez deklarowania mid-match resume.
12. **Zdrowie i dyscyplina:** rzeczywista kondycja/uraz każdego uczestnika,
    daty recovery i istniejące kary gracza/NPC; routine fixtures odbywają kary.
13. **Dalsze sezony:** existing calendar/settlement/archive, brak drugiego
    kalendarza. Test po U-17 commit i pełna 20-letnia symulacja kariery.
14. **Retencja:** permanentne receipts/records/progres; trzy rich results
    bieżącego sezonu, zero rich z dawnych. Replay nie jest zapisem wideo.
15. **Rozmiar długiej kariery:** tabela pomiarów UTF-8 powyżej podaje osobno
    120 i 600 receipts ze skalowania prawdziwego wyniku oraz granice tej próby.
16. **Rozwój sześciu stylów:** tabela kontekstów/progów powyżej; ≥4 mecze,
    ≥8 znaczących prób, ≥2 sukcesy/konteksty i doświadczenie/umiejętności.
17. **Wpływ w przyszłości:** małe ulgi przygotowania, lokalna antycypacja i
    regeneracja po wysiłku, mierzone na istniejących funkcjach, bez gwarancji wyniku.
18. **Farming:** brak kwalifikacji nieszkodliwych podań, brak nierozstrzygniętych
    prób, dedup ID i jeden kredyt/5 min/styl; wymagane różne mecze i konteksty.
19. **Fizyczna zmiana stron:** tak; wszystkie geometryczne systemy korzystają
    z orientacji okresu, a nie rotacji samej kamery.
20. **Przepisy po przerwie:** lustrzane testy obu stron obejmują offside, GK,
    penalty/goal kick/corner/free kick/kickoff i właściwe cele bramek.
21. **Duplikaty:** identyczne mechaniki usunięte u źródła projekcji; odmienne
    intencje pozostają pod stabilnymi ID z doprecyzowaniem etykiety.
22. **Visual identity:** ten sam PR165 visualContext przekazywany z kariery
    do runtime/replay. Kosmetyka pozostaje poza football fingerprint i RNG.
23. **Lazy/performance:** silnik ładowany dopiero dla grywalnego fixture;
    pomiary HTTP/CPU/memory są rozdzielone powyżej. Kolejny mecz reuse modułów.
24. **Odłożone problemy:** sparse shots, długie rotacje podań, przechwyt vs
    prognoza, druga piłka, trwałe przekazywanie krycia i bogatsza ocena trenera
    pozostają PR168 lub później. PR167 rozwija NPC, PR169 narracje, PR170 atmosferę.

## Granice dowodu

Nie wykonano kosztownej kampanii setek niezależnych pełnych meczów. Skala
receipts mierzy prawdziwy serializowany payload, lecz nie przewiduje każdej
możliwej kariery. PlayStyle heurystyki nie zastępują przyszłego trenera/tactical
evaluator. Nie ma adjudykacji przerwanych meczów ani mid-match checkpointów.
Pomiary CPU nie są FPS/GPU; lokalny HTTP Brotli nie opisuje nagłówków hostingu.
Zachowane problemy realizmu futbolu nie są maskowane dodatkowymi strzałami,
wymuszonymi sukcesami, quota ani nerfami obrony.
