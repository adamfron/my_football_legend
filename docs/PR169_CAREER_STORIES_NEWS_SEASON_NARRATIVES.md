# PR169 — Career Stories, News, Match Narratives & Career History

Baza: scalony PR168, `19cb7af`. Zakres obejmuje historię i prezentację kariery,
ocenę z istniejących statystyk, retencję udziału oraz granice sezonu i kontraktu.
Pomiary i ograniczenia są jawne w sekcji dowodów. Pełna weryfikacja jest
w toku; PR pozostaje draftem do uzyskania PASS.

## Audyt i wykorzystana architektura

Przejrzano `PROJECT_STATE`, `ROADMAP`, raporty PR166–PR168 oraz narrację,
feedback, kalendarz, księgę udziału, archiwum, kontrakt meczu, retencję,
kamienie milowe, kontrakty, cykl sezonu i ekrany kariery.

Istniały już `HistoryFact` (ID, data, sezon, osoby, kluby, rozgrywki, przyczyny,
znaczenie), `StoryThread` (odniesienia do faktów), `CareerMemory` (liczniki
przycinanych zdarzeń), `SeasonParticipationRecord` (jeden rekord na fixture)
i `CompletedSeasonSnapshot` (jedyne archiwum indywidualnych meczów).
`narrativeVariants` używa osobnego RNG prezentacji; lokalizacja i audyt jakości
również już istniały. `careerMatchContract` waliduje i rozlicza jeden wynik;
`careerMatchRetention` zachowuje trzy bogate wyniki aktywnego sezonu oraz
trwałe kompaktowe receipts. Zapis v7 i kolejka transakcji pozostają właścicielem
utrwalenia, migracji i ochrony przed podwójnym rozliczeniem.

Brakowało oceny kanonicznego występu, trwałych nazw/czasów własnych zmian,
użytecznej prezentacji dawnych klubów, zwartej historii i wiadomości. Część
debiutów/G/A opierała się na czyszczonej co sezon `matchHistory`. Fakty końca
sezonu otrzymywały rok kalendarzowy daty czerwcowej. Osiągnięcia powstawały
po transferze, kiedy `seasonOutcome` poprzedniego klubu było już usunięte.

Nie dodano równoległej bazy kariery. Fakty i archiwa → czyste interpretacje →
wiadomości, historia, podsumowanie i szczegóły występu. Interpretacje nie są
utrwalane jako kolejne kopie artykułów. Zmiany prezentacji nie zużywają RNG
futbolu i nie wchodzą do ticka fizycznego meczu.

## Rodziny historii i kontrakty prezentacji

- Debiut młodzieżowy/seniorski, pierwszy start, pierwszy gol/asysta, style gry,
  istotne progi występów/startów/G/A/czystych kont i jubileusze 5/10/15/20/25 sezonów.
- Pierwsza umowa, transfer z dawnym i nowym klubem/poziomem, odnowienie,
  przyjęcie zmienionych warunków i odrzucone negocjacje.
- Zmiany trenera, faktyczny udział, awans, spadek, mistrzostwo i zwycięstwo
  niższej ligi. Nie obiecuje się gry wyłącznie na podstawie kontraktowej roli.
- Istotne urazy i potwierdzony koniec niedostępności, bez dramatyzowania
  lekkich urazów. Powtarzające się urazy wymagają odrębnych zapisanych zdarzeń.
- Wątki serii pięciu ocenionych występów, regularnych startów, gry na innych
  pozycjach, ciągłości klubu, weterana, kilku mistrzostw i większej liczby minut
  po transferze. Każdy wątek ma `sourceIds` faktów, fixture lub snapshotów.
- Retrospekcja kariery wykorzystuje pierwszy/ostatni klub, sezony, statystyki,
  najwyższy OVR, zapisane pozycje, transfery, urazy i rzeczywiste mistrzostwa.
  Uwzględnia również ostatni jeszcze nieprzeniesiony do archiwum sezon.

Tekst „po zmianie klubu liczba minut wzrosła” opisuje kolejność, bez dopisywania
przyczyny. Nie tworzy się fikcyjnych przyjaźni, rywalizacji ani cytatów trenera.
Wątki formy dotyczą ostatnich **ocenionych** meczów; brakujących ocen nie
zastępuje się zerem. Nie nadaje się etykiety wybitnego talentu z profilu kreatora.

## Wiadomości i język

`buildCareerNews` wybiera znaczące zachowane fakty. Zwykły mecz nie jest
artykułem; pełny kanoniczny występ może się wyróżnić oceną ≥9, trzema golami
lub ośmioma obronami. Hybrydowa końcówka nie spełnia tego pełnomeczowego filtra.
Wiadomości mają datę, nagłówek, kategorię, opis, klub i ID źródłowego faktu.
Otwierają się natywnie, bez rozliczania zdarzenia.

Domyślnie projekcja pokazuje 24 wiadomości, najwyżej 60 na żądanie. Nie zapisuje
się tekstów. Semantyczna deduplikacja pierwszych osiągnięć oraz osiągnięć sezonu
poprzedza wybór. Istniejący `selectNarrativeVariant` i polski słownik wybierają
wariant niezależnie od RNG gry; kolejne zdarzenie tego samego rodzaju nie
powtarza poprzedniego wariantu nagłówka. Kolejność jest odtwarzana z pełnej
chronologii, a dopiero potem ograniczana. Reload daje ten sam wynik.

Nieznane techniczne typy nie są przekształcane w snake_case opisy. Normalna
historia pomija techniczne zdarzenia niskiej wagi. Nieznanych osób nie zastępuje
się wymyślonymi nazwiskami ani surowymi ID. Tożsamość klubu pochodzi najpierw
z zachowanego faktu/snapshotu, następnie danych świata; obecny klub może być
użyty wyłącznie przy zgodnym ID. Transfery utrwalają nazwy i poziomy obu stron.

## Ocena kanonicznego występu v1

Czysta funkcja `evaluateCanonicalRating`, schemat Zod, skala **3,0–10,0**,
jedna cyfra po przecinku. Baza 6,0; dodatki i kary są jawnie rozpisane w `terms`.
Nie używa wyniku zespołu, reputacji, obietnicy składu ani losowania.

| Składnik | Polityka |
| --- | --- |
| Podania | +0,006 za ukończone, łącznie najwyżej +0,35; niecelne −0,035, kara do −0,8 |
| Gole/asysty | Gol +1,0 na pozycji atakującej, +1,2 na pozostałych; asysta +0,7; razem do +3,5 |
| Strzały | Celny +0,12 (do +0,5), niecelny −0,035 (do −0,4); pomijane u GK |
| Obrona | Odbiór +0,19, przechwyt +0,17, zachowany blok +0,13; obrońcy/DM ×1,25, razem do +2,2 |
| Bramkarz | Obrona +0,32 (do +2,6), stracony gol −0,3 (do −1,8) |
| Straty/kartki | Zachowana strata −0,04 (do −0,75), żółta −0,18, czerwona −1,4 |
| Krótki udział | Wpływ ponad bazę ×min(1, minuty/60); poniżej 10 min brak oceny |

Duża liczba bezpiecznych podań sama nie daje wyjątkowej oceny. DM i obrońca
mogą uzyskać wysoką ocenę przez działania defensywne; GK przez obrony. Model
nie zna trudności każdej obrony ani jakości wszystkich podań — nie udaje,
że te cechy są zmierzone. Nie ocenia intencji decyzji na podstawie powodzenia.
To wyjaśnialna heurystyka PR169, nie empiryczna kalibracja rzeczywistego futbolu.

Pełny mecz → ocena z zapisanych liczników. Mecz lekki → dotychczasowy model.
`canonical_plus_summary` → **brak oceny**, z przyczyną „brak pełnych akcji
indywidualnych”. Nawet długi prefiks nie jest ekstrapolowany do 90 minut.
Przerwany mecz i brak danych również mają jawny stan niedostępności.

Ocena i wersja/źródło trafiają do udziału, projekcji `matchHistory`, kompaktowego
receiptu i snapshotu; to zasila oś sezonu, średnie, koniec sezonu i archiwum.
Nie dopisuje się osobnej aktualizacji zaufania/selektorów. Dotychczasowy
`applyAppearanceConsequences` nadal wykonuje konsekwencje występu raz.
Nie zmieniono krzywych rozwoju. Starych ocen nie dopisuje się retrospektywnie;
brak pełnego zachowanego dowodu nadal oznacza brak oceny.

## Udział, retencja i statystyki

Opcjonalne `participationEvidence` zachowuje najwyżej dwie własne zmiany
(wejście/zejście): oba ID i znane nazwiska, `requestedAt`, `leftAt`, `enteredAt`
w sekundach, wyłącznie jawny powód `injury/fatigue/tactical`. Dwie zmiany
odpowiadają karierze bez zmian powrotnych. `leftAt` wyznacza wyjście, `enteredAt`
wejście; żądanie nie jest wykonaniem. Wyświetlane minuty są zaokrąglane w górę,
oryginalny czas pozostaje dokładny.

Rekord może też zachować mały opis urazu i zagregowane rozstrzygnięte decyzje
człowieka. Nie zawiera fizycznego stanu, trajektorii ani nieograniczonego replay.
Receipt zachowuje również ukończone zmiany zespołów, najwyżej dziesięć.
Archiwum przenosi własne evidence, źródło oceny, status udziału i dokładne minuty.
Stary zapis bez tych pól ma neutralny ograniczony opis. Nie wnioskuje się powodu
zmiany z oceny, minuty ani samej kartki.

Szczegóły są komponentem tylko do odczytu, bez importu runnera lub callbacku
rozliczenia. Pokazują rolę, minuty, ocenę/jej brak, dane akcji, zmiany, kartki
i uraz. Hybryda jawnie ogranicza dane akcji do prefiksu. Feedback statystyczny
jest oddzielony od faktycznych decyzji; nie przedstawia się go jako wypowiedzi
trenera. Zmiana trenera ma mały znacznik na kaflu klubu i szczegóły w klubie.

Bieżące statystyki pochodzą z księgi. Cała kariera sumuje unikalne snapshoty
i bieżący sezon tylko wtedy, gdy nie jest już zarchiwizowany. Karta zaznacza
włączenie akademii. Czyste konto GK wymaga dowodu występu i straconych bramek;
kanonicznie co najmniej 60 minut i kompletnego meczu. Hybrydy nie dostają
czystego konta na podstawie wyniku drużyny. Model reprezentacji ma
`available:false`, a UI pokazuje niedostępność modułu.

## Mistrzostwa, duplikaty i kontrakty — ustalone przyczyny

Mistrzostwo brakowało z trzech związanych powodów: fakt tworzono dopiero na
przejściu roku; helper ustawiał sezon z roku daty czerwcowej; transfer usuwał
`seasonOutcome` przed tym przejściem. `getSeasonHonours` szukał następnie faktu
we wcześniejszym sezonie. Ostatni sezon przy emeryturze też omijał ten zapis.

`recordSeasonAchievements` zapisuje własność bieżącego ukończonego sezonu
przy inicjalizacji okna, przed transferem/przejściem/emeryturą. Klucz zawiera
sezon, klub i rodzaj. Pierwsze miejsce na poziomie 1 daje mistrzostwo;
niżej jest osobny zwycięzca ligi, a awans pozostaje osobnym zdarzeniem.
Tożsamość kontrolowanego klubu musi być zgodna. Snapshot z wcześniej zapisanym
wynikiem `champion` i poziomem 1 może bezpiecznie wyświetlić stare mistrzostwo
bez dopisywania nowego faktu. Zestaw etykiet honours usuwa duplikaty.

Pierwsze osiągnięcia sprawdzają fakty, pamięć i archiwa, zamiast tylko sezonowej
listy meczów. Dawne powtórzenia pozostają dowodem w starym pliku, ale UI
prezentuje najwcześniejsze zdarzenie semantyczne. Nowe progi powstają wyłącznie
przy rzeczywistym przekroczeniu, bez fałszywego datowania zaległych progów.

Nie otrzymano oryginalnego zapisu użytkownika z wieku około 36 lat. Nie
odtworzono uniwersalnej blokady wieku: prawidłowe odnowienia w wieku 25 i 36
działają. Odtworzono konkretną wadliwą ścieżkę: negocjacja w trakcie sezonu
przechowywała start **starej umowy**, ekran końca sezonu nadal pokazywał
„Przyjmij”, a walidator letniego okna wymagał 1 lipca następnego sezonu.
Funkcja zwracała stan bez postępu; negocjowana ścieżka mogła ponadto zastąpić
oferty wadliwą propozycją. To potwierdzona przyczyna tej klasy cichego braku
postępu, nie dowód identyczności z niedostępnym zapisem użytkownika.

Granica okna usuwa stare propozycje płacowe, pozwalając negocjować aktualne
odnowienie. Walidacja sprawdza zachowaną ofertę, klub, datę startu i okres.
Nie omija się kontroli dat. UI raportuje odrzucenie i brak postępu, blokuje
powtórne kliknięcia, czeka na commit. Błąd zapisu zachowuje poprzedni stan;
retry odtwarza tę samą decyzję, archiwum i bonus. Prawidłowa oferta zostaje
przyjęta bez ponownego losowania zgody klubu.

## Interfejs i dowody przeglądarkowe

Historia ma zwarte rozwijane wiersze: data, wydarzenie, historyczny klub, opis.
Filtry: najważniejsze, wszystkie, mecze/osiągnięcia, transfery/kontrakty,
kontuzje/rozwój; osobny selektor sezonu. Wnętrza archiwalnych sezonów są
montowane po rozwinięciu, zamiast tworzyć od razu kilkaset szczegółów meczów.
Naprawiono też zasłanianie historii przez decyzję końca sezonu i zawijanie
przycisków nagłówka. Kontrolki mają jawne etykiety i jasny styl gry.

Przegląd wykonano na rzeczywistym headless Edge przez HTTP z produkcyjnym
buildem, na desktopie i przy szerokości 390 px. Użyto deterministycznych
zapisów testowych, w tym autentycznej kariery 25 sezonów. Kontrolny wiek 36
jest jawnym fixture regresji, nie oryginalnym zapisem użytkownika.

Galeria: [historia przed](images/PR169-history-before.png),
[historia po](images/PR169-history-after.png),
[telefon](images/PR169-history-mobile.png), [wiadomości](images/PR169-news.png),
[koniec sezonu](images/PR169-season-summary.png),
[emerytura](images/PR169-retirement.png).

## Weryfikacja i pomiary

### Powtarzalność i długa kariera

`scripts/benchmarkPr169.mjs` / `measurePr169.ts` przeprowadzają 25 rzeczywistych
rutynowych sezonów z tym samym seedem `pr169-long-career`, zmianami świata
i transferami. Nie wymuszają osiągnięć ani rozwoju. Porównano z niezmienionym
PR168. Wszystkie zapisane w pomiarze wiersze sportowe (kluby, OVR, wyniki,
występy) są identyczne. 24 snapshoty i niezarchiwizowany sezon dają 626 występów,
492 starty, 42 583 minuty, 251 goli, 154 asysty i cztery mistrzostwa najwyższej ligi.
To wynik lekkiego modelu kariery; nie świadczy o realizmie rozkładów akcji 3D.

| Pomiar | PR168 | PR169 |
| --- | ---: | ---: |
| Zapis po dwóch sezonach | 454 615 B | 456 210 B |
| Zapis po 25 sezonach | 1 414 514 B | 1 414 048 B |
| Zachowane fakty po 25 sezonach | 248 | 203 |
| Czas całej symulacji, pojedynczy przebieg | 35 501 ms | 34 486 ms |
| Otwarcie historii w Edge, pojedynczy przebieg | 48 ms | 49 ms |
| Widoczne wpisy początkowej historii | 98 | 53 |

Zmiana długiego zapisu wynosi −466 B (−0,033%); krótkiego +1595 B.
Usunięcie powielanych nowych faktów kompensuje dodane pola. Pojedyncze czasy
nie stanowią kontrolowanego dowodu przyspieszenia. Wiadomości są ograniczone
do 24, wnętrza sezonów są leniwe, a otwarcie historii nie ładuje runtime 3D.

100 powtórzeń czystych projekcji news/stories/statistics/distinct facts oraz
prezentacji wszystkich faktów: mediana **8,61 ms**, p95 **13,95 ms**, maksimum
**18,57 ms**, 203 fakty. Pomiar nie obejmuje Reacta ani renderowania.
Panel przy viewport 390 px ma 338,59 px. Filtry klawiaturowe i rozwijanie
archiwalnego występu zachowują zapis bez zmian.

Źródła: [porównanie](performance/PR169-comparison.json),
[PR168](performance/PR169-before.json), [PR169](performance/PR169-after.json),
[projekcje](performance/PR169-projections.json), [Edge](performance/PR169-browser.json).

### Rzeczywista hybryda w interfejsie 3D

Ścieżka Edge od kreatora, przez prawdziwy fixture U-17 i trzy rozstrzygnięte
decyzje, do „Symuluj do końca” oraz zapisu/reloadu i kolejnego fixture.
Nie wstrzykiwano stanu meczu. Prefiks: 392,175 s, końcowy udział: 90 min,
źródło `canonical_plus_summary`, ocena nieobecna z `partial_actions`.
90 minut nie zamienia liczników akcji prefiksu w kompletne statystyki meczu.
Receipt wyniku: 44 600 B; cały zapis: 104 603 B; roundtrip zgodny; brak błędów
strony/konsoli. [Receipt](performance/PR169-hybrid-browser.json),
[wybór fixture](images/PR169-hybrid-youth-play-remainder-prematch.png),
[potwierdzenie końcówki](images/PR169-hybrid-remainder-confirmation.png).

### Testy i znane ograniczenie lokalnego środowiska

Regresje obejmują model ocen, archiwum/retencję, progi i tytuły, deterministyczne
wiadomości, zgodność dawnych zapisów, odnowienia 25/36, daty ofert, brak mutacji
przy odrzuceniu, podwójne kliknięcia, błąd zapisu i retry. Testy przeglądarkowe
używają produkcyjnego buildu, realnego Edge i HTTP; fixture wieku 36 jest
kontrolną regresją, nie niedostępnym oryginalnym zapisem użytkownika.

Pełne lokalne próby ujawniły graniczny limit istniejącego testu PR149 (5 s).
Ten sam test przekroczył limit również na **niezmienionym PR168** (5,308 s).
Kontrolny przebieg z większą młodą generacją sterty Node
(`NODE_OPTIONS=--max-semi-space-size=64`) zachował `maxWorkers=2`, wszystkie
asercje i limity: 24 testy PR149/careerWeeks PASS, najdłuższy 4,584 s.
Nie zmieniono konfiguracji testów ani istniejącego CI. Pełny `npm run verify`
z tym ustawieniem jest w toku; końcowy rezultat zostanie dopisany przed
oznaczeniem PR jako gotowego.

## Odpowiedzi akceptacyjne

| # | Odpowiedź |
| --- | --- |
| 1 | Fakty, wątki/pamięć, warianty/lokalizacja, księga, snapshoty, receipts i kolejka zapisu. |
| 2 | Tak: fakty mają ID, wątki `sourceIds`; komentarz nie dodaje nieobserwowanej przyczyny. |
| 3 | Tak: wielosezonowe snapshoty i trwałe istotne fakty. |
| 4 | Tak: retained names i ID, snapshoty/świat; brak danych nie zamienia się w obecny klub. |
| 5 | Pierwsze debiuty/G/A i progi mają ochronę; stare duplikaty filtruje projekcja. |
| 6 | Tak: deterministyczny selektor, rotacja powtarzanego wariantu, 24 artykuły bez zapisu tekstów. |
| 7 | Baza 6,0, ograniczone składniki akcji, ekspozycja minutowa i skala 3–10. |
| 8 | Tak: GK, defensywa/DM i ofensywa mają inne składniki/wagi. |
| 9 | Tak: ta sama ocena w księdze, osi, szczegółach, średnich i archiwum. |
| 10 | Brak oceny z jawną przyczyną; brak ekstrapolacji akcji końcówki. |
| 11 | Tak: dokładne sekundy, oba ID i dostępne historyczne nazwiska. |
| 12 | Tylko rzeczywisty powód strukturalnej zmiany; brak danych daje opis neutralny. |
| 13 | Tak: evidence w księdze/snapshotach i zmiany w kompaktowym receipcie. |
| 14 | Tak: zwarte wiersze, wewnętrzny scroll i układ 390 px. |
| 15 | Tak: pięć filtrów i wybór sezonu. |
| 16 | Księga teraz, unikalne snapshoty plus niezarchiwizowany sezon; akademia jest oznaczona. |
| 17 | Tak: `available:false` i widoczna informacja o niedostępności. |
| 18 | Tak: ukończony najwyższy poziom/1. miejsce, właściwy klub, oryginalny sezon. |
| 19 | Tak: tożsamość sezon/klub/rodzaj rozróżnia kolejne tytuły; honours deduplikuje etykiety. |
| 20 | Odtworzono starą datę propozycji płacowej na granicy okna i cichy brak postępu; dokładny zapis użytkownika niedostępny. |
| 21 | Tak: walidowane odnowienie, pojedynczy commit i dalszy fixture; test wieku 25/36. |
| 22 | Tak: widoczny błąd i brak mutacji, również po błędzie zapisu. |
| 23 | Tak: znacznik na kaflu klubu, szczegóły w panelu klubu. |
| 24 | Projekcje nie zmieniają wejścia/RNG; fizyka i pełny powtarzalny mecz pozostają kanoniczne. |
| 25 | Konkretne bajty i czasy są w pomiarach poniżej, z rozdzieleniem ścieżki lekkiej i kanonicznej. |
| 26 | Tak dla zmierzonej kariery 25 sezonów; browser i czasy projekcji są jawne. |
| 27 | PR170 oprawa/UI, PR171 diagnostyka, PR172 kalibracja, PR173 pokolenia, PR174 lekka symulacja/style, PR175+ świat. |

## Granice i dalszy plan

Brak trudności każdej akcji, pełnych akcji końcówki hybrydy i bezpiecznej
rekonstrukcji wszystkich starych ocen pozostaje jawny. Nowe interpretacje nie
tworzą relacji osobistych, reprezentacji ani pucharów. Nie przeprowadzono
globalnej kalibracji statystyk silnika lub rozwoju. Rozkłady lekkich G/A,
liczby podań/strzałów/rożnych i długofalowa siła świata pozostają w kolejnych
etapach, zgodnie z autorytatywną roadmapą PR170–PR175+.
