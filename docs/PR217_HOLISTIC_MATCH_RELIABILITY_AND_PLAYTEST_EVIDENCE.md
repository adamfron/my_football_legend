# PR217 — Holistic Match Reliability and Playtest Evidence

PR217 naprawia konkretne przejścia stanu z sesji właściciela. Nie wprowadza nowego
szkieletu, parametrów kondycji ani korekty skuteczności podań. Receptura pozostaje
eksperymentalna; kandydat PR201/B, 40 Hz, 28 atrybutów i zamknięte confirmation są zachowane.

## Etapy pracy i decyzja integracyjna

1. Zamrozić wejście i odtworzyć rzeczywistą ścieżkę człowieka, oddzielając runtime'y.
2. Zidentyfikować pierwsze błędne przekazanie fizycznego stanu oraz blokadę wznowienia.
3. Naprawić producentów stanu i jawnie zatrzymać nierozwiązywalny krok.
4. Uzgodnić tożsamości prób, kontaktów, podań i statystyk; sprawdzić sprawczość.
5. Sprawdzić zapis/odczyt, długie kontynuacje, UI i historyczne źródła; dopiero wtedy
   ustalić gotowość następnej integracji.

**Research change:** zachowanie stanu piłki na przekazaniach legacy → shared timeline,
aktualny zamiast historycznego warunek dopuszczenia zmiennika, rozdzielone przyczyny
kontroli piłki oraz gotowość człowieka do przerwania autonomicznego prowadzenia.
**Local result:** rzeczywisty incydent i zapisany aut mają wykonywalne regresje.
**Integration effect:** błędny krok nie zatwierdza części czasu, ruchu, statystyk ani
obciążenia; `safetyHalt` jest zapisywalnym stanem diagnostycznym.
**Promotion decision:** RETAIN_EXPERIMENTAL, bez formalnego COMPLETE.
**Next dependency:** kontrakt fizycznego ciała i stopy z PR218, poprzedzony opisanymi
poniżej bramkami niezawodności.

## Źródło i granice odtworzenia

- Repozytorium bazowe: `d91852decfc523a2403460536ccc96da12c6ee17` (merged PR216).
- Fixture `fixture-ca51ee4b`, seed `lab-mw3xhr6o`, home `pro_9`, away `pro_1`;
  człowiek `footballer_pro_9_12`, wymuszony w XI, `state-value-v1`.
- `holistic-physical-dev-v1`: event-v1 / contact-v1 / low-pass-dev-v1 /
  standing-contact-dev-v1 / upright-cluster-dev-v1; krok 0,025 s.
- `experimentalRestartPreparation=false` w oryginale; naprawa nie wymaga jego włączenia.
- Oryginalne bajty: SHA256 `836c2ba9b7953ddfe1f9b87af59a9aa82ea38f4ed1dcb0cf832888b492afb87f`.
  [Bezstratny zapis](performance/pr217/user-session-original.json.gz),
  [audyt](performance/pr217/user-session-audit.json),
  [wejście meczu](performance/pr217/session-input.json.gz).

Node i Edge rozchodzą się już około 2,025 s, przed wyborem człowieka. Ten sam seed
nie jest dowodem odtworzenia oryginalnej ścieżki. Dlatego incydent odzyskano w Edge:
pierwszy wybór 70,425 s to kontekstowe `close_down` na `footballer_pro_1_7`, drugi
223,425 s to dośrodkowanie `restart-2`. Zbadano alternatywy; zwykłe contain/challenge
rozchodzą się od próbek właściciela już około 72 s. Zachowane pliki
`recovered-first-choice`, `recovered-second-choice`, `browser-to-second-choice` i
`browser-first-physical-incident` dokumentują odzyskanie, a nie nowy losowy mecz.
Stary kod bazowy uruchomiony z odzyskanego checkpointu także odtwarza pierwszy błąd
(`original-native-reconstruction.json`). Po fizycznej naprawie trajektoria ma prawo
odbiec od starej porażki.

## Incydent 04:55: rzeczywiste powierzchnie i producent

Pierwsze `initial_penetration` powstaje w 295,700000000005 s: piłka i **lewy but
footballer_pro_9_19**, nie nakładające się tułowia. Dwanaście późniejszych wpisów
unresolved to powtarzane skutki tego stanu.

Legacy challenge między `9_19` i `1_3` został zatwierdzony w 295,575 s. Przy jego
rozstrzygnięciu `loose_ball` w 295,700 s `makeLoose` zachowywało XY, ale usuwało
wysokość, pionową prędkość i spin rzeczywiście odbijającej się piłki. Następny
wykonawca interpretował brak wysokości jako środek piłki 0,11 m nad murawą.

| Wielkość przy przekazaniu | Stary producent | Poprawiony producent |
| --- | --- | --- |
| Piłka XY | 58,2994249636; 42,6306709913 | identyczne |
| Wysokość środka | brak → 0,11 m | 0,135546464849 m |
| Prędkość pionowa | utracona | −1,023179060274 m/s |
| Luka powierzchni but–piłka | −0,008342357526 m | +0,006342122992 m |
| Następny kontakt | initial penetration | 295,703568820321 s, rzeczywisty but `9_19` |

Ostatni rozdzielony stan 295,675 s ma piłkę na wysokości 0,158066091958 m i lukę
+0,047534 m. Promienie 0,11 / 0,035 m, tolerancje, masy i prawa impulsu nie zmieniają
się. Zachowano diagnostyczne XY, prędkości, spin, położenie buta i domykanie w
`incident-contact-trace.json`, `incident-corrected-contacts.json` i
`incident-before-handoff.json.gz`. Poprawiona kontynuacja Edge do 340,025 s nie
generuje unresolved (`browser-physical-fixed-v1.json.gz`).

Dłuższe próby znalazły analogiczny reset wysokości w historycznym podaniu górnym
i dośrodkowaniu. W wybranej rodzinie upright przekazują one istniejącą wysokość
i spin; nie jest to migracja tych technik do nowego fizycznego kopnięcia.

## Dlaczego wznowienia Play wykonywały tylko kilka klatek

Stary UI reagował na narastający historyczny licznik unresolved. Solver mógł
wykluczyć nierozstrzygnięty kontakt i kontynuować resztę kroku; ponowne Play
odkrywało tę samą wadliwą geometrię. PR217 zachowuje pierwszy niepoprawny krok
jako `safetyHalt`: świat wraca do wejścia kroku, a świadek błędu pozostaje.
Ponowne wywołanie kroku zwraca ten sam obiekt. Żadne dalsze Play nie przepycha
piłki ani zawodnika przez kontakt. UI pokazuje jeden komunikat, blokuje przycisk
wznowienia i prowadzi do istniejącej diagnostyki/eksportu DEV. Zwykła pauza,
decyzja człowieka i wznowienie po pauzie zachowują odrębne zachowanie.

## Aut 2170 s: dlaczego nie istniał retrieval

Końcowy zapis 3627,5 s nadal jest w pierwszej połowie, `preparing`, bez retrieval.
Zmiana away `1_22 → 1_23` była rozpoczęta; schodzący opuścił boisko w 2176,325 s,
wchodzący dotarł do dozwolonego miejsca wejścia (52,5; 0,5).

Warunek przyjęcia zmiennika sprawdzał **istnienie dowolnego historycznego
unresolved**, więc dwanaście wpisów z 295 s blokowało go na zawsze.
`substitutionBlocksRestart` kończyło krok przed `prepareRestartMovement`.
Brak retrieval był skutkiem tej blokady, nie dowodem wyłączonej mechaniki autu.

Porównanie liczby unresolved przed i po **aktualnym przedziale wejścia** odróżnia
stary ślad od nowego konfliktu. Zapisany checkpoint dopuszcza `1_23` w następnym
kroku, potem tworzy retrieval. Obserwujemy approach → transport → placed → release
→ open_play; stary licznik 12 pozostaje. Nowy konflikt w przedziale nadal blokuje
wejście (osobny test). Nie ma autoposiadania ani teleportu.

Zegar straconego czasu był nadal naliczany w nieskończonym postoju, oddalając koniec
połowy. Nie wprowadzono globalnego zatrzymania zegara. Diagnostyka rozróżnia teraz
człowieka, zmianę, retrieval, ustawienie oraz brak właściciela lifecycle i raportuje
aktualny cel ruchu. W wybranej recepturze rzeczywisty brak postępu kończy się jawnym
zatrzymaniem diagnostycznym, zamiast pozorną rozgrywką.

## Dodatkowe granice ujawnione przez dłuższe kontynuacje

- Zatrzymana piłka po aucie mogła stale zachowywać `travelKind=throw_in`, omijając
  istniejące odzyskanie luźnej piłki. Dopiero rzeczywista nieruchoma, przyziemna
  piłka bez właściciela przechodzi do `finishUnclaimedDelivery`; położenie,
  wysokość, prędkość i spin są zachowane, nikt nie otrzymuje posiadania.
- Historyczne wznowienie mogło stawiać tułów wykonawcy na piłce i przekazywać już
  penetrujący but do shared timeline. Skończony cel podejścia 0,50 m od rzeczywiście
  położonej piłki mieści się
  w istniejącym limicie wykonawcy 1,4 m i zasięgu wypuszczenia 0,82 m. Przy linii
  podejście jest skierowane do wnętrza istniejącego obszaru gry. Rzeczywisty ruch
  musi doprowadzić stopy do rozdzielenia i zasięgu; readiness nie odsuwa ciał.
  Regresje pochodzą z zapisanych stanów free_kick_far i rożnego.
- Nie twierdzimy, że legacy restart wykonuje nowy skończony zamach. Wspólny
  kontrakt stopy i historycznego wypuszczenia pozostaje zadaniem dalszej integracji.

## Uzgodnienie podań i fizycznych prób

Audyt zawiera **309 unikalnych passId**, dokładnie tyle co kanoniczne próby.
107 pochodzi z kontaktów przygotowanego niskiego kopnięcia, 202 z pozostałych
historycznych wypuszczeń. 396 przygotowanych prób kończy się jako 107 kontaktów,
280 pudeł, 8 przerwań i 1 anulowanie. Pudło zamachu nie jest wypuszczonym podaniem.

Ledger ma 178 completed / 92 intercepted / 26 out_of_play / 13 technical_error;
kanoniczne statystyki zaliczają 143/309. Wynik `completed` oznacza odzyskaną
kontrolę drużyny, natomiast zaliczenie wymaga rozwiązania, kontaktu, dostępnych
uczestników i innego odbiorcy niż podający. Odzyskanie własnej piłki może być
completed bez zaliczonego podania. Oryginalny eksport nie zawiera actualReceiverId,
actualContactPoint ani powodu wykluczenia dla każdej próby: **nie da się uczciwie
przypisać wszystkich 35 różnic konkretnym przyczynom**.

Wspólny `passCompletionCredit` zachowuje dotychczasowy warunek statystyk i dopisuje
w przyszłych holistycznych eksportach actualReceiverId, resolvedAt, contact point
oraz completionCredit. Zwykły profil zachowuje historyczny format telemetryczny.
Ten powód kwalifikuje zdarzenie; finalny licznik nadal sprawdza dostępność
uczestników. Nie zastępuje to kanonicznego rejestru zaliczonych tożsamości.
Średnia prognoza 0,8868676 dotyczy geometrycznej możliwości odbioru po wypuszczeniu;
nie przewiduje prawdopodobieństwa trafienia zamachem w piłkę. Utrzymanie posiadania
jest kolejnym, odrębnym wynikiem. Nie zmieniono prognoz ani celności dla zgodności liczb.

## Posiadanie, człowiek i środkowi pomocnicy

Oryginał ma 321 zmian posiadania, 261 opisanych jako interception, 25 mikroepizodów
i 5 sąsiadujących odwróceń. Wspólny wykonawca nazywał każdy odbiór przeciwnika
interception. Teraz jest to interception dla aktywnego przychodzącego podania bez
wcześniejszego looseSince; odzyskanie już luźnej piłki jest claim. Fizyczny kontakt
i kontrola nadal są wymagane. Nie ma cooldownu posiadania ani tłumienia statystyk.

Kontrolowany pomocnik: 40 kontaktów, 7 otrzymanych podań, 17 prób, 4 strzały i 62
prowadzenia. Tylko 16 meaningful decyzji: 1 obronna i 15 wznowień, zero ordinary
on_ball. To 11,909 na 45 aktywnych minut zawodnika; UI 117 razy delegowało rutynę,
3 razy jedyną opcję. Nie jest to licznik wszystkich decyzji AI.

Jedna wykazana blokada: `isActionResolutionInProgress` traktowało autonomiczny
ballCarrierIntent jako nieprzerywalny, również gdy człowiek faktycznie miał gotowy
kontakt i znaczące alternatywy. Wąski wyjątek dotyczy gotowego właściciela bez
aktywnego wyboru człowieka; zachowuje bramkę PR210 przeciw nieosiągalnym kopnięciom.
Test wymaga kilku rzeczywistych opcji z piłką, nie przydziału decyzji według kwoty.
Jawne wybranie retain może nadal długo podtrzymywać zamiar: negatywny stan
`retain-recovery-v2` pozostaje dowodem, a nie domniemaną naprawą.

| Home — rola / zawodnik | Cele podań | Otrzymane podania |
| --- | --- | --- |
| CM `9_11` | 17 | 8 |
| CM `9_12`, człowiek | 10 | 7 |
| CM `9_14` | 11 | 5 |
| LW `9_17` | 42 | 12 |
| RW `9_19` | 24 | 8 |
| ST `9_22` | 30 | 13 |

Do człowieka podawali `9_14` (3 próby/2 completed), `9_22` (2/2), `9_7` (2/2),
`9_19` (1/1), `9_17` (1/0) i `9_9` (1/0). Cele nie są kontaktami odbiorcy.
Siedem otrzymanych podań przez środkowego pomocnika uzasadnia dalszą analizę,
ale nie dowodzi błędu samego rankingu. Zachowano cały passingNetwork, wybrane
cele, zawodników i trajektorie. Nie dodano premii za rolę ani minimalnej liczby
podań do środka. Kontakt, czas przygotowania, osiągalność i kanał podania muszą
być badane razem w PR219.

## Kondycja i fizyczne pudła: diagnostyka, nie kalibracja

Obserwacja właściciela około 8 min (75% capacity, 2% burst) nie ma w oryginalnym
eksporcie odpowiadającego checkpointu fitness; nie przedstawiamy jej jako
odtworzonego pomiaru. Zachowano końcowy workload i okresowe próbki nowych przebiegów.
Test rzeczywistego incydentu potwierdza dla wszystkich graczy przyrost workload.seconds
równy upływowi czasu; nie wykazano tu podwójnego naliczania. Zatrzymany błędny krok
nie zatwierdza fitness. To nie waliduje całego modelu wysiłku ani ścieżek przygotowania.

280 fizycznych pudeł w 396 przygotowanych próbach pozostaje istotnym wynikiem
negatywnym. Kolejne receipts zapisują przygotowanie, prędkość piłki, wynik zamachu
i reprezentatywne przykłady różnych prędkości. Nie zmniejszono błędu dla uzyskania
ładniejszej skuteczności. Przygotowanie stopy, błąd czasu, obserwacja i przyjęcie
stanowią zależności PR218/219; protokoły obciążeń i regeneracji należą do PR220.

## Zapis, przeglądarka, pełne mecze i koszt

**Bramka kolejnej integracji ciała: NOT_READY / RETAIN_EXPERIMENTAL.**
Nie ma jeszcze dowodu, że poprawiona oryginalna trajektoria kończy pełny mecz.

| Próba | Wynik | Dowód / zakres |
| --- | --- | --- |
| Dokładny odzyskany incydent w Edge | poprawiona kontynuacja do 340,025 s | `browser-physical-fixed-v1.json.gz`; nowa trajektoria po 295,700 s |
| Local source-bound CI | PASS | oryginalny kontakt, rzeczywisty aut i zatrzymanie niepoprawnego wejścia; `--check` |
| Zapisany aut → długa kontynuacja | przerwa 4269,150000008 s; druga połowa; halt 4273,975000008 s | `full-checkpoint-final-v5.json.gz`, `body_count_bound`; stary postój i stracony czas są częścią zapisu |
| Odzyskany stan przed incydentem → długa kontynuacja | halt 1037,724999999 s | `full-incident-final-v4.json.gz`, `bounded_search_exhausted`, przygotowany zamach `9_7` |
| Świeże dokładne wejście fixture, runtime Node | halt 2576,900000005 s, pierwsza połowa | `full-input-final-v5.json.gz`, `bounded_search_exhausted` przy `9_7`; 44 jawne wybory człowieka i 44 reload checkpoints; nie jest to oryginalna trajektoria Edge |
| Ordinary baseline PR216 | full_time 5782,100000006 s, identyczny terminal | `full-baseline-final-v1.json.gz`, 231285 ticków, hash `536c0cc92dce5a8649dc24c9021bcb0037a6661d3d876d12d19ee3fed9f9b6d3` |
| Oryginalny checker PR216 w drzewie main | PASS | `scripts/ci/replayPr216Check.mjs`, oryginalne asercje i receipts |
| UI Edge 155.0.4283.45 | PASS, 1366×768 i 1920×1080 | `browser/report.json`, 10 sprawdzeń na viewport, zero pageerror |
| Produkcyjny build w Edge | PASS, oba viewporty | `browser/production.json`, normalne rozpoczęcie meczu, Play i pauza; bez montowania fixture |

UI obejmuje normalne menu z domyślną zwykłą fizyką, wybór receptury/polityki/seedu,
halt rzeczywistego niepoprawnego stanu, niezmienność po kolejnym kliknięciu,
eksport, pojedyncze wznowienie poprawionego stanu, normalną pauzę oraz rzeczywiste
menu on_ball i kliknięcie kontekstowego podania. Sceny kontaktu i on_ball montują
ten sam RunningLabGuard w DEV z kanonicznym checkpointem; nie udają pełnego
ręcznego przejścia od ekranu startowego do 6 min. Próba wybranego przez człowieka
podania w 372 s faktycznie kończy się fizycznym pudłem — test nie wymusza trafienia.

Każda minuta długiej próby i granica połowy mają natywną kontrolę ośmiu kolejnych
ticków po JSON + Zod reload. Native identity nie oznacza bitowej zgodności
Node/Edge ani Windows/Linux. Źródłowe archiwa wiążą każde wydanie; późniejsza
korekta testu UI nie zmienia rdzenia zmierzonych długich prób.

W częściowym `full-incident-final-v4`: 132 przygotowane kopnięcia obejmują 43
kontakty, 88 pudeł i 1 unresolved, 122 podania w tabeli tożsamości oraz 461 nowych
kontaktów ground. Przykłady: piłka nieruchoma → kontakt; 1,74187 m/s → pudło.
W tej próbie nie wystąpił przykład kategorii fast; nie zaliczamy jej jako ocenionej.
Osobna świeża próba Node zachowuje wszystkie trzy kategorie: 0 m/s, 4,59209 m/s
i 5,53377 m/s — te trzy wybrane zamachy są pudłami. Jej 496 rozstrzygniętych
przygotowanych prób to 135 kontaktów, 348 pudeł, 11 przerwań i 2 anulowania;
końcowe unresolved dotyczy innego kontaktu stojącej stopy, poza tą tabelą zamachów.
Mecz zatrzymał się po 742,05 s dalszej gry, 112,16 s wall. Ordinary full match
zajął 281,09 s wall, max RSS około 776 MiB. To różne trajektorie i zakresy;
nie przedstawiamy ich jako porównania kosztu pełnego holistic vs baseline.
Świeża próba Node trwała 346,77 s wall do 2576,90 s; saved-checkpoint continuation
95,48 s wall do 4273,975 s. Koszt podano dla faktycznego zakresu każdej próby.

Otwarty `bounded_search_exhausted` wymaga rozstrzygnięcia konserwatywnego
wyszukiwania bliskiej trajektorii buta i piłki. `body_count_bound` oznacza grupę
poza zakresem istniejącego solvera do pięciu ciał. Nie zwiększono limitów, nie
wyłączono kontaktów i nie zamieniono unresolved w pudło. To jawne blokery
wiarygodności następnego etapu, zachowane wraz z ostatnimi 80 stanami.

Każdy receipt podaje fingerprint źródeł; archiwa `source-<hash>.json.gz` zachowują
także wcześniejsze, nieudane edycje. `--check` pisze wyłącznie scratch, więc nie
nadpisuje historycznego dowodu. Oryginalne PR195–216 i package/lockfile są sprawdzane
przez `checkPr217Source`. Historyczny PR216 uruchamia się we własnym kodzie z main,
z oryginalnymi asercjami; nowy check PR217 mieści się w istniejącym jobie CI.

Sam pełny mecz nie promuje wszystkich mechanizmów. Nowe przebiegi są rozwojowe,
z jawnymi decyzjami testowego człowieka (pass-first, następnie pierwsza dostępna
opcja); nie są replayem niezapisanego ciągu decyzji właściciela po naprawie ani
niezależnym confirmation. Każda porażka zostaje zapisana przed asercją full_time.

## Odpowiedzi na completion questions

Końcowa weryfikacja techniczna: **`npm run verify` PASS**, exit 0, 2734 testy
(2669 unit + 56 integration + 4 career-match contract + 5 full-career), końcowy
TypeScript/Vite build. Kontrakty obejmują rzeczywisty pełny mecz U-17 oraz dwukrotne
odtworzenie pełnego meczu z zapisem, odczytem i odrzucaniem duplikatów wyniku.
Po końcowych edycjach powtórzono 111 testów ukierunkowanych, finalne 12 regresji,
lint, typecheck, build oraz UI. Pełny verify działał w czasie końcowego opracowania
regresji; wynik nie jest przedstawiany jako atomowy benchmark źródeł.

Source-bound długie próby mają natomiast dokładnie te same pliki wykonywanej
aplikacji (bez `.test.*`) co finalna gałąź: hash manifestu
`b0da58414c150e36e870c20c4d006169f316615fcf2f6c2322df89552ede8ecc`.
[Weryfikacja, tożsamości źródeł i zakresy](performance/pr217/verification.json),
[pełny log verify](performance/pr217/verify-final-v1.txt.gz).
`ci:manifest`, render workflow, siedem kontraktów CI i oryginalny PR216 checker
przechodzą. Zachowano 124 komendy, 144 przypadki, 28 jobów i 63 historyczne
przypadki pełnych meczów; całej macierzy historycznej nie wykonano lokalnie.
Zdalny CI jest osobnym przebiegiem PR, a nie domniemanym lokalnym sukcesem.

1. **Co przenikało?** Lewy but `footballer_pro_9_19` i piłka po utracie rzeczywistej
   wysokości w legacy challenge; nie body–body.
2. **Dlaczego Play dawało kilka klatek?** Błędna geometria była ponawiana, a UI
   reagował na narastający świadek. Nowy jawny halt zachowuje wejście błędnego kroku.
3. **Dlaczego nie przygotowano autu?** Historyczny unresolved blokował przyjęcie
   zmiennika i wyjście z substitution branch przed utworzeniem retrieval.
4. **Czy przechodzimy oba incydenty i przerwę?** Oba zapisane incydenty przechodzą
   osobno; rzeczywisty zapis autu osiąga przerwę i drugą połowę. Jedna kontynuacja
   odzyskanego stanu z 295 s zatrzymuje się na nowym unresolved w 1037,725 s.
   Nie sklejamy tych trajektorii w jeden dowód przejścia oryginalnego meczu.
5. **Czy ta sama sesja kończy mecz?** **Nie wykazano.** Dwie wymienione kontynuacje
   zatrzymują się jawnie, bez invented outcomes. Pełny sukces ordinary baseline
   nie zmienia tej decyzji; PR218 nie dostaje zielonej bramki niezawodności.
6. **Skąd różnice statystyk?** Prognoza możliwości odbioru, fizyczny zamach,
   wypuszczone podanie, kontrola drużyny i zaliczenie statystyczne mają różne
   mianowniki. Brak per-attempt dowodu w oryginale jest osobno zgłoszoną luką.
7. **Czy interception jest obronione fizycznie?** Fizyczny acquisition pozostaje;
   poprawiono etykietę luźnego odzyskania. Sama nazwa zdarzenia nie certyfikuje kontaktu.
8. **Dlaczego brak on_ball?** Wykazano nieprzerywalny autonomiczny carry mimo
   gotowości człowieka; ograniczenia PR210 i dobór istotnych wyborów nadal obowiązują.
9. **Czy kondycja jest naliczana dwukrotnie?** Nie w sprawdzonym rzeczywistym
   przedziale. Brak dowodu minute-eight i walidacji całego protokołu pozostaje jawny.
10. **Co przed wspólnym szkieletem/grafiką?** Stabilne handoffy, skończona geometria
    stopy i ruchu, zapisane przypadki negatywne, ciągłość wznowień i pełne próby
    bez nierozstrzygniętego kontaktu. Następnie jeden autorytatywny kontrakt ciała.
