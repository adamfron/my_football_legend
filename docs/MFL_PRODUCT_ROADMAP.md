# MFL — roadmapa kompletnej gry

Stan audytu: PR211, baza `0f817849e4f76aad9f72cb99b066895822ae9d42` z PR210. To plan produktu, nie rozszerzenie implementacji fizyki PR211 ani harmonogram numerów PR. MFL jest narracyjną karierą piłkarza w przeglądarce. Podstawowa wersja pozostaje lokalna, bez kont, backendu, zewnętrznych API i generatywnej AI w rozgrywce.

Właściciel ukończył ręcznie 25 sezonów i potwierdził przyjemność z obecnej kariery. [Backlog wydania](RELEASE_READINESS_BACKLOG.md) zachowuje jego konkretne uwagi oraz rozróżnia relację użytkownika od odtworzonego testu. Pojedyncza kariera nie jest kalibracją populacji. Pełny playthrough jest właściwą bramką zmian świata/kariery, ale nie obowiązkowym dodatkiem do każdego eksperymentu kontaktu stopy.

## Priorytety i zależności

| Strumień | Stan obecny | Znaczenie dla MFL 1.0 |
| --- | --- | --- |
| A. Ekonomia | wspólne wyceny, kontrakty, pojemność budżetowa i rynek; uproszczone przepływy | spójność zobowiązań konieczna; głębsze finanse pożądane |
| B. Świat i rozgrywki | polski świat, akademie, cztery poziomy zawodowe, terminarze i awanse | stabilna piramida konieczna; wiele krajów i reprezentacje pożądane, szeroki świat później |
| C. Pochodzenie i akademia | kreator PL, start Vistula Nova, wspólna generacja kariery | wybór startu pożądany; szeroka kwalifikacja międzynarodowa wraz z reprezentacjami |
| D. Pokolenia i rozwój | kohorty, graduacja, emerytury, projekcja wieku, rynek i rozwój | stabilność wielopokoleniowa konieczna |
| E. Siła klubów i kolejność rynku | bieżąca legalna XI; rynek ma osobny ranking poziomu/reputacji | wiarygodna rekrutacja konieczna; Elo opcjonalne po badaniu |
| F. Szybka symulacja | działający model statystyczny i symulacja lig tła | spójne fakty i koszt konieczne; destylacja zależna od jakości canonical |
| G. Newsy i zdarzenia | projekcja istniejących faktów kariery | zgodność z faktami konieczna; bogatsze wiadomości pożądane |
| H. Tożsamość wizualna | stabilne kolory, modele zawodników, zmieniona część UI | spójny system konieczny; bogate herby hybrydowe pożądane |
| I. Stadiony | deterministyczne community/compact/bowl i detale | czytelność i wydajność konieczne; większa różnorodność pożądana |
| J. UI i responsywność | istniejące widoki kariery/meczu i breakpointy CSS | osobna faza użyteczności przed wydaniem konieczna |
| K. Walidacja i wydanie | rozbudowane audyty, testy kariery i źródłowe replaye | warstwowe kryteria wydania konieczne |

Prace produktowe mogą postępować obok badań silnika. Nie trzeba zamknąć wszystkich 135 zagadnień realizmu, aby poprawić ekonomię, UI czy świat. Zależności są rzeczowe: stabilna tożsamość i kalendarz → kohorty/kontrakty/ligi; spójna księga faktów → newsy i historia; zweryfikowane mecze canonical → dane dla destylacji; budżet i potrzeby kadry → wiarygodny rynek. Jedna selekcja prezentacji może korzystać z różnych poziomów szczegółowości, ale wynik danego meczu ma jednego właściciela.

## A. Ekonomia kariery i finanse

**Istnieje:** [playerEconomy.ts](../src/core/playerEconomy.ts) wyprowadza płace, wartość i opłaty z jakości, wieku, reputacji, roli, ligi i kontraktu. [contracts.ts](../src/core/contracts.ts) obsługuje renegocjacje, a [professionalClubs.ts](../src/core/professionalClubs.ts) oferty protagonisty. [npcTransferEconomics.ts](../src/core/npcTransferEconomics.ts) wyprowadza sezonowy budżet transferowy, miesięczny budżet płac i istniejące zobowiązania; [npcTransferMarket.ts](../src/core/npcTransferMarket.ts) wydaje je na rekrutację. Dowody: `playerEconomy.test.ts`, `npcTransferMarket.test.ts`, `scripts/economyAudit.test.ts`. To sezonowa projekcja możliwości, nie pełne konto bankowe klubu.

**Brakuje lub wymaga rozwoju:** trwały bilans przychodów/wydatków, wiarygodne skutki awansu i sukcesów, ograniczenia płynności, kontrakty i negocjacje uwzględniające strategię stron. Obecne tabele bazowe poziomów są ujawnionym uproszczeniem. Sama rozbudowa tabel cen nie stworzy ekonomii.

**Zależności i etapy:** najpierw audyt wszystkich konsumentów wspólnej wyceny i kontraktów; potem mała księga przepływów (płace, transfery, podstawowe przychody, koszty) oraz testy zachowania zobowiązań; następnie reakcja klubów na deficyt, awans/spadek i potrzeby kadry; na końcu bogatsze negocjacje i zróżnicowanie krajów. Reputacja, jakość sportowa i pieniądze pozostają osobne.

**Akceptacja:** zgodna wycena protagonistów/NPC; brak podwójnego obciążenia transferu; płace są pokrywane albo jawny deficyt wywołuje przewidywalną reakcję; wielosezonowe rozkłady budżetów nie eksplodują i nie sprowadzają wszystkich klubów do jednego poziomu. Testować kluby stabilne, awansujące, spadające i sprzedające liderów.

**Koszt i priorytet:** księgować zdarzenia i okresowe agregaty zamiast pełnego dziennego śladu każdego klubu. Spójność i stabilność są konieczne dla 1.0; szersze typy przychodów i negocjacje pożądane; rozbudowane modele długu mogą poczekać.

## B. Piłkarski świat i baza rozgrywek

**Istnieje:** wersjonowana baza `pl-2026-v2`, generator [createCanonicalWorldDatabase.ts](../scripts/createCanonicalWorldDatabase.ts), resolvery [worldDatabase.ts](../src/core/worldDatabase.ts), kalendarz i liga [leagueSeason.ts](../src/core/leagueSeason.ts), wspólna siła rozgrywek [competitionStrength.ts](../src/core/competitionStrength.ts). Generator raportuje 64 kluby zawodowe i 1824 piłkarzy łącznie z młodzieżą; istnieje 12 kohort U-17 i cztery poziomy zawodowe. Testy `leaguePyramid`, `worldDatabase`, `worldIntegrity`, `worldAudit` potwierdzają istniejący zakres, nie kompletność świata międzynarodowego.

**Do rozwoju:** konfigurowalne kraje, piramidy i regionalne tożsamości klubów; powiązane akademie/seniorzy, konflikty terminarzy, porównywalna siła między krajami, reprezentacje i turnieje. Obecna polska struktura nie dowodzi obsługi dowolnej piramidy.

**Zależności i etapy:** wydzielić definicję rozgrywek od konkretnej bazy PL; zweryfikować migrację i zachowanie istniejącego zapisu; dołożyć mały drugi kraj jako test reguł i terminarza; następnie powiązania międzynarodowe i selekcję reprezentacji; dopiero potem skalować bazę. Reguły naboru, transferów i rozwoju korzystają ze wspólnych identyfikatorów.

**Akceptacja:** każda drużyna ma legalny terminarz i kadrę; awans/spadek zachowuje liczbę miejsc; brak duplikatów uczestników i podwójnie rozstrzygniętych spotkań; czytelny status poziomu symulacji każdej ligi. Reprezentacja powołuje tylko uprawnionych i dostępnych zawodników; turniej nie koliduje bez obsługi z klubową dostępnością.

**Koszt i priorytet:** rozdzielić ligi rozgrywane szczegółowo, aktywne ligi statystyczne i rzadsze agregaty dalszego świata. Wydzielić ładowanie danych i budżety CPU/RAM/zapisu. Stabilna obecna piramida jest konieczna dla 1.0; ograniczone rozszerzenie pożądane; ogromna baza i szeroki pakiet reprezentacji mogą wejść później.

## C. Pochodzenie gracza i akademia startowa

**Istnieje:** [playerCreator.ts](../src/core/playerCreator.ts) ma zwalidowaną datę urodzenia, `nationalityIds = ['PL']` i tę samą procedurę generacji profilu używaną przez karierę. `createCareerState` rozpoczyna akademię Vistula Nova; [youthWorld.ts](../src/core/youthWorld.ts) i resolvery obsługują rzeczywiste kohorty. To rozszerzenie aktualnego kreatora.

**Do rozwoju:** osobne miejsce urodzenia, kraj/region startu i wybór odpowiedniej akademii, także losowej w wybranym regionie. Narodowość, obywatelstwo i uprawnienia reprezentacyjne wymagają odrębnego modelu; miejsce urodzenia nie może samo przesądzać kwalifikacji.

**Zależności i etapy:** po definicji regionów/akademii dodać zwalidowaną konfigurację startu, deterministyczne losowanie z legalnej puli, następnie lokalny kontekst i migrację zapisów; z reprezentacjami dołożyć jawne reguły kwalifikacji. Zachować stabilne ID osoby, kohorty, rodziny historii i datę startu.

**Akceptacja:** ten sam seed i wybór tworzą tę samą osobę/akademię; losowanie nigdy nie wybiera akademii spoza regionu; wybrana akademia ma legalny skład i ligę; stare zapisy zachowują start Vistuli; późniejszy transfer nie zmienia miejsca pochodzenia ani historii.

**Koszt i priorytet:** mała konfiguracja i indeks dostępnych akademii; nie kopiować całego świata do zapisu. Wybór startu jest pożądany dla 1.0, nie stanowi powodu do tworzenia drugiego trybu kariery. Złożone przypadki reprezentacyjne zależą od B.

## D. Pokolenia, rozwój i dostępność

**Istnieje:** [seasonDevelopment.ts](../src/core/seasonDevelopment.ts) ma datowaną projekcję NPC, osiem krzywych rodzin i osobne wyjątkowe zmiany; [development.ts](../src/core/development.ts) rozwój protagonisty przez trening i minuty. [youthWorld.ts](../src/core/youthWorld.ts), granica sezonu, rynek i [worldIntegrity.ts](../src/core/worldIntegrity.ts) obsługują nabory, graduację, emerytury, wyjścia z aktywnego rynku i zabezpieczenie niegrywalnych kadr. Obecne testy `seasonBoundaryLifecycle`, `seasonDevelopment`, `youthWorld`, pełne kariery i `audit:youth` są fundamentem. Urazy i dostępność już istnieją w karierze i meczu.

**Do rozwoju:** kalibracja rozkładów całych pokoleń, późnej regresji, ścieżek specjalizacji i trwałego wpływu środowiska, minut, trenerów oraz urazów. Obecna projektowana krzywa nie zastępuje empirycznie sprawdzonego wpływu całej kariery. Nie należy zwiększać atrybutów wszystkich NPC trwałym rocznym override'em.

**Zależności i etapy:** ustalić populacyjne miary wieku/OVR/potencjału; uruchomić duże próbki 25–40 lat świata z kohortami i pozycjami; oddzielnie korygować nabór, rozwój, regresję oraz podaż rynku; później rozszerzać doświadczenie i środowisko. Każdy etap zachowuje tożsamość osoby oraz idempotencję granicy sezonu.

**Akceptacja:** nie pustoszeją akademie ani kadry seniorów; rozkłady nie dryfują w świat samych gwiazd; istnieją różne szczyty i końce karier; bramkarze i zawodnicy pola zachowują odrębne rozkłady; ponowne przetworzenie granicy nie duplikuje zawodników lub kontraktów; zapis/wczytanie daje ten sam świat.

**Koszt i priorytet:** rzadka delta, indeksy członkostwa i projekcja wieku; mierzyć wzrost zapisu na sezon i koszt resolvera. Stabilność wielopokoleniowa jest konieczna dla 1.0, bogatsze zależności rozwoju pożądane. Audyt dużej populacji jest właściwszy od oceniania jednej kariery z maksymalnym OVR 79.

## E. Siła klubów i kolejność rynku

**Istnieje:** [clubStrength.ts](../src/core/clubStrength.ts) i selektor XI w [footballerWorld.ts](../src/core/footballerWorld.ts) wyprowadzają bieżącą siłę z legalnego składu; statyczny rating jest bootstrapem. `compareClubMarketPriority` w [npcTransferMarket.ts](../src/core/npcTransferMarket.ts) porządkuje kluby po poziomie ligi, reputacji i ratingu bazowym, z deterministycznym ID przy remisie. Budżety, wakaty, potrzeby pozycji i motywacja zawodnika mają już osobne znaczenie. Nie jest to aktualizowany wynikami Elo.

**Do zbadania:** Elo lub pokrewny sygnał wynikowej siły jako jeden składnik inicjatywy transferowej, szczególnie między krajami. Elo opisuje historię wyników, XI aktualny potencjał, reputacja prestiż, finanse możliwość zakupu, a strategia potrzebę. Żaden z tych sygnałów sam nie daje prawa do transferu.

**Zależności i etapy:** odtworzyć obecną kolejność i jej negatywne skutki; dodać diagnostyczne Elo z kontekstem siły przeciwnika/ligi; sparować warianty kolejności przy tych samych kandydatach, budżetach i potrzebach; dopiero po wyniku zmieniać politykę inicjatywy. Rozważyć porcjowaną/równoległą inicjatywę zamiast bezwarunkowego pierwszeństwa każdego silniejszego klubu.

**Akceptacja:** zmiana kolejności jest wyjaśnialna i powtarzalna; biedny lider nie kupuje poza budżetem; słabszy klub ma sensowną ścieżkę rekrutacji; piłkarz może odmówić; zysk XI nie niszczy kadrowej różnorodności i stabilności lig. Elo nie zastępuje kanonicznej jakości XI.

**Koszt i priorytet:** jeden rekord ratingu i aktualizacja po rzeczywistym wyniku; brak ponownego liczenia wszystkich par klubów. Wiarygodny rynek jest konieczny dla 1.0; zastosowanie Elo jest propozycją badawczą, nie obowiązkową architekturą wydania.

## F. Destylowana szybka symulacja meczu

**Istnieje:** [matchEngine.ts](../src/core/matchEngine.ts) obsługuje statystyczne epizody/mecze kariery; [leagueSeason.ts](../src/core/leagueSeason.ts) ma tani `simulateLeagueFixture`. Szczegółowy [matchSimulation.ts](../src/core/matchSimulation/matchSimulation.ts) jest kanonicznym wykonawcą rzeczywiście rozgrywanego meczu. Pochodzenie wyników i wspólny kontrakt mają osobne moduły `careerMatchProvenance`, `careerMatchContract` i `careerMatchSummary`.

**Do rozwoju:** model warunkowych rozkładów wyprowadzony lub skalibrowany z bogatszego silnika: wynik, zdarzenia, minuty, zmiany, dyscyplina, statystyki pozycyjne i konsekwencje fitness. Obecny tani wzór goli lig tła nie jest takim destylatem.

**Zależności i etapy:** najpierw stabilny kontrakt wyników i zweryfikowane mechanizmy szczegółowego meczu; potem wersjonowany zbiór development z różnymi siłami/taktykami/pozycjami/atrybutami/kontekstami; następnie prosty model rozkładów i odłożona walidacja; dopiero potem podmiana konkretnego konsumenta. Nie otwierać zamkniętego confirmation na potrzeby strojenia.

**Akceptacja:** zgodność sum goli, asyst, minut i kartek; sensowne rozkłady warunkowe oraz ogony, nie tylko średni wynik; jawna niepewność poza zakresem danych; jedno rozstrzygnięcie spotkania; szczegółowy wynik protagonisty nie jest nadpisywany modelem tła. Porównywać również niecelne strzały i zerowe wyniki.

**Koszt i priorytet:** koszt próbki i progresu świata, rozmiar zbioru, wersjonowanie modeli i zapisu; prosty model lokalny, bez wymogu usługi sieciowej. Spójność obecnego symulatora jest konieczna dla 1.0. Destylacja zależy od danych i może być etapowa; nie trenujemy jej w PR211.

## G. Newsy i zdarzenia świata

**Istnieje:** [careerStories.ts](../src/core/narrative/careerStories.ts) tworzy ograniczoną projekcję newsów z `historyFacts`, z `factId`, datą i kategorią; istnieją kamienie milowe, warianty narracji, lokalizacja oraz [NewsView.tsx](../src/app/career/NewsView.tsx). Kontrakty, transfery, urazy i osiągnięcia mają już część faktów źródłowych.

**Do rozwoju:** szersze fakty świata dla lig, klubów, transferów NPC i reprezentacji; kontekst rywalizacji i historii spotkań. Narracja może interpretować ważność faktu, lecz nie wymyśla wyniku, transferu lub urazu.

**Zależności i etapy:** audyt źródeł i identyfikatorów faktów; dołożyć brakujące zdarzenia domenowe przy ich właścicielach; potem selekcja istotności i tematy/wątki; na końcu różnorodność tekstów i lokalne konteksty. Wspólne zegary i przypisanie strzelców są zależnością J oraz backlogu.

**Akceptacja:** każdy artykuł wskazuje istniejące fakty; zmiana widoku nie zmienia świata; duplikaty nie mnożą tej samej wiadomości; archiwum i news pokazują zgodne kluby, osoby, daty i wyniki; brak nieuprawnionych przecieków z ukrytych faktów. Testować wydarzenia negatywne, anulowane transfery i własne gole.

**Koszt i priorytet:** indeks/okno faktów i ograniczony feed, bez zapisywania kopii gotowych tekstów dla całego świata. Spójność jest konieczna dla 1.0; bogatsze wiadomości pożądane; rozbudowane wieloletnie rywalizacje mogą przyjść później.

## H. Tożsamość wizualna i grafika

**Istnieje:** [clubVisualIdentity.ts](../src/core/clubVisualIdentity.ts) deterministycznie nadaje i rozwiązuje kolory klubów; [visualIdentity.ts](../src/core/visualIdentity.ts) i renderer mają stabilną prezentację. Znaczna część kariery/meczu używa już prostokątnych, neutralnych kontrolek w [App.css](../src/app/App.css). Jednocześnie pozostały dekoracje i placeholder herbu w `CareerView`; obecność modernizacji nie oznacza zakończonego design systemu.

**Do rozwoju:** przegląd pozostałych oryginalnych zielonych owalnych przycisków we wszystkich ekranach, wspólne tokeny, hierarchia i komponenty, bogatsza identyfikacja klubów i elementy graficzne. Nie usuwać semantycznych kolorów boiska lub strojów z powodu koloru dawnych kontrolek.

**Zależności i etapy:** inwentaryzacja ekranów/styli; spójne tokeny i kontrolki; katalog motywów/tożsamości; pilotaż herbów hybrydowych: wcześniej przygotowane artystyczne elementy rastrowe lub wektorowe + stabilna paleta, dane klubu i deterministyczne reguły kompozycji; następnie cache i wdrożenie. Generowanie zasobów odbywa się poza grą, nie wymaga AI podczas kariery.

**Akceptacja:** to samo ID i wersja dają ten sam herb; motywy i kolory pozostają czytelne na różnych tłach; brak przycisków o nieczytelnym kontraście; kompletne źródło/proweniencja i prawa każdego zasobu, testy kompozycji i fallback. Wymiana biblioteki nie zmienia istniejących klubów bez wersjonowanej migracji prezentacji.

**Koszt i priorytet:** atlas, cache, rozmiar pobierania, pamięć GPU i liczba wariantów; stabilne identyfikatory zamiast osobnej wielkiej bitmapy dla każdego klubu. Spójny interfejs konieczny dla 1.0; bogatsze herby pożądane. PR211 nie tworzy obrazów ani zależności image-generation.

## I. Generowanie stadionów

**Istnieje:** [stadium.ts](../src/app/match/tacticalRenderer/stadium.ts) ma zwalidowaną konfigurację `community`, `compact`, `bowl`, zadaszenia, narożniki, kolory, tunele, światła, ograniczone tłumy i tryby minimal/standard. Seed prezentacji pochodzi z ID klubu; stadion nie jest drugim autorytetem kolizji.

**Do rozwoju:** sensowny związek wielkości/pojemności, zabudowy i detali z akademią, poziomem klubu, regionem i finansami; mniejsze boiska treningowe, bieżnia lub obiekt piłkarski i większa wariantowość trybun. Obecny hash sam nie modeluje poziomu infrastruktury.

**Zależności i etapy:** oddzielić trwałą tożsamość obiektu od parametrów renderera; dodać niewielki katalog archetypów i ograniczenia geometrii; połączyć z klubowymi danymi/infrastrukturą; dopiero potem finansowane rozbudowy i kosmetyka. Zachować uproszczenie dla słabszego sprzętu.

**Akceptacja:** akademia i duży klub dają rozpoznawalne, wiarygodne otoczenia; trybuny nie zasłaniają gry/kliknięć; te same dane odtwarzają obiekt; zmiana detali nie zmienia stanu meczu. Dokumentować pojemność, warianty i związek z tożsamością klubu.

**Koszt i priorytet:** współdzielone geometrie/materiały, instancing, ograniczony tłum i liczba draw calls; pomiary FPS/VRAM na laptopie i telefonie. Większa różnorodność pożądana dla 1.0; rozbudowany rozwój infrastruktury może poczekać. Bez odrębnego city-buildera.

## J. UI wydania i responsywna prezentacja

**Istnieje:** widoki kariery, świata, kalendarza i meczu oraz breakpointy CSS; PR210 naprawia śledzenie bieżącego dnia. Rozbudowany Single Match Lab i eksport diagnostyczny są wartościowym narzędziem development. Samo istnienie breakpointów nie potwierdza użyteczności na telefonie.

**Do rozwoju:** osobna faza przed 1.0: uproszczenie kontrolek meczu, gęstości paneli, hierarchii informacji, nawigacji dotykowej/klawiaturowej, czytelności boiska, przypisania zdarzeń i naturalnego polskiego tekstu. Pełne narzędzia diagnostyczne zachować za jawnym trybem developerskim.

**Zależności i etapy:** wykorzystać istniejący [RELEASE_READINESS_BACKLOG](RELEASE_READINESS_BACKLOG.md) jako rejestr zadań, nie kopiować nowych niezależnych list; mapować przepływy zwykłego gracza i DEV; prototypować uproszczony mecz; następnie wspólne komponenty, format czasu i zdarzeń; testy responsywności i ręczny playtest kariery. Obsługa obecnej fizycznej okazji człowieka pozostaje po stronie core.

**Akceptacja:** uzgodniony zestaw ekranów obejmujący np. 1920×1080, 1366×768, 1024×768, tablet 768×1024 i telefon 390×844; brak niedostępnych akcji, zasłoniętych okien i wymaganego hovera na dotyku. To zestaw proponowany do pomiaru, nie deklaracja dzisiejszego wsparcia. Wszystkie widoki tego samego zdarzenia używają spójnego czasu `45+1`/`90+4`, zespołu i strzelca; diagnoza może pokazywać dokładne sekundy. Sprawdzać duplikaty `Podaj do nogi`, naturalne etykiety debiutu i czytelność historii.

**Koszt i priorytet:** budżet renderowania, zdarzeń pointer i koszt paneli; mierzyć zwykły widok oddzielnie od rozbudowanej diagnostyki. Ten etap jest konieczny dla 1.0. Brak kontroli laboratoryjnych w podstawowym widoku nie oznacza ich usunięcia.

## K. Walidacja długoterminowa i kryteria wydania

**Istnieje:** `npm run verify`, osobne grupy integracji/kontraktu kariery, pełne kariery, audyty świata/ekonomii/młodzieży oraz źródłowe replaye MatchEngine. Skonsolidowane CI ma 28 jobów i zachowuje historyczne kontrakty. Stan `NOT_READY_FOR_PROMOTION` PR201 opisuje profil realizmu, nie unieważnia przyjemności obecnej kariery.

**Etapy i obserwowalne bramki:**

| Warstwa | Kryterium i właściwy rodzaj próby |
| --- | --- |
| Fizyka i decyzje | sparowane sceny, rzeczywiste kontakty/pudła/interwencje, granice informacji, bounded cost, zapis/replay; nie sukces wizualny |
| Pełny mecz | reprezentatywne całe mecze dopiero po lokalnych bramkach, zgodne prawa/zdarzenia/statystyki i brak zablokowanej agency |
| Model statystyczny | odłożone rozkłady warunkowe, zgodność księgi wyniku, kalibracja pozycji i kontekstu; odrębna tożsamość modelu |
| Świat i ligi | wiele krajów/kohort/sezonów, legalne kadry/terminarze/awanse, stabilne ID, idempotentna granica i migracje |
| Ekonomia i transfery | rozliczone zobowiązania, stabilność budżetów, legalne umowy, brak klonów/osieroconych członkostw, sprawczość stron |
| Rozwój kariery | populacyjne przebiegi 25–40 lat, kilka pozycji i środowisk, nabór/retirement/regresja, rozkłady atrybutów i osiągnięć |
| UI i wydajność | udokumentowane rozdzielczości, klawiatura/dotyk, czytelność, FPS, startup, rozmiar zapisu i czas sezonu |
| Grywalna kariera | ręczne długie kariery po zmianach persistent world, feedback i regresje w backlogu; brak znikających faktów po save/load |

**Zależności:** wspólna księga faktów, wersje źródła/modeli/zapisu i dane development. Niezależne confirmation pozostaje zapieczętowane do zamrożonej decyzji integracyjnej. Wynik negatywny, nierozstrzygnięty lub ucięty horyzontem nie znika z mianownika.

**Koszt i priorytet:** pełne populacyjne/karierowe kampanie uruchamiać przy zmianach danej trwałej domeny; codzienne kontrakty mają być małe i szybkie. Mierzyć CPU/wall/RAM, stan serializowany i wzrost zapisu. Warstwowe kryteria i stabilny zapis są konieczne dla 1.0; nie mnożyć pełnych macierzy po każdym lokalnym eksperymencie.

## Decyzja integracyjna produktu

Najbliższa zależność fizyczna jest opisana w [raporcie PR211](PR211_CANONICAL_PENDING_STRIKE_LIFECYCLE.md). Utrzymany kandydat realizmu pozostaje PR201; domyślna polityka B, 40 Hz i 28 atrybutów pozostają. Przyszły profil realizmu ma łączyć sprawdzone, kompatybilne mechanizmy przez [istniejącą architekturę](match-engine/INTEGRATION_ARCHITECTURE.md), z jawnymi wykluczeniami historycznych wariantów. Nie należy włączać ich wszystkich naraz.

Żaden ze strumieni A–K nie jest implementowany w PR211. Następne zakresy wybieramy według ryzyka, korzyści dla kariery i rzeczywistych zależności; nie przypisujemy każdemu systemowi arbitralnego numeru PR. Celem wydania jest kompletna, przyjemna kariera, wsparta wiarygodnym silnikiem i światem.
