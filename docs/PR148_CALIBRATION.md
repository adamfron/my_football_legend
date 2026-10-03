# PR148 — Defensive Realism, Discipline and Match Cadence

PR148 łączy poprawki PR147.1 z kalibracją pojedynków, dyscypliny, podań, kontaktów,
ruchu i sprawczości. Zachowuje deterministyczny silnik PR145–147 i dotychczasowy
podział core/prezentacja. Nie wprowadza limitów liczby fauli, podań, kilometrów ani decyzji.

## Przyczyny i rozwiązania

| Przyczyna                                                                                                                                                              | Zmiana kanoniczna                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ball-follow gubił `lastTouchPlayerId`; utrzymanie posiadania wyglądało jak nowy kontakt. Stary wynik przyjęcia odnawiała też przygotowawcza akcja innego piłkarza.     | Pochodzenie kontaktu zostaje zachowane. Statystyki liczą dyskretne wypuszczenie, odbiór, przechwyt/kontrolę i wykonane prowadzenie, z deduplikacją. Sam właściciel, kopia starego dowodu i tick nie tworzą kontaktu.                                                             |
| Bliska para ponawiała odbiór po krótkim timerze, także przy zamianie właściciela piłki.                                                                                | Ograniczony do 22 wpisów epizod pary trwa do rzeczywistej zmiany sytuacji: rozdzielenia, progresji, podania/strzału lub trzeciego gracza. Kolejny obrońca może interweniować natychmiast.                                                                                        |
| Sama bliskość po nieudanym standing tackle często stawała się faulem; NPC nie uwzględniał kartki.                                                                      | Resolver rozróżnia kontakt z piłką, utrudnianie, spóźnienie i siłę. Ryzyko wynika ze składowych atrybutów, osłony, zagrożenia, położenia i stanu meczu. Kartka, także oczekująca podczas korzyści, obniża apetyt na ryzyko.                                                      |
| Człowiek mógł ponosić konsekwencje niebezpiecznej rutynowej autonomii.                                                                                                 | Rutynowy odbiór wycofuje niebezpieczny kontakt. Jawnie wybrana akcja zachowuje normalne ryzyko i konsekwencje wspólnego resolvera.                                                                                                                                               |
| Słaby drybler miał zbyt małą karę względem dobrze ustawionych silnych obrońców.                                                                                        | Większy wpływ tackling/positioning/gameReading/strength wobec dribbling/technique/agility/composure, z uwzględnieniem tempa i osłony; nadal występują wyniki losowe.                                                                                                             |
| Podania następowały prawie natychmiast; A→B→A bez zmiany sytuacji bywało domyślne.                                                                                     | Rzeczywista gotowość NPC zależy od kontroli, presji, przejścia i okazji strzeleckiej. Nieprzydatne podanie zwrotne traci użyteczność; kombinacja dająca progresję, przestrzeń lub wyjście spod presji pozostaje dostępna.                                                        |
| Korekcja kolizji 0,12 m/tick zasilała prędkość kolejnego ticku; cele formacji powodowały oscylacje. Właściciel bez prowadzenia sam zabierał piłkę w stronę ustawienia. | Korekcja ciała jest ograniczona przez `dt` i oddzielona od zintegrowanej prędkości/dystansu. Ruch hamuje przy celu; zwykła korekcja bloku ma intensywność walk/jog. Idle owner hamuje, a jawne carry/movement działa dalej. Rozstrzygnięty challenger przechodzi do containment. |
| Opcjonalne pola sprintu pozostawały w skopiowanym stanie po zakończeniu epizodu.                                                                                       | Jawne czyszczenie, wejście 0,82 maksymalnej prędkości, zwolnienie 0,70, dojrzewanie 0,65 s i odzyskanie gotowości po 1,2 s. Sprint distance pozostaje ciągły.                                                                                                                    |
| Istotna alternatywa progresywnego podania mogła zniknąć, gdy preferowano rutynowe podanie albo obie drogi należały do jednej rodziny.                                  | Bliskie jakościowo wyjście co najmniej 18 m do przodu przez linię przeciwnika, z inną realną drogą, stanowi wybór człowieka. Różnorodność etykiet sama nie tworzy decyzji.                                                                                                       |

Rozglądanie się ma także semantyczny koniec: po ukończeniu fizycznego przygotowania
i kontekstowego czasu oceny opcji użyteczność dalszego `hold` maleje. Kolejne `hold`
nie odnawia wieku posiadania. Bezpieczne osłanianie pozostaje dostępne, gdy wszystkie
drogi oddania lub prowadzenia piłki są wyraźnie niebezpieczne.

Końcowy ślad wykazał, że dalsza nadmierna gęstość pojedynków wynikała przede wszystkim
z rzeczywistego nawyku AI: pierwszy obrońca próbował odbioru po niemal każdym nowym
podaniu, także przy spokojnym posiadaniu z osłoną. Zwykły dobrze zabezpieczony marker
teraz utrzymuje dystans i linię. Zagrożenie, brak osłony, jawne prowadzenie, niepewna
kontrola lub atrybuty uzasadniające pressing nadal pozwalają na zobowiązanie do odbioru.
Zwykły standing wymaga komfortowego okna dostępu zależnego od jakości i tempa;
legalny odbiór nie wynika z kontaktu ball-second. Jawne techniki nadal mają pełny zasięg.
Piłka podczas rozglądania się pozostaje 0,45 m od właściciela; jawny ruch/prowadzenie
wypycha ją do kroku 1,15 m. Trzymanie piłki nie jest automatycznym wystawieniem jej markerowi.

Ukończone, świadomie wybrane `hold` jest z kolei sygnałem do zamknięcia dystansu przez
obrońcę. Bez tego połączenie ciągłości posiadania człowieka i biernego marking mogło
zatrzymać wymianę piłki na kilkadziesiąt minut. Powrót wyboru wynika z rzeczywistej
presji/kwestionowania posiadania; silnik nie oddaje za człowieka piłki ani nie generuje
ponownych promptów po samym upływie czasu. Test wykonuje normalne ticki, sprawdza
zbliżenie markera i przyczynę `possession_contested`.

Proxy DEV zachowuje źródło `dev_ai_selected`, ale jego pojedynczy świadomy wybór
hold/carry korzysta z tego samego kontraktu ciągłości co wybór człowieka. Spekulacyjny
strzał w menu nie znosi blokady ponownej identycznej decyzji; rzeczywista okazja
strzelecka i semantyczna zmiana sytuacji nadal zachowują sprawczość.

Obowiązek decyzji defensywnej jest oceniany względem bieżącego przesuniętego bloku,
przed tymczasowym pressingiem lub wyjściem do piłki, a nie statycznego punktu formacji.
W niezagrożonym obszarze osłona kolegi w tym samym kanale pozwala rutynowo przechwycić
podanie. Wyjście ze strefy bez osłony, ochrona groźnego wbiegającego rywala oraz
bezpośrednie zagrożenie bramki pozostają istotnymi wyborami. Zwykłe zbliżenie na
2,4–4,5 m nie staje się ważne tylko dlatego, że odległość przekroczyła próg kontaktu.

## Kontrakty terminalne i zdarzenia

`players` zawiera wyłącznie aktywnych piłkarzy. Spadek poniżej siedmiu po dowolnej
stronie natychmiast daje `status: abandoned` oraz
`termination: { reason: insufficient_players, at, team, activePlayers }`. Wynik i
czas pozostają faktycznym wynikiem/czasem przerwania. Silnik nie przyznaje walkoweru.
UI publikuje stan terminalny i kończy harmonogram symulacji; aktywny renderer, akcje,
cele i formacja nie uwzględniają wykluczonego. Historia, ostatni wykonany ruch i minuty
w chwili wykluczenia pozostają w statystykach. Stare wejścia nie wznawiają gry.

Kanoniczne `dribble` po wykonanym prowadzeniu uzupełnia strumień akcji z aktorem,
zespołem, czasem, pozycją, wynikiem i przyczynowym przyjęciem, gdy jest dostępne.
Renderer jedynie odczytuje zdarzenia. Finalne etykiety akcji i animacja zejścia są przyszłą pracą.

## Pomiary i odtwarzanie

Metodologia, parametry CLI i definicje surowych/per-90 miar:
[performance/PR148-calibration.md](performance/PR148-calibration.md).
Wyniki porównują świeży PR147 `4ae21ed13c3078ca424f40816d8bc426305b258c`
z kandydatem PR148. Ten sam seed, składy, rola i deterministyczna polityka jawnego
wyboru DEV obowiązują przed/po. Pomiar nie symuluje czasu namysłu człowieka.

### Wyniki końcowe, 2026-10-03

Surowy zapis, wszystkie miary per-90, rozkłady min/p25/mediana/p75/max, dane każdego
piłkarza, konfiguracje, nieudane przypadki bazowe i hashe:
[performance/PR148-results.json](performance/PR148-results.json).
Źródła podczas całego pomiaru pozostały niezmienione: `54fc253f317150112978f709e69a511063415879ddaab4ea9ccbd298dbf968ec`.

Porównanie tego samego `balanced-balanced:a`, kontrolowany CM, rzeczywiste 90 minut:

| Miara surowa                                |    PR147 |  PR148 |
| ------------------------------------------- | -------: | -----: |
| Próby odbioru                               |      349 |    293 |
| Faule / żółte / czerwone                    | 37/20/10 | 12/4/0 |
| Podania obu drużyn                          |     1935 |    779 |
| Kontakty obu drużyn                         |     4315 |   1894 |
| Najwięcej kontaktów jednego piłkarza        |      598 |    270 |
| Największy dystans zawodnika z pola, km     |    19,46 |   11,5 |
| Najwięcej epizodów sprintu jednego piłkarza |     1034 |     81 |
| Istotne wybory człowieka                    |       58 |     18 |
| Strzały / celne / bramki                    |   13/5/3 |  9/4/2 |

Bazowy PR147 kontynuował grę mimo mniej niż siedmiu aktywnych zawodników;
to pomiar istniejącej patologii, nie prawidłowo rozegranego meczu. Dwa bazowe
scenariusze agresywne zakończyły się błędem muru po wykluczeniach; raport zachowuje
ich seed i błąd, a nie imputuje statystyk. Wszystkie sześć końcowych scenariuszy
45-minutowych zakończyło się prawidłowo:

| Scenariusz / seed       | Rzeczywiste minuty | Faule/Ż/Cz | Podania | Kontakty | Decyzje |
| ----------------------- | -----------------: | ---------: | ------: | -------: | ------: |
| balanced-balanced, a    |              45,15 |     10/3/0 |     386 |      944 |      10 |
| balanced-balanced, b    |                 45 |     10/4/0 |     387 |      958 |       9 |
| weak-strong, a          |                 45 |      2/0/0 |     434 |     1024 |       1 |
| weak-strong, b          |                 45 |      1/1/0 |     435 |     1001 |       2 |
| aggressive-defenders, a |              45,02 |     15/9/2 |     384 |      995 |      11 |
| aggressive-defenders, b |              45,01 |     12/7/1 |     390 |      952 |       2 |

W drugim zwykłym meczu pełnych 90 minut: 15 fauli,
6 żółtych, 0 czerwonych,
780 podań i 1948 kontaktów.
Skala fauli pozostaje zmienna: dominacja silnego zespołu może dawać znacznie mniej
kontaktów i fauli, a fixture aggression=95/composure=35 jest testem stresowym.
Nie wymusza się pożądanych wyników kartkowych.

| Rola / seed, rzeczywiste 90 minut | Wszystkie wybory | Z piłką | Przed przyjęciem | Obrona |
| --------------------------------- | ---------------: | ------: | ---------------: | -----: |
| central_midfielder, a             |               18 |      12 |                0 |      6 |
| central_midfielder, b             |               18 |      12 |                0 |      6 |
| left_back, a                      |               16 |      10 |                5 |      1 |
| striker, a                        |               33 |      28 |                5 |      0 |

Liczby dotyczą rzeczywistych wyborów DEV, także ponownego wyboru po zmianie
sytuacji lub dojściu do waypointu prowadzenia; nie są przeliczane na „epizody”, aby
sztucznie obniżyć częstotliwość. Napastnik może mieć więcej wyborów przy rzeczywistych
minięciach rywala i wykańczaniu. Jednolite 15–20 dla każdej pozycji nie jest limitem
silnika; docelowy rytm zależy od udziału w grze. Zmiana polityki obserwacji nie zmienia
prawa do decyzji ani kanonicznego wyniku.

Trzy izolowane, seryjne pomiary `normal`, 10 minut, identyczny seed/config:
mediana pracy 10,9 → 9,9 s,
zmiana -9,14%. Pełny izolowany mecz 90 minut:
95,51 s pracy. Każda seria powtórzeń ma identyczne pełne
hashe kanoniczne; renderer background = 0. Czasy kalibracji równoległej nie służą
do porównania wydajności.

Pełne `npm run verify` na końcowym kodzie przeszło: ESLint, 836 testów głównych,
5 testów pełnego cyklu kariery i produkcyjny TypeScript/Vite build. Testy zachowują
niezależność A–D/batch/profiler, seeded RNG i całościowe hashe telemetrii z niezmienionymi
seedami oraz 2400 tickami. `git diff --check` i końcowy przegląd zakresu są czyste.

CI używa dwóch workerów, tak jak zakończona weryfikacja lokalna. Testy zgodności
batch/profiler i capture on/off mają limit 30 sekund, a cztery kompletne symulacje
A–D z capture/export — 60 sekund. Współdzielony runner przekroczył wcześniej
odpowiednio domyślne 5 sekund i limit 30 sekund. Liczba ticków, seedy, konfiguracje
i wszystkie asercje zgodności pozostają zachowane. Ocena regresji wydajności opiera
się na izolowanych pomiarach powyżej.

## Weryfikacja i ograniczenia

Scenariusze obejmują granicę 7→6 obu stron, drugą żółtą i bezpośrednią czerwoną,
całkowite usunięcie i zamrożenie historii, booked AI i bezpieczną autonomię człowieka,
epizod pary i natychmiastową interwencję innego obrońcy, jakość dryblingu przeciw dwóm
obrońcom, faule/korzyść/recall/rzuty karne, kontakty, sprinty, jawne carry,
sprawczość niezależną od obserwacji, terminalne UI oraz deterministyczny eksport.

Próbka kilku seedów jest kalibracją skali, nie empirycznym modelem całej ligi.
Testy scenariuszowe zapewniają pokrycie rzadkich czerwonych, karnego i korzyści;
benchmark nie wymusza ich dla uzyskania liczb. Headless throughput nie obejmuje
Reacta, czasu decyzji człowieka i planowania przeglądarki. Cel 4–6 minut z decyzjami
wymaga osobnego interaktywnego playtestu. Pełne stamina, pogoda/nawierzchnia,
osobowości sędziów, tunel/ławka i kalibracja sezonów pozostają na roadmapie.

NEXT: **PR149 — Animation, Replay & Match Presentation v2** zgodnie z
[ROADMAP.md](ROADMAP.md), z zachowaniem kanonicznych zdarzeń i snapshotów.
