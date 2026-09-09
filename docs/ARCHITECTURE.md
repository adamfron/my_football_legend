# Architektura

## Osiągalna przestrzeń, obserwacja i legalność akcji

Szczegółowy silnik składa decyzję w jednym kierunku: **formacja → kontekst zespołu → relacje ról
i intencje ruchu → krótkoterminowa predykcja osiągalnej przestrzeni → obserwacja podającego oraz
obrońcy → wybór akcji → kanoniczny ruch i fizyka piłki**. Wspólna czysta predykcja opisuje tylko
kilka najbliższych próbek ruchu ograniczonego tempem i przyspieszeniem. Nie zużywa RNG, nie mutuje
stanu i nie jest trasą, teletransportem ani drugim przebiegiem symulacji.

Podanie w przestrzeń zachowuje osobno zamierzonego biegacza i fizyczny cel piłki. Ten identyfikator
jest diagnostyką intencji, nie prawem do posiadania: kontakt nadal rozstrzyga wspólny wyścig w core.
Migawka spalonego powstaje przy zagraniu, łączy piłkę z przedostatnim rywalem i pozostaje niezmienna
w czasie lotu. Samo przebywanie na pozycji spalonej nie przerywa gry; przewinienie wymaga udziału,
a wyłączenia dla wznowień oraz różnica między świadomym zagraniem i odbiciem pozostają jawne w
kanonicznym modelu.

## DEV Match Debug Capture

## Kanoniczny Match Situation Evaluator

`matchSituationEvaluator` jest czystą, deterministyczną obserwacją bieżącego stanu
`matchSimulation`. Współdzieli ocenę okazji strzeleckiej z użytecznością akcji NPC, nie mutuje
stanu, nie zużywa RNG i nie jest drugim silnikiem zdarzeń ani mechanizmem decyzji gracza.

Eksport diagnostyczny Single Match Lab jest wyłącznie warstwą prezentacji i obserwowalności.
Utrzymuje ograniczony bufor pełnych migawek diagnostycznych z ostatnich dziesięciu sekund czasu
kanonicznego, a po ręcznym triggerze zbiera kolejne dziesięć sekund. Statyczny słownik zawodników
jest zapisany raz, natomiast klatki zawierają dynamiczne pozycje, piłkę, akcje, fazy i restarty.
Lista zdarzeń jest tylko projekcją zmian kolejnych migawek, a nie drugim silnikiem zdarzeń.

Przepływ danych ma jeden kierunek:

**canonical match core ↓ diagnostic snapshots ↓ DEV JSON trace**

Równoległy, niezależny przepływ obrazu wygląda tak:

**TacticalPitchRenderer canvas ↓ ograniczony pre-buffer klatek ↓ WebM**

Rejestrator uruchamia się automatycznie i przechwytuje wyłącznie jawnie udostępniony canvas boiska,
bez uprawnień do nagrywania karty lub ekranu. Brak przeglądarkowych API wideo nie wpływa na JSON ani
działanie meczu. Kodowanie ukończonego okna nie zatrzymuje ciągłego pre-buffera następnego zapisu.
Klatki obrazu otrzymują czas kanoniczny w chwili obserwacji. Do eksportu wybierane jest okno
`trigger − 10 s … trigger + 10 s`, a odtworzenie WebM używa różnic czasu kanonicznego, nie zegara
ściennego. Dzięki temu tempo 1×/2×/4× nie rozszerza pre-rollu na niepowiązaną historię meczu.
Synchronizacja pozostaje próbkowana częstotliwością renderera/rejestratora, więc nie jest
gwarantowana klatka dokładnie na granicy okna; JSON pozostaje autorytatywnym śladem ticków.

Gotowy pakiet pozostaje w pamięci do jawnej akcji „Zapisz pakiet…”. File System Access API jest
wywoływane w trybie `readwrite`; anulowanie wyboru nie usuwa pakietu. Gdy API nie istnieje,
uruchamiane są pobrania przeglądarki, a brak WebM nadal pozwala zapisać kompletny trace JSON.
Warstwa debug nie zapisuje się w karierze, nie dostarcza danych rendererowi i nie ma żadnej strzałki
zwrotnej do core: nie zmienia RNG, kroku, kolejności ticków, tempa ani wyniku sportowego.

## Granica silników meczu

`src/core/matchSimulation/*` jest kanonicznym, rozwijanym silnikiem szczegółowej symulacji meczu.
Renderer, replay i diagnostyka wyłącznie obserwują jego stan. `src/core/matchEngine.ts` obsługuje
przejściowy karierowy `MatchGame`; nie jest alternatywnym miejscem dla nowych mechanik futbolowych.
Przyszły Situation Evaluator i decyzje gracza muszą rozwijać pipeline `matchSimulation`, bez
rozbudowywania legacy ani przedwczesnej migracji przepływu kariery.

## Równowaga pozycyjna w symulacji meczu

### Pętla interakcji meczowej

Równowagę pozycyjną uzupełnia efemeryczne pole interakcji: zawodnicy atakujący szukają
przestrzeni, a broniący otrzymują przeliczane na bieżąco role nacisku, asekuracji i ekranowania.
Kanoniczna ocena presji uwzględnia odległość, domykanie, liczbę rywali oraz istniejące atrybuty obu
stron. Zasila ona decyzje o podaniu, prowadzeniu i strzale, a także deterministyczne rozstrzygnięcie
odbioru.

Podanie, prowadzenie i strzał są wspólnymi akcjami protagonisty i NPC. Rozstrzygnięcia obejmują
przechwyt w locie, czysty odbiór, piłkę bez właściciela, jej opóźnione przejęcie oraz wynik strzału:
gol, obrona, blok albo pudło. Zmiana posiadania atomowo zmienia fazy zespołów, gol aktualizuje
efemeryczny wynik, a kontynuacja korzysta z kanonicznego wznowienia. Wyznaczony wykonawca może w
fazie przygotowania wybrać specjalizowaną akcję wznowienia, lecz wykonuje ją tymi samymi
prymitywami lotu piłki i strzału co gra otwarta.

### Kanoniczny strzał i obrona bramkarza

Symulacja meczu wykonuje stały krok **0,025 s (40 Hz)**. Czas kanoniczny i akumulator prezentacji
są rozdzielone, dlatego FPS przeglądarki oraz tempo 1×/2×/4× zmieniają wyłącznie liczbę wykonanych
kroków, a nie ich kolejność ani deterministyczny wynik.

Pętla próby bramkowej ma jeden przebieg: **intencja umiejscowienia → błąd wykonania → lot piłki
→ lokalna próba bloku → interwencja bramkarza → bramka, obramowanie albo pudło → odbitka lub
wznowienie**. Znormalizowany cel w świetle bramki zostaje przeliczony na rzeczywisty punkt i
wysokość przecięcia płaszczyzny bramkowej. Rozrzut zależy płynnie od techniki, wykończenia (albo
gry głową), opanowania, presji, odległości i kąta; nie istnieje próg gwarantujący celność.

Lot strzału korzysta z tego samego kanonicznego czasu, celu, wysokości i prędkości piłki co inne
podróże. Blok wymaga przecięcia wąskiego korytarza i osiągalnego czasu, a model bramkarza zestawia
czas reakcji i ruch do punktu przecięcia ze szybkością oraz umiejscowieniem, bez porównywania OVR.
Złapanie daje posiadanie; parowanie, blok, słupek i poprzeczka nadają piłce skończoną prędkość i
wracają do wspólnego systemu loose ball oraz priorytetów drugiej piłki. Główka na bramkę zachowuje
własne modyfikatory kontaktu powietrznego, ale od intencji celu przechodzi dokładnie przez ten sam
resolver strzału. Renderer i diagnostyka DEV wyłącznie odczytują wynik core.

Po wygenerowaniu intencji, błędu, prędkości i lekkiej parametrycznej wysokości każdy odcinek lotu
przechodzi ciągłe wykrywanie pierwszego kontaktu w metrach boiska. Wspólna geometria core definiuje
płaszczyznę linii końcowej, wewnętrzne krawędzie słupków, poprzeczkę i promień piłki. Najwcześniejsze
przecięcie wygrywa: obrońca przed bramkarzem, bramkarz przed linią albo obramowanie przed bramką.
Dopiero ten kontakt ustanawia wynik sportowy; tekstowa prognoza strzału nie może go ustanowić.
Po golu krótki stan ukończenia pozwala piłce wpaść do bramki przed ustawieniem środka, bez cofania
czasu meczu. Renderer i powtórka są projekcjami zapisanych pozycji kanonicznych i nigdy nie wykonują
własnej korekty kolizji.

Każdy zawodnik, niezależnie od tego, czy jest sterowany przez gracza, korzysta z tego samego
kompozycyjnego modelu celu: **neutralna struktura formacji + deformacja bloku drużyny + lokalna,
ważona odległością reakcja na piłkę + zachowanie taktyczne + indywidualna swoboda/błąd +
ograniczenia = idealny cel taktyczny**. Dane formacji opisują względny kształt; osobna transformacja
meczowa umieszcza spoczynkowy blok na własnej połowie bez zmiany semantyki ogólnych współrzędnych.

Idealny cel przechodzi przez deterministyczny, płynnie zmienny błąd pozycjonowania i opóźnienie
percepcji zależne od czytania gry oraz koncentracji, tworząc aktywny cel. Dopiero integracja
prędkości, tempa i zwinności przesuwa fizycznego zawodnika. Linia spalonego ogranicza cel, nigdy
rzeczywistą pozycję. Bramkarz ma konserwatywny wariant projekcji, odłączony od pressingu i szukania
przestrzeni. Ten stan jest efemeryczny i nie trafia do zapisu kariery; renderer jedynie go prezentuje.

### Intencja ataku i scenariusze DEV

Czysta, symetryczna funkcja wartości pola premiuje zdobyty teren oraz centralne strefy trzeciej
tercji, ale pozostaje tylko jednym składnikiem oceny ryzyka i korzyści. Kanoniczny zbiór akcji,
wspólny dla NPC i przyszłego menu gracza, rozróżnia podanie do aktualnej pozycji zawodnika od
podania w przestrzeń przed biegnącym odbiorcą. Ocenia długość, technikę, presję i prostą odległość
obrońców od linii podania; style zmieniają apetyt na bezpośredniość, a nie dostępność reguł.

Równowaga pozycyjna pozostaje kotwicą. Maksymalnie kilku deterministycznie wybranych zawodników
otrzymuje czasowy cel biegu w przód, a szeroki obrońca może tym samym mechanizmem wykonać pierwszy
ogólny overlap. Długie posiadanie przesuwa blok stopniowo: obrońców mniej, graczy ofensywnych
więcej, z zachowaniem ograniczenia celu linią spalonego. Single Match Lab posiada efemeryczne
presety wznowień służące kontroli geometrii, a nie implementacji pełnych przepisów.

### Geometria i cykl życia wznowień

Kanoniczna hierarchia meczu to **normalna równowaga pozycyjna → tymczasowa geometria wznowienia
→ wykonanie wznowienia → wygasający wpływ wznowienia → normalna równowaga gry otwartej**.
Wznowienie nie jest drugim silnikiem: deklaratywny zestaw celów taktycznych jest komponowany z
celami otwartej gry. W fazie przygotowania ma pełną wagę i pozostaje stabilny niezależnie od
upływu zegara. Pierwsza kanoniczna akcja zmieniająca stan piłki rozpoczyna czterosekundowe,
płynne wygaszanie, po którym struktura formacji ponownie staje się jedyną kotwicą.

Role wykonawcy, celów powietrznych i zabezpieczenia są efemerycznie wybierane z profilu zawodnika.
Strefy rożnych i dośrodkowań celowo mogą być bliskie lub wspólne; osobny, lekki etap separacji
chroni jedynie przed fizycznym nakładaniem modeli. Wszystkie warianty i lokalna nieregularność są
deterministyczne względem seedu. Renderer i React nie wyznaczają geometrii ani rozstrzygnięć.

## Kanoniczna pozycja i wiek

Graf `POSITION_COMPATIBILITY` jest jedyną definicją sąsiedztwa pozycji. Relacja zawodnik–pozycja
steruje normalną selekcją, ławką, konkurencją, pokryciem kadry i nauką z faktycznie rozegranych
minut. Bramkarz pozostaje nieprzekraczalną granicą specjalistyczną.

Aktualny wiek jest projekcją daty urodzenia na `currentDate`. Sezonowe przetwarzanie rozwoju może
pozostać roczne, lecz konsumuje wiek na danej dacie i nie ustanawia osobnego zegara wieku.

Podpisana `squadRole` jest historyczną obietnicą i nie mutuje wraz z hierarchią. Odnowienie tworzy
nową obietnicę z obecnej konkurencji; frustracja porównuje obietnicę ze sportową rzeczywistością.

## Jedna ekonomia piłkarza i kontraktu

`playerEconomy.ts` jest kanonicznym źródłem bazowej oczekiwanej pensji, informacyjnej wartości
rynkowej, opłaty transferowej oraz wag ról dla protagonisty i każdego rodzaju NPC. Funkcje przyjmują
profil piłkarza, klub, datę i kontekst zamiast całego `CareerState`. `createProfessionalContract()`
materializuje wynik negocjacji; deterministyczny szum należy wyłącznie do warstwy oferty. Gotowy
`Contract` jest historycznym faktem i nie jest żywą projekcją. Brak kontraktu może zerować opłatę
transferową, ale nie informacyjną wartość zawodnika.

Oferta odnowienia jest ostateczną decyzją klubu o gotowości do podpisania. Akceptacja sprawdza tylko
tożsamość i aktualność oferty, bez drugiej ukrytej oceny zainteresowania.

## Nawadnianie zapisu i trenerzy

Zapis kariery pozostaje rzadki: nie zawiera `clubWorld`, `footballerWorld` ani `youthCohorts`.
Kontynuacja najpierw waliduje zapis, następnie asynchronicznie ładuje właściwą wersję bazy świata
i dopiero przez `hydrateCareerWithWorld` udostępnia kompletny stan symulacji. Poprawność nie zależy
od pamięci podręcznej modułu, a błąd ładowania lub zapisu jest jawny w powłoce aplikacji.

`CoachProfile` jest kanonicznym, deterministycznym profilem roli powiązanym przez `personId` z
tożsamością `Person`. Preferowana formacja pochodzi wyłącznie z tego profilu. Przypisanie trenera
rozwiązuje najpierw `CareerWorldDelta.managerOverrides`, a potem bazowy `ProfessionalClub.managerId`.
Polityka/DNA klubu pozostają niezależne od osobistych cech trenera; ruch trenerów nie jest jeszcze
symulowany.

## Letni rynek NPC — ekonomia ograniczonego okna

Kanoniczna granica ukończonego sezonu uruchamia po graduacji, rozwoju i emeryturach pojedynczy,
idempotentny przebieg rynku, a dopiero potem nabór U-17. Przebieg buduje indeks członkostwa raz,
ogląda wyłącznie małe deterministyczne próbki kandydatów i zapisuje tylko zmienionych piłkarzy oraz
dotknięte kadry w `CareerWorldDelta`. Obsługuje wolnych seniorów i ograniczone ruchy między klubami;
nie obejmuje protagonisty, aktywnych juniorów ani emerytów. Czyste helpery wyprowadzają co sezon
pojemność finansową, budżet opłat, limit płac, żądanie płacowe i relatywną wartość zawodnika.
Robocza księga okna uwzględnia wydatki, część wpływów i zwolnione płace, lecz nie jest trwałym
kontem klubu. Sprzedający wykonuje jedną zaszumioną ocenę roli, głębi, kontraktu i ceny. W delcie
pozostają tylko zmienione kadry/zawodnicy, marker idempotencji oraz append-only
`npcTransferRecords`, nie budżety klubów.

## Player Model 2.0

`FOOTBALL_ARCHETYPES` jest jedynym rejestrem archetypów: określa ich dostępność, kształtuje
atrybuty przed normalizacją OVR i dostarcza prezentację profilu. Kreator pokazuje zawsze wszystkie
archetypy dopuszczone dla wybranej pozycji, w stabilnej kolejności rejestru.

Generowanie korzysta z jawnych dodatnich i ujemnych `generationBias`; kolejność atutów
prezentacyjnych nie wpływa na liczby. Archetyp redystrybuuje wspólny budżet talentu danej pozycji
i trudności, a normalizacja zachowuje kształt profilu zamiast premiować specjalizacje wyższym OVR.
Etykieta archetypu opisuje zawodnika, nie instrukcję taktyczną. Dlatego Regista jest jedynym
głębokim kreatorem, a odwrócony boczny obrońca trafi w przyszłości do warstwy ról trenera.

`ATTRIBUTE_PRESENTATION` jest kanonicznym źródłem polskich nazw, grup i kolejności wszystkich 25
atrybutów. Rozwój korzysta z tego samego przypisania atrybutu do rodziny oraz z pojemności właściwej
rodziny, zamiast wspólnego maksimum potencjału. Warstwa Play sprawdza domenowy blocker progresji
przed uruchomieniem odtwarzania; oczekiwanie na decyzję jest normalnym stanem, nie błędem runtime.

## Warstwa prezentacji kariery

### Tożsamość wizualna klubu

Klub jest właścicielem kanonicznej, deterministycznej `ClubVisualIdentity` z kolorem
podstawowym i dodatkowym. Para jest metadanymi prezentacyjnymi, niezależnymi od siły
sportowej, i może być później współdzielona przez UI, herby oraz stroje. React korzysta
z zapisanej tożsamości (z deterministycznym fallbackiem dla starszego zapisu), zamiast
wyliczać własny kolor z ID. Biel pozostaje bielą w danych; obrys i krawędź zapewniające
kontrast są wyłącznie zachowaniem CSS.

### Semantyka osi sezonu

Etykiety zdarzeń osi pochodzą z metadanych/treści definicji wydarzenia. Stan kariery
przechowuje identyfikator, a nie wyrenderowaną polską frazę. Brak specjalnej etykiety
korzysta z tytułu wydarzenia, nigdy z ogólnego statusu implementacyjnego.

Przy braku występu oś prezentuje kanoniczny `SeasonParticipationRecord.status`, dzięki
czemu rozróżnia między innymi kontuzję, zawieszenie, ławkę i brak powołania.

Wspólna czysta projekcja udziału w meczu zasila Oś sezonu i zwarte listy spotkań. Pozycja jest
wyświetlana wyłącznie z `assignedPosition`, a kartki pozostają danymi domenowymi renderowanymi
przez dostępne wskaźniki CSS. `PlayerAvailabilityState` zachowuje aktywne i wyleczone urazy z
kanonicznym typem, źródłem, obszarem oraz granicami dat; oś wyszukuje uraz po dokładnym powiązaniu
występu albo zakresie dat, zamiast kopiować stan lub używać bieżącej kontuzji w historycznym meczu.

### Prezentacja zawodnika

Radar ma jawne semantyki migawek: aktywny sezon porównuje kanoniczny początek z bieżącymi atrybutami, a podsumowanie — zamrożony początek z zamrożonym końcem z `CompletedSeasonSnapshot.development`. Etykiety są semantyką prezentacji, nie stanem kariery. Stała paleta radaru nie zależy od barw klubu.

Style gry oraz poziomy zaangażowania są projekcjami istniejących danych `Player` i
`CareerState`; panel zawodnika nie utrzymuje ich kopii ani nie dodaje drugiego systemu
cech. Opis zawodnika pozostaje tymczasowo powiązany z profilem startowym. W Player Model
2.0 powinien stać się opisem wyprowadzanym z aktualnych atrybutów, stylów, roli i etapu
kariery. Realizm zmian minut (w tym zmian gwiazd około 70–85 minuty) pozostaje zadaniem
przyszłego projektu selekcji/minut, a nie losową korektą zakresu w tej warstwie.

## Wspólna powłoka wizualna

Kreator i Career View korzystają z jednego zwartego języka aplikacji: prostokątnych paneli,
cienkich obramowań, oszczędnego akcentu klubowego, małej typografii i subtelnych krawędzi
wgłębionych/wypukłych. Inspiracja oprogramowaniem desktopowym końca lat 90. jest wyłącznie
warstwą prezentacji i nie zmienia architektury ani balansu rozgrywki.

Kroki kreatora są komponentami funkcji w `src/app/creator`, oddzielonymi od generowania gracza w
core. Opcjonalne moduły archetypu fizycznego lub zaawansowanego kreatora mogą zostać w przyszłości
dołączone do tej powłoki bez zmiany istniejących reguł generowania. Są to punkty rozszerzeń, a nie
zaimplementowane mechaniki.

## Career View

Stały widok sezonu jest podstawową powierzchnią rozgrywki aktywnej kariery. Tabela ligi i
wyprowadzona z danych kanonicznych Oś sezonu są widoczne jednocześnie i aktualizują się wraz z
postępem kariery; nie zapisujemy osobnego modelu osi w save.

Karty zawodnika, klubu, kontraktu/finansów i historii pokazują zwarte podsumowania. Ich szczegóły
rozwijają się nad tym samym widokiem, zamiast przenosić gracza do osobnych ekranów. Na wąskim
ekranie karty przewijają się poziomo, a tabela i oś układają się w jednej kolumnie.
Jednocześnie otwarta jest najwyżej jedna współdzielona powierzchnia szczegółów; jej otwarcie nie
odmontowuje stałego obszaru tabeli i Osi sezonu. Ponowne wybranie aktywnej karty lub przycisk `×`
zamyka szczegóły.

Pensja z profesjonalnego kontraktu jest księgowana raz za każdy ukończony, objęty kontraktem
miesiąc jako idempotentna transakcja `salary` w głównej księdze finansowej. Saldo pozostaje
wyłącznie projekcją tej księgi.

Okna pierwszego planu są dopasowane do treści pod wspólną kotwicą workspace; po osiągnięciu maksymalnej wysokości przewijają się wewnątrz. Herb jest jednym statycznym komponentem zasilanym `ClubVisualIdentity`; warianty zmieniają tylko rozmiar.

## Playback i autopauza

Play/Pause jest wyłącznie stanem prezentacji i nigdy nie jest zapisywany. React odpowiada za
tempo (jeden krok co 1000 ms), natomiast `advanceSimulationStep` w core pozostaje jedynym źródłem
reguł pojedynczego, deterministycznego kroku. Szybkie przejście także korzysta z tego prymitywu.

Każda decyzja gracza zatrzymuje czas: wydarzenie, ważny mecz, aktywny mecz lub event, decyzja
transferowa/kontraktowa, koniec sezonu, emerytura oraz błąd progresji. Zwykłe wydarzenie wznawia odtwarzanie tylko, gdy to odtwarzanie spowodowało pauzę i nie pozostał blocker. Ręczna pauza, ważny mecz i koniec sezonu nie uruchamiają czasu automatycznie.

## Jedna pętla kariery

Kariera ma jeden cykl życia: utworzenie zawodnika, inicjalizacja generycznego sezonu, tygodnie kalendarza, zamknięcie sezonu, okno decyzji zawodowych i inicjalizacja następnego sezonu. Pierwszy sezon jest rozgrywką młodzieżową z powodów sportowych, a nie osobnym silnikiem fabularnym. `advanceCareerFlow` wykonuje wyłącznie bezdecyzyjne, idempotentne przejścia.

`CareerCalendarState` jest kanonicznym, widocznym dla zawodnika terminarzem sezonu. Przechowuje spotkania, datowane wydarzenia kontekstowe i bieżącą datę symulacji. `LeagueSeason` pozostaje tymczasowo autorytetem tabeli i wyników rozgrywek, a operacje domeny kalendarza atomowo synchronizują jego przyszłe daty z terminarzem i rejestrem udziału zawodnika.

### Operacyjne tygodnie i dynamiczna przyszłość

`CareerWeek` jest wyłącznie operacyjnym koszykiem dla systemów działających w rytmie tygodniowym. Nie jest właścicielem dat spotkań ani wydarzeń: jego identyfikatory są przebudowywane z kanonicznego kalendarza. Przyszłe spotkania i wydarzenia mogą być dodawane, przekładane lub odraczane wyłącznie przez jawne operacje domenowe. Wykrywają one konflikty, ale nie narzucają priorytetu rozgrywek.

Wewnątrz koszyka kolejne nierozstrzygnięte momenty są wybierane według dat z
`CareerCalendar`: wcześniejszy moment zawsze jest pierwszy, a przy tej samej dacie decyzja gracza
poprzedza spotkanie. Zawodowy koszyk obejmuje krótki, niepokrywający się okres przygotowania
zakończony datą meczu; nie tworzy to dziennej pętli ani dodatkowej osi stanu.

### Niezmienna przeszłość i projekcja osi

Zakończone wyniki, decyzje i fakty są niezmienne i nie są ponownie losowane po zmianie przyszłego terminarza. Przełożenie zachowuje identyfikator spotkania i powiązanie z rejestrem udziału oraz zapisuje semantyczny `HistoryFact`, a nie gotową narrację.

`SeasonTimeline` jest czystą, deterministycznie sortowaną projekcją kalendarza, udziału zawodnika, wydarzeń i historii. Nie jest zapisywana ani nie kopiuje statystyk meczu; wpis spotkania wskazuje jego kanoniczny `SeasonParticipationRecord`. Przyszłe systemy pucharów krajowych, europejskich i reprezentacji skorzystają z tego samego API planowania zamiast tworzyć własne kalendarze. Te rozgrywki nie są jeszcze zaimplementowane.

## Kanoniczny świat futbolu

## Kanoniczny model talentu młodzieżowego

Startowe U-17 i proceduralne nabory wywołują ten sam czysty, deterministyczny generator. Jakość
akademii przesuwa prawdopodobieństwa skupionego rozkładu bieżącego OVR oraz osobno rozkładu
pojemności rodzin rozwoju. Korelacja nie jest tożsamością: mocna akademia może mieć słaby rocznik,
a mniejsza może wylosować rzadki talent. Wyjątkowy ogon pozostaje możliwy, lecz nie wynika z
płaskiego losowania przy górnej granicy. Profile krzywych nadal pochodzą ze współdzielonych
szablonów parametrycznego rozwoju.

Identyfikatory nowych proceduralnych piłkarzy używają wersji `v2`; resolver nadal rozpoznaje `v1`
i odtwarza ją dawną formułą. Uzupełnienia wakatów zawodowych mają oddzielną, ograniczoną kalibrację
replacement/depth i powstają dopiero po wyczerpaniu istniejącej podaży.

Liga rozstrzyga pełne kolejki i przechowuje tabelę oraz wyniki jako fakty świata. `ProfessionalClub.strengthRating` jest trwałym źródłem jakości pierwszego zespołu; oceny meczowe są z niego wyprowadzane. Infrastruktura klubu, historia udziału w sezonach i archiwum sezonów nie są alternatywnymi źródłami siły.

Kontrakty, oferty profesjonalne, transfer do pierwszego klubu, kolejne okna transferowe, renegocjacje i preferencje agenta są już częścią generycznego cyklu. Przejście akademia–profesjonalny futbol wynika z wyniku sezonu i decyzji zawodowej, nie ze specjalnego faktu fabularnego.

## Narracja i wydarzenia

`HistoryFact` zapisuje kanoniczne zdarzenia, `RelationshipScores` relacje, a `StoryThread` długotrwałe interpretacyjne konteksty. Tekst lokalizowany jest prezentacją tych danych. `EventDefinition`, `EventInstance`, rejestr, deterministyczna instancjalizacja, resolver i aplikowanie rezultatu pozostają ogólną infrastrukturą dla przyszłych wydarzeń kontekstowych; nie sterują osobnym prologiem.

Cała logika `src/core` pozostaje niezależna od Reacta. Losowania przechodzą przez deterministyczny `RandomGenerator`, a dane domenowe są walidowane schematami Zod.

## Warstwa aplikacji React

`src/app/App.tsx` jest powłoką aplikacji: wybiera ekran startowy, kreator lub karierę oraz zarządza wczytaniem, zapisem i resetem kariery. Komponenty funkcjonalne w `src/app/career`, `src/app/match` i `src/app/shared` odpowiadają za prezentację poszczególnych obszarów interfejsu.

Zależności biegną od Reacta do `src/core`. Ekrany wyświetlają stan i wywołują istniejące operacje domenowe, ale nie implementują reguł rozgrywki; `src/core` nie importuje warstwy React/UI.

## Trwałość danych

Projekt jest wewnętrznym prototypem. Kompatybilność starych zapisów nie jest obecnie ograniczeniem projektowym. Zmiana architektury może podnieść wersję zapisu i czysto odrzucić wcześniejsze dane zamiast utrzymywać migracje oraz pola zapasowe.

## Dalszy kierunek

Planowane osobno są: ujednolicone rozgrywki i kalendarz, rosnąca oś sezonu, responsywny pojedynczy widok kariery oraz przyszły interaktywny silnik migawkowych momentów meczu. Nie są one jeszcze zaimplementowane w obecnej architekturze.

## Tabela ofert na koniec sezonu

Bieżący kontrakt jest stanem referencyjnym, a `ProfessionalOffer` jedynym pojęciem aktywnej oferty. Propozycja obecnego klubu pozwala ją przyjąć albo podjąć jedną próbę negocjacji; wynikowa kontroferta pozwala już tylko na przyjęcie. Oferty zewnętrzne również mają wyłącznie akcję przyjęcia. Oglądanie lub negocjowanie propozycji nie odrzuca pozostałych ofert.

Przyjęcie dowolnej oferty atomowo instaluje dokładnie jej kontrakt, zamyka wszystkie konkurencyjne oferty i renegocjację oraz dokładnie raz przechodzi granicę sezonu. Kontynuacja niezmienionej umowy jest ścieżką awaryjną tylko wtedy, gdy umowa obejmuje 1 lipca nowego sezonu i nie ma propozycji obecnego klubu. Gdy umowa wygasa, przygotowanie rynku gwarantuje co najmniej jedną deterministyczną ofertę od prawdziwego klubu z bieżącego świata. Profesjonalny sezon nie może rozpocząć się na wygasłym kontrakcie.

Nazwy encji mogą w przyszłości prezentować zwarte podglądy oparte na danych kanonicznych, bez osobnej bazy UI: dla klubu herb, ligę, siłę, reputację, pozycję i infrastrukturę, a dla osoby portret, wiek, pozycję lub rolę, znany OVR, obecny klub i istotną relację.

## Player Model 2.0

Zawodnik ma jedno kanoniczne źródło danych: 25 widocznych atrybutów (w tym cztery bramkarskie u każdego zawodnika), osiem ukrytych wymiarów osobowości oraz jawne dane obu nóg. Boisko dzieli się na dokładnie dziewięć stref. OVR pozycyjny jest wyłącznie ważonym skrótem prezentacyjnym; osobno stosowana znajomość pozycji opisuje doświadczenie w strefie bez zmiany bazowych umiejętności.

Archetyp piłkarski jest deterministycznie wyprowadzanym, rankingowanym opisem profilu, a nie zapisaną klasą. Przyszły PlayStyle pozostaje odrębną specjalizacją behawioralną. Rozwój nie ma globalnego, twardego potencjału: używa miękkiej pojemności, wieku szczytu i początku regresu dla rodzin technicznej, mentalnej, fizycznej i bramkarskiej. Trudność kariery wpływa tylko na generowanie i przewidywalność rozwoju protagonisty, nigdy na siłę świata.

# Persistent footballer world

`FootballerProfile` is the canonical Player Model 2.0 card shared by the protagonist and NPCs. The protagonist composes it with player-only preferences and career controls; `WorldFootballer` adds only persistent career status and a `DevelopmentProfile`. `CareerState.footballerWorld` is a normalized registry, while professional clubs store only `squadPlayerIds`; the protagonist is resolved directly from `career.player` and is never cloned into the registry.

Managers deterministically own one preferred evaluation formation. Live club strength is the rounded mean of the globally optimized best XI's effective positional OVR, including canonical familiarity penalties. `strengthRating` remains solely a squad bootstrap target and legacy fallback when a normalized squad is absent.

Full cards are intentionally retained at the current Polish-world scale. Derived OVR, radar and archetype scores are not persisted, and background players do not receive weekly match logs, narrative state or protagonist development simulation. Future larger worlds can keep canonical cards while using sparse seasonal development and coarser background competition simulation.

Club colours, including white/white and similar pairs, remain canonical data. Neutral outlines are derived only in presentation when contrast would otherwise disappear.

# Świat statyczny i zapis kariery

Kanoniczna baza świata jest deterministycznym artefaktem budowania, a nie formatem autorskim.
Generator łączy wersję i seed świata, proceduralne reguły oraz małe, przeglądalne definicje
źródłowe. Przyszłe definicje klubów, akademii, specjalnych piłkarzy i humorystycznych odniesień
powinny trafiać do `src/content/world/`; generator zwaliduje połączony wynik schematem Zod i zapisze
go w ignorowanym `.generated-public`. Wielki serializowany JSON nigdy nie powinien być edytowany
ręcznie ani służyć jako format authoringu.

`STATIC WORLD + PROCEDURAL PLAYER GENERATION + DATE PROJECTION + SPARSE CAREER STATE = EFFECTIVE WORLD`.

Coroczny nabór nie zapisuje pełnych kart. Wersjonowany identyfikator proceduralny koduje akademię,
sezon, pozycję i slot, dzięki czemu resolver odtwarza identyczną tożsamość, biografię, profil
rozwoju i bazowe atrybuty także po zimnym wznowieniu. Zwykłe transfery, pierwsze kontrakty oraz
emerytury zapisują wyłącznie `footballerStateOverrides` (klub, kontrakt, status); pełne override'y
pozostają furtką dla wyjątkowej przyszłej treści. Aktywna delta zachowuje tylko operacyjnie bieżące
kohorty, a nie archiwum wszystkich dawnych list U-17.

Globalna granica ukończonego sezonu ma jednego właściciela i kolejność: (1) archiwum protagonisty,
(2) rollover poziomów klubów, (3) deterministyczne emerytury NPC, (4) graduacja U-17 i pierwsze
kontrakty, (5) cykl trenerów, (6) ograniczony, niedoskonały rynek NPC, (7) krytyczna naprawa
niegrywalnych kadr, (8) nabór następnego U-17, (9) inicjalizacja sezonu i hierarchii protagonisty.
Rozwój naturalny jest projekcją daty i nie zapisuje stanu. Rynek może popełniać błędy lub nie kupić
nikogo; osobna naprawa integralności uruchamia się wyłącznie dla klubu bez 11 graczy, bramkarza lub
10 zawodników z pola i odbudowuje minimum uczestnictwa, bez optymalizacji OVR.

Kohorta U-17 jest rozwiązywana jako `youthCohortOverrides[key] ?? youthCohorts[key]`. Na granicy
sezonu każdy NPC kohorty jest postarzany dokładnie raz, a zawodnik osiągający 17 lat kończy U-17.
Obecność nakładki kohorty jest jednocześnie kanonicznym znacznikiem wykonanego przejścia. Awans,
pierwszy kontrakt lub pozostanie bez klubu zmieniają wyłącznie deltę; protagonista nie uczestniczy
w tym pipeline i zachowuje osobny przepływ ofert sterowany przez gracza.

Wyjściowe kluby, menedżerowie, składy i pełne karty Player Model 2.0 są niezmiennym,
wersjonowanym contentem gry. Seed kariery steruje zdarzeniami i przyszłą ewolucją, ale nie
odtwarza początkowej rzeczywistości. Stabilne identyfikatory są wspólne dla wszystkich karier,
a zapis przechowuje protagonistę i wyłącznie zmienione lub nowe encje. OVR, radar, najlepsza
jedenastka i siła klubu są wartościami pochodnymi, nie danymi autorytatywnymi.

Generowanie kadry używa jawnych poziomów głębi osobno dla każdej pozycji, nigdy globalnego indeksu
listy. Najpierw szeroki kształt pozycyjny nadaje profilowi także słabości, potem archetyp wprowadza
charakterystyczne wyjątki, a OVR pozycji głównej jest kalibrowany do poziomu klubu i roli w głębi.

Bazę można w przyszłości dzielić na leniwie ładowane pakiety krajów i rozgrywek oraz statyczne
kohorty młodzieży. Pełna tożsamość NPC pozostaje zachowana; bliscy NPC mogą być aktualizowani
szczegółowo, a tło będzie rozwijane deterministycznie sezonowo lub w rzadkich checkpointach,
zamiast symulacji treningu 52 razy w roku dla całego świata.

Wyjściowe profesjonalne kontrakty NPC są faktami niezmiennej bazy świata. Dopiero zmiana
umowy zapisuje pełnego zawodnika w `footballerOverrides`; świeży `CareerWorldDelta` nie kopiuje tych
kontraktów. Rynek sumuje efektywne płace raz na okno i ogranicza nowe zobowiązania, ale nie symuluje
wypłat ani rachunkowości klubów — księga miesięcznej pensji protagonisty pozostaje osobnym systemem.
Generator przypisuje początkową obietnicę kontraktową dopiero po zbudowaniu całej kadry i ocenie
realnej hierarchii. `development_player` oznacza młodego zawodnika rozwijanego przez klub, a nie
automatyczną etykietę dowolnego seniora znajdującego się głęboko w składzie.

`selectBestXI()` jest czystym, globalnie optymalnym ewaluatorem jakości używanym do wyprowadzania
siły klubu. Osobny `deriveSquadHierarchy()` modeluje niedoskonały wybór trenera: efektywny OVR i
dopasowanie pozycyjne dominują, a kondycja, stabilna preferencja i `selectionStanding` rozstrzygają
bliskie porównania. `selectionStanding` oznacza wolno zmieniające się zaufanie sztabu, a nie drugi
OVR, dlatego ma mały, ograniczony wpływ i nie odwraca dużych różnic jakości.

Status sportowy XI / ławka / głęboka rezerwa jest projekcją bieżącej hierarchii i nie pochodzi z
kontraktu. `Contract.squadRole` pozostaje obietnicą lub oczekiwaniem z chwili zawierania umowy;
obie wartości mogą celowo się rozjechać. Nowe oferty i odnowienia projektują rolę kontraktową przez
realną konkurencję pozycyjną w składzie klubu celu i formację jego trenera. Ta sama hierarchia
steruje zawodowym powołaniem oraz planowanymi minutami.

`ClubView` wyprowadza pogrupowaną XI, siedmioosobową ławkę i głęboką rezerwę wyłącznie przez
kanoniczne `deriveSquadHierarchy()`. Rywalizacja pozycyjna korzysta z tego samego ewaluatora,
a status sportowy jest opisany osobno od roli kontraktowej. Boisko i lista są projekcjami tej samej hierarchii i nie
udostępniają edycji taktyki. Jeden portal `FootballerHoverCard` rozwiązuje dopiero wskazanego
zawodnika i współdzieli `ATTRIBUTE_PRESENTATION`, radar, ranking archetypów, pozycyjny OVR,
lokalizację pozycji oraz kanoniczny kontrakt z Player Model 2.0. Nie powstają ukryte pełne karty
dla całej kadry ani osobny model prezentacyjny.

Każdy przydział XI zachowuje tożsamość indeksu kanonicznego slotu formacji; selekcja, lista i
boisko odnoszą się dzięki temu do tego samego przydziału także przy powtarzających się pozycjach.
Bramkarz i zawodnik z pola należą w normalnej selekcji do rozłącznych zbiorów kwalifikacji — dotyczy
to XI, ławki i rywalizacji pozycyjnej. Normalna siedmioosobowa ławka zawiera jednego bramkarza;
drugi może wejść tylko przy niedoborze aktywnych graczy z pola. Crossover może w przyszłości nastąpić wyłącznie przez jawną
mechanikę pozycji awaryjnej, np. po czerwonej kartce lub urazie, gdy wykorzystano wszystkie zmiany.

# Mapa źródeł prawdy dla pozycji i roli

- `FootballerProfile.primaryPosition` opisuje nominalną tożsamość piłkarską.
- `secondaryPositions` i `positionFamiliarity` opisują wyuczone możliwości; przydział meczowy ich
  nie zmienia.
- `ProfessionalOffer.plannedPosition` opisuje zamiar trenera klubu docelowego w chwili oferty.
- `SeasonParticipationRecord.assignedPosition` jest faktem o faktycznym slocie formacji w danym
  występie; brak występu oznacza brak pola, a stare rekordy bez pola pozostają poprawne.
- `Contract.squadRole` jest obietnicą kontraktową, zaś status sportowy jest bieżącą hierarchią XI,
  ławki i rezerw. Żadne z tych pojęć nie zastępuje pozostałych.

Zbiorcze użycie pozycji w sezonie jest tanią projekcją `deriveSeasonPositionUsage`, a nie
duplikowanym stanem. Nie powstaje fakt historii za każdy występ poza pozycją. W przyszłości dopiero
trwała, znacząca konwersja może stać się wydarzeniem narracyjnym lub faktem historii.

## Kanoniczne kohorty młodzieżowe

## Tożsamość, data i cykl życia

`dateOfBirth` jest kanonicznym źródłem wieku trwałej osoby; `age` pozostaje przejściowym polem
zgodności i projekcją. Wiek wylicza jeden kalendarzowy helper względem autorytatywnego
`currentDate`, bez mutowania świata wraz z upływem sezonu. Model pozostaje równaniem **statyczna
tożsamość + data + rzadka delta kariery = efektywny świat**. Migracja starych kart wyprowadza datę
deterministycznie z wieku, daty startowej i stabilnego ID, nie tworząc masowych override'ów.

Tożsamość osoby (ID, imię, narodowość, data urodzenia, twarz, relacje i pamięć narracyjna) jest
niezależna od nakładających się karier/rol. Przyszły emerytowany piłkarz będący trenerem,
asystentem lub menedżerem pozostaje tą samą osobą; stan kariery piłkarskiej i przyszłej kariery
sztabowej nie będzie wzajemnie wykluczającym polem `role`.

Początkowe kadry U-17 są trwałymi `WorldFootballer` w tej samej mapie co seniorzy, a przynależność
przechowuje sezonowy klucz `u17:<teamId>:<season>` w `WorldDatabase.youthCohorts`. Definicja
drużyny młodzieżowej przechowuje tylko stabilną tożsamość i powiązanie; nazwę, region, identyfikację
wizualną oraz środowisko akademii wyprowadza się z rodzica `ProfessionalClub`. Brak kontraktu i
`currentClubId` odróżnia członka kohorty od zawodnika pierwszej drużyny. Po graduacji ten sam resolver daty projektuje profil absolwenta bez specjalnego przebiegu i bez zapisywania override'u.

`CareerState.youthCohorts` jest runtime’owym widokiem niezmiennej bazy, usuwanym z zapisu i ponownie
hydratowanym razem z `clubWorld` i `footballerWorld`. `SquadSelectionContext` pozwala wspólnemu
silnikowi selekcji obsługiwać profesjonalny klub i drużynę U-17 bez tworzenia fikcyjnego kontraktu.
Grywalna Vistula projektuje 24 kanoniczne ID plus protagonistę dokładnie raz. Siła drużyn ligi jest
jednorazowo wyprowadzana z rzeczywistej XI w preferowanej formacji trenera.

## Projekcja rozwoju NPC i granica sezonu

**NATURALNY ROZWÓJ NPC JEST PROJEKCJĄ ZALEŻNĄ OD DATY, A NIE TRWAŁĄ COROCZNĄ MUTACJĄ.**
Kanoniczny resolver składa bazowego/nowego piłkarza, parametryczną projekcję na `currentDate`, a
następnie rzadką, jawną łatę wyjątkowego zdarzenia. Projekcja korzysta ze wspólnej krzywej,
`DevelopmentProfile`, daty urodzenia, charakteru i stabilnego ID; nie skanuje sezonów ani nie
tworzy historii atrybutów. `footballerAttributeOverrides` służy nadal trwałym kontuzjom,
wydarzeniom i autorskim konsekwencjom, nigdy zwykłemu starzeniu. Emerytura analogicznie ma jeden
deterministyczny wiek/datę końca i nie jest blokowana minimalnym rozmiarem kadry.

## Cykl trenerów — faza 1

Jedna deterministyczna projekcja tabel zasila ewolucję klubów i coroczną ocenę trenerów. Ocena
porównuje wynik z oczekiwaniem względem klubów tego samego poziomu, uwzględnia awans, spadek,
presję klubu, reputację trenera i ograniczony szum. Wakaty korzystają z małej puli zwolnionych i
niezatrudnionych trenerów, a dopasowanie obejmuje poziom, styl i młodzież. Delta przechowuje tylko
bieżące przypisania i zwięzłe rekordy ruchów; `CoachProfile` oraz `Person` zachowują tożsamość.

## Kanoniczna efektywna kadra i letni rynek

Efektywny świat ma równanie **STATIC WORLD + PROCEDURAL PLAYERS + DATE-BASED NPC DEVELOPMENT +
SPARSE CAREER STATE + ONE CANONICAL EFFECTIVE SQUAD RESOLVER = EFFECTIVE WORLD**.
`resolveEffectiveSeniorSquad()` składa startową kadrę z `squadOverrides`, usuwa emerytów i nakłada
członkostwo protagonisty. `ProfessionalClub.squadPlayerIds` jest wyłącznie bootstrapem, nie drugim
runtime'owym źródłem prawdy.

Jedynym właścicielem letniej budowy kadr jest `processSummerSquadMarket()`. Kolejność granicy to:
projekcja rozwoju, nieodwołalne emerytury, uwolnienie absolwentów do wspólnej puli, cykl trenerów,
a następnie faza odejść (wygaśnięcia i ograniczone intencje) oraz jeden rynek absolwentów, wolnych,
chcących odejść i graczy dostępnych do kierunkowego podkupienia. Kluby działają od wyższego poziomu
i reputacji w dół piramidy. Wolni gracze mają pierwszeństwo przed transferem i proceduralnym
absolwentem uzupełniającym. Budżety są miękkim kontekstem i nie mogą zepsuć grywalności świata.
`worldIntegrity` audytuje wynik; dawny krytyczny repair jest nieaktywnym API zgodności.

### Skończona liczba zawodowych miejsc pracy

**PROFESSIONAL FOOTBALL HAS FINITE JOBS.** Absolwenci, wolni zawodnicy i gracze dostępni do
transferu konkurują w jednym efemerycznym rynku. Absolwent albo wolny zawodnik, który po zamknięciu
okna nie ma klubu zawodowego, kończy symulowaną karierę profesjonalną; zachowujemy tylko zbiorczy licznik
wyjść oraz rekonstruowalną tożsamość bazową, a nie aktywny kontrakt ani kartę. Jest to osobne wyjście niż deterministyczna
emerytura wieku. Zawodnik chcący odejść, lecz nadal związany ważnym kontraktem, pozostaje w klubie,
jeżeli nie znajdzie nabywcy. Proceduralne uzupełnienie powstaje dopiero po wyczerpaniu odpowiednich
istniejących kandydatów i tylko dla rzeczywistego wakatu pozycyjnego.

## Kanoniczny model zawodnika, XI i siły (PR77)

**ONE RAW ATTRIBUTE -> AT MOST ONE RADAR AXIS.** Radar jest wyłącznie prezentacją charakterystyki; pozycyjny OVR jest źródłem bieżącej jakości sportowej i liczy średnie grup przed zastosowaniem wag grupowych. `positioning` (własne ustawienie) pozostaje odrębne od `gameReading` (rozumienie rozwijającej się gry). Bramkarskie `goalkeeperKicking` i `goalkeeperThrowing` są osobnymi surowymi umiejętnościami dystrybucji. Ambicja i profesjonalizm sterują karierą/rozwojem, nie OVR. Wzrost jest sytuacyjnym parametrem ciała, nigdy umiejętnością 1–100 ani składnikiem radaru.

**RADAR = PRESENTATION. POSITION OVR = SPORTING QUALITY. MANAGER SELECTION = OVR + SMALL CONTEXT / STYLE EFFECTS.** Znajomość pozycji jest nakładana dopiero na teoretyczny OVR. Dopasowanie taktyczne ma zakres -2..+2, parametry osobowości trenera są małymi rozstrzygaczami, a progi fitness wykluczają wynik poniżej 55 i silnie karzą 55–69, umiarkowanie 70–79 oraz lekko 80–89.

**ONE LEGAL XI -> ONE CLUB STRENGTH.** Jeden selektor sprawdza kolejno formację preferowaną, drugą i pozostałe kanoniczne formacje, odrzuca niewykonalne przypisania i zwraca wyłącznie 11 unikalnych, normalnie uprawnionych zawodników. Średni efektywny OVR tej XI jest bieżącą siłą klubu i środkiem profilu ataku/obrony.

**ONE OFFICIAL MATCH SCORE.** Dla bramkarza grającego pełny mecz gole stracone i czyste konto wynikają z oficjalnego wyniku. Strzały, obrony, xGA, błędy i ocena są szczegółami warunkowanymi tym wynikiem, nie drugim rejestrem bramek.

Letnia granica zachowuje kolejność: wynik końcowy -> czysta projekcja świata letniego -> oferty/decyzja gracza -> lokalne uzgodnienie -> commit. Rynek nie startuje przed poznaniem rozstrzygnięcia sezonu; projekcja powinna pozostać niemutująca i profilowana przed przyszłym przeniesieniem poza główny wątek.

Przyszłe morale nie będzie kolejnym OVR. Uwzględni obiecaną rolę wobec minut/statusu, ławkę, użycie poza opanowaną pozycją, wyniki, występy, relację z trenerem oraz wydarzenia kontraktowe/transferowe. Krótkoterminowy wpływ sportowy pozostanie mały; długotrwale bardzo niskie morale może prowadzić do frustracji rolą lub `wants_move`, bez medykalizujących etykiet.

Późniejsza prezentacja przeniesie tożsamość trenera z rogu boiska obok nagłówka/listy kadry. Hover card wykorzysta istniejący `CoachProfile`: imię, wiek, obie formacje, styl, reputację, zaufanie młodzieży, elastyczność pozycyjną i cierpliwość wobec formy. PR77 nie zmienia layoutu.

## Jedna bieżąca siła klubu

W znormalizowanym świecie zawodowym istnieje dokładnie jedna bieżąca siła sportowa: zaokrąglona średnia efektywnego pozycyjnego OVR legalnej XI wybranej przez `selectBestXI()`, rozwiązywana przez `getCareerClubStrength()`. Inicjalizacja ligi, przeciwnicy, rating bazowy meczu, oferty, kafle oraz podglądy odwołują się do tego resolvera. Atak i obrona meczu są wyłącznie deterministycznymi pochodnymi wycentrowanymi na tej bazie. Brak legalnej XI jest błędem integralności, a nie powodem użycia statycznego ratingu.

`getBootstrapClubStrength()` nazywa jawnie historyczny cel generatora kadry. Nie jest runtime'ową jakością. Reputacja opisuje prestiż instytucjonalny, poziom finansowy zasoby, a infrastruktura środowisko rozwoju — żadne z nich nie nadpisuje jakości XI. Migawki ligi mogą zamrozić wartość rozwiązaną z kanonicznej kadry dla deterministycznego sezonu, ale nie wyliczają jej samodzielnie.

`clubObservability.ts` dostarcza czyste modele dla diagnostyki luk XI i przeglądarki świata. PR79 dopiero połączy: cykl trenera → wykonalność formacji → braki pokrycia → braki jakości XI → priorytety → rynek; PR78 nie zmienia zachowania rekrutacji.

## Position & Selection 3.0 (PR80)

Pozycja zawodnika, profil i zadanie taktyczne są trzema różnymi pojęciami. Kanoniczny zbiór pozycji
to: BR, LO, ŚO, PO, ŚP, LS, PS i N. ŚP ma jeden grupowo normalizowany OVR z wagami
DEF/PHY/SPD/READ/OFF/TECH/AIR/MENT = 3/3/3/5/3/4/2/3. Archetypy (np. regista, mezzala,
box-to-box) opisują profil zawodnika, a `defend | support | attack` wyłącznie zadanie konkretnego
slotu formacji. Geometria należy do slotu, nie etykiety pozycji.

`evaluateCandidateForSlot()` jest jedyną regułą użyteczności kandydata dla trenera. Łączy efektywny
pozycyjny OVR, znajomość pozycji, ograniczone do ±2 dopasowanie zadania, fitness, styl, wiek i jawnie
przekazane zaufanie. Protagonista i NPC nie mają odrębnych wzorów; mogą mieć inne dane kontekstowe.
Projekcja oferty używa tych samych slotów i neutralnego zaufania nowego trenera. Siła klubu nadal
pozostaje średnią efektywnych OVR kanonicznej legalnej XI, bez premii za zadanie.

Zapis v4 ma jedną granicę migracji: dawne dwa identyfikatory środkowej pomocy są mapowane na ŚP,
pozycje dodatkowe są deduplikowane, a znajomość ŚP przyjmuje maksimum dawnych wartości. Nowy stan
nigdy nie zapisuje identyfikatorów historycznych.

## Kanoniczna symulacja taktyczna

Stan meczu Single Match jest efemeryczny i niezależny od `CareerState`. Przestrzeń drużyny opisuje
głębokość od własnej bramki i semantyczną lewą/prawą stronę, a jeden adapter odwzorowuje ją na
boisko 105 × 68 dla przeciwnych kierunków ataku. Kamera nie wpływa na te reguły.

Najważniejszy niezmiennik brzmi: **protagonista == NPC w regułach sportowych**. Stos symulacji to:
`formacja → faza i styl trenera → dynamiczne cele → reakcje lokalne → dostępne akcje → polityka AI
lub wybór człowieka → kanoniczne rozstrzygnięcie → nowy stan → renderer`. Przyszłe UI zastąpi tylko
wybór polityki AI; nie dostanie własnych akcji, ruchu ani resolvera. Core jest właścicielem pozycji,
piłki, posiadania i faz, zaś React steruje zegarem, a Three.js jedynie wyświetla stan.

### Tactical situation playbook

Research-driven **Tactical Situation Playbook v1** jest deklaratywną warstwą na tej samej
równowadze pozycyjnej, a nie osobnym silnikiem stałych fragmentów. Kanoniczna kolejność pozostaje
następująca: neutralna kotwica formacji → transformacja bloku → intencja fazy → tymczasowa rola
sytuacyjna → lokalna interakcja → indywidualna swoboda/błąd → przepisy i ograniczenia → idealny cel.

Formacja opisuje neutralną strukturę. Sytuacje (wykop i krótkie rozegranie bramkarza, trzy plany
rożnego, trzy geometrie wolnego, karny i rozpoczęcie) przydzielają zawodników według atrybutów do
krótkotrwałych intencji oraz przybliżonych stref — nigdy do kanonicznej tabeli 22 współrzędnych.
Lokalne ważone odległością relacje napastnik–obrońca, pary krycia i press/asekuracja/krycie linii
modyfikują cel bez ściągania całego bloku do piłki. Ograniczenia boiska, wznowienia, muru, karnego
i spalonego są nakładane na końcu. Po wykonaniu wpływ roli wygasa przez cztery sekundy, więc gracze
bez teleportacji wracają do zwykłej równowagi pozycyjnej. Dane playbooka i runtime'owe role mają
schematy Zod; wybory i wariancja korzystają wyłącznie z seeda meczu.

Metryki centroidu, długości, szerokości, rozciągnięcia, otoczki wypukłej, graczy przed piłką i
rest-defence są efemeryczną diagnostyką Single Match Lab. Nie trafiają do zapisu ani nie wymuszają
docelowych wymiarów drużyny.

### Piłka w powietrzu i pojedynki główkowe

Lot piłki jest lekką częścią stanu kanonicznego: interpolacja pozioma oraz deterministyczny łuk
parametryczny wyznaczają postęp, wysokość i szczyt lotu. Nie jest to silnik fizyki. Podania po ziemi
pozostają na zerowej wysokości, a renderer jedynie odczytuje wysokość policzoną przez core.

Dośrodkowanie z gry, bezpośredni rożny, dośrodkowany wolny i długie wybicie bramkarza używają tego
samego stosu akcji i lotu. Role Tactical Situation Playbook wyznaczają strefę, zawodników pierwszej
piłki, wsparcie drugiej piłki oraz rest-defence; nie rozstrzygają kontaktu. Przy wejściu wysokiej
piłki w strefę core wybiera mały lokalny zbiór kandydatów według dojścia, ruchu, wzrostu, skoczności,
gry głową, siły, ustawienia, czytania gry i koncentracji. Bramkarz może w realistycznym zasięgu
pozostać, wyjść, złapać albo wypiąstkować piłkę.

Pojedynek prowadzi do główki na bramkę, zgrania, wybicia, czystego przejęcia albo piłki bezpańskiej.
Główka na bramkę wraca do wspólnej architektury wyniku strzału, a pozostałe kontakty do istniejącego
obiegu posiadania i loose ball. Przy drugiej piłce lokalni uczestnicy oraz role `attack_second_ball`
otrzymują czasowy priorytet reakcji, bez teleportowania posiadania. Kanoniczny resolver granic
zamyka terminalne piłki bezpańskie wznowieniem od bramki, rożnym albo wrzutem z autu.

### Czas meczu, wznowienia i powtórki (PR97)

`TacticalMatchState.time` jest jednym, monotonicznym czasem kanonicznym w sekundach. Zegar ścienny
przeglądarki przechodzi przez mnożnik tempa do akumulatora, który uruchamia wyłącznie stałe ticki
symulacji po 0,05 s: **wall clock → playback multiplier → fixed simulation accumulator → canonical
tactical state → renderer**. Tempo i częstotliwość renderowania zmieniają więc tylko liczbę ticków
wykonanych w czasie rzeczywistym, nigdy rozmiar kroku, losowania ani wynik sportowy. Prędkości
zawodników i piłki są wyrażone w metrach na sekundę względem boiska 105 × 68; cel taktyczny nadal
określa kierunek, a pilność ruchu określa tempo z zachowaniem przyspieszenia i bez natychmiastowej
zmiany wektora prędkości.

Każde kanoniczne wznowienie ma jawne `restartTeam`. Po golu rozpoczyna drużyna, która straciła
bramkę; wykop należy do broniącej, rożny do atakującej, a wolny i karny do drużyny, której je
przyznano. `startedAt` i `executedAt` leżą na tej samej absolutnej osi co `time`, a przygotowanie
wznowienia nie zeruje zegara. Domyślni gospodarze w przyciskach scenariuszy DEV są wyłącznie
wyborem harnessu.

Bufor ostatnich klatek i zachowana powtórka gola należą wyłącznie do prezentacji Single Match Lab.
Zawierają minimalną migawkę renderera, nie `TacticalMatchState` ani stan kariery. Podczas odtwarzania
core jest wstrzymany, nagrane klatki są wyświetlane wolniej bez ponownego uruchamiania resolverów lub
RNG, a wyjście wraca do dokładnie tego samego kanonicznego stanu po golu.
