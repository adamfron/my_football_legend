/* global console */
import { readFileSync, writeFileSync } from 'node:fs';
const get=(n)=>JSON.parse(readFileSync(`docs/performance/PR175-${n}.json`,'utf8'));
const dist=get('independent-match-distributions'), funnel=get('possession-to-shot-funnel'), cadence=get('passing-cadence'), recycling=get('possession-recycling');
const shooting=get('shooting-outcomes'), combo=get('combination-conversion'), positions=get('positional-involvement'), paired=get('merged-baseline-comparison');
const control=get('controlled-mechanisms'), natural=get('natural-counterfactuals'), adaptation=get('pressing-and-adaptation'), perf=get('performance'), verification=get('verification');
const freeze=get('candidate-freeze'), validation=get('post-correction-validation'), career=get('career');
const territory=get('territory-to-danger'),historicalGoals=get('historical-goal-sources'),keepers=get('goalkeeper-and-corners');
if(dist.status!=='complete'||verification.verify!=='PASS'||validation.status!=='complete') throw new Error('Cannot publish an incomplete research/verification report');
const n=(v,d=2)=>Number.isFinite(v)?v.toFixed(d):'n/a', pct=(a,b)=>b?n(100*a/b)+'%':'n/a';
const fresh=dist.groups.fresh12, stages=funnel.stages;
const table=(rows)=>rows.map((r)=>`| ${r.join(' | ')} |`).join('\n');
const outcomeByVariant=Object.fromEntries([...new Set(control.rows.map((r)=>r.variant))].map((v)=>[v,control.rows.filter((r)=>r.variant===v).reduce((a,r)=>{const k=r.diagnostic?.outcome??'unresolved';a[k]=(a[k]??0)+1;return a;},{})]));
const completedKinds=Object.entries(combo.endings).filter(([k])=>k.endsWith(':completed')).map(([k,v])=>`${k.split(':')[0]}=${v}`).join(', ');
const roleCM=positions.roleTotals.central_midfielder, allReceptions=Object.values(positions.roleTotals).reduce((n,p)=>n+p.receptions,0);
const credibleAlternatives=Object.entries(funnel.credibleAlternativeChoices).map(([k,v])=>`${k}=${v}`).join(', ');
const selectedTotal=funnel.allOwnerShotSelections+funnel.incomingShotSelections;
const originalPairs=paired.rows.filter((r)=>r.cohort==='original16'), reservedPairs=paired.rows.filter((r)=>r.cohort==='examined8');
const sum=(rows,key,side)=>rows.reduce((s,r)=>s+(r[side][key]??0),0);
const fence='```';
const questions=[
  `Tak: 16 historycznych i 8 wcześniej obejrzanych pełnych meczów na scalonym d6556eba. Cały stan zmienił się w ${paired.rows.length-paired.identicalFinalStates}/${paired.rows.length} par względem K; identyczne hashe wejść.`,
  `12 nowych seedów/projektów: 6 development +6 zamkniętej walidacji. Zero lustrzanych duplikatów w nowym zbiorze; wspólna populacja dwóch U-17 ogranicza wnioski populacyjne.`,
  `StatsBomb Open Data, commit 4b73468f…: 12 pierwszych chronologicznych grupowych MŚ 2022 oraz 12 pierwszych dostępnych Bundesliga 2023/24, okresy 1–2. Seniorzy nie są targetem U-17.`,
  `Tak: ${n(fresh.match.passesAttempted.mean)} podań/mecz wobec ${n(dist.groups.club12.match.passesAttempted.mean)} w klubowej referencji bez crosses. Zobacz także per-90 i rozkład, nie tylko średnią.`,
  `Ekspozycja live=${n(fresh.totals.liveSeconds/12/60)} min/mecz + krótki cykl kontroli/lotu + powtarzalna cyrkulacja przy rzadkim groźnym dostępie. To razem zwiększa clock totals. Nie zidentyfikowano jednego wadliwego współczynnika ani pozornych pass-ticków.`,
  `Mediana control→release ${n(cadence.controlToRelease.median)} s, release→resolution ${n(cadence.flightSeconds.median)} s; ${cadence.reciprocal} kolejnych wymian zwrotnych. Brak porównywalnego realnego zegara kontaktów, więc nadmiernej prędkości fizyki nie uznano za dowiedzioną.`,
  `${recycling.lowNetCirculation}/${funnel.episodes} epizodów ma >=4 podania i <5 m zachowanego postępu; ${recycling.recycledExcursion} oddaje >=10 m wcześniejszego zysku. Część cyrkulacji jest konstruktywna; sama długość nie oznacza defektu.`,
  `Przede wszystkim przed dobrym dostępem: ${stages.controlled} posiadań → ${stages.final_third_control??0} z final-third control → ${stages.penalty_area_control??0} z box control → ${funnel.credibleEpisodes} z wiarygodną heurystyczną okazją. Etapy nie są obowiązkowo liniowe.`,
  `${funnel.credibleDecisionObservations} rzeczywistych obserwacji decyzji w ${funnel.credibleEpisodes} epizodach. To proxy modelu, nie walidowane real-world xG ani tyle niezależnych szans.`,
  `${funnel.credibleWithShotCandidate} z tych obserwacji zawiera shot candidate; ${funnel.credibleWithoutShotCandidate} nie zawiera. Pełne ranking calls są w archiwum.`,
  `Wiarygodne alternatywy: ${credibleAlternatives}; wybrany strzał ${funnel.credibleSelectedShot}. Kolejne obserwacje tej samej okazji są zależne.`,
  `${selectedTotal} wybranych w owner/incoming hooks; ${funnel.releaseChoiceLinks} powiązanych fizycznych releases. Wszystkie strzały all-phase=${shooting.shots}; restarty mogą ominąć owner hook. Niepowiązane selekcje=${funnel.selectedWithoutRelease.length}.`,
  `Rzadkie kontrolowane wejścia i dobre geometrie, następnie częste carry/pass zamiast marginalnego strzału. Brak dowodu masowego gubienia już zaakceptowanych rutynowych strzałów w przygotowaniu.`,
  `Historyczne 24 mają ${historicalGoals.goalSources.penalty??0}/${historicalGoals.goals} goli z karnych; nowe 12: ${shooting.goalSources.penalty??0}/${shooting.goals}. Same karne nie wyjaśniają wysokiej konwersji: historyczny kontekst open_play daje ${historicalGoals.byContext.open_play.goals}/${historicalGoals.byContext.open_play.shots} goli/strzałów, nowy ${shooting.byContext.open_play.goals}/${shooting.byContext.open_play.shots}. Naturalna selekcja małego dystansu jest istotną wskazówką; nie rozdzielono ilościowo błędów accuracy/GK/wyboru sytuacji. Block/save→goal zachowuje ten sam shot ID.`,
  `Score transitions=${shooting.goals}; duplicate release IDs=${shooting.duplicateReleaseIds}, duplicate goal IDs=${shooting.duplicateGoalIds}; bez powiązanego release poza own-goal=${shooting.missingRelease.length}. Wcześniejsze kohorty K zachowano bez zmian.`,
  `Final outcomes: ${JSON.stringify(shooting.finalOutcomes)}. Oficjalne saves=${perf.officialSaves??fresh.totals.saves}; początkowy block/save może współistnieć z późniejszym golem tego samego ID.`,
  `Fizyczna osiągalność i kontakt działają w 208 próbach; naturalne interwencje są zbyt nieliczne do oceny populacyjnej jakości. Base=${JSON.stringify(outcomeByVariant.base)}, weak keeper=${JSON.stringify(outcomeByVariant['keeper-38'])}.`,
  `${fresh.totals.corners} naturalnych rożnych; ${keepers.cornerAttribution.audited} zbadanych granic, ${keepers.cornerAttribution.mismatches.length} rozbieżności linii końcowej/ostatniego kontaktu obrońcy/strony wznowienia. Brak sztucznych kontaktów; częstość daleka od referencji.`,
  `${combo.completed} ukończonych: ${completedKinds || 'brak'}. Completion nie jest certyfikatem groźnej okazji.`,
  `${combo.withCredibleSubsequentChoice} ukończonych ma potem wiarygodną decyzję runnera w tej samej kontroli po konkretnym podaniu kontynuacji, przed jego następnym fizycznym podaniem; ${combo.withAttributedShot} ma powiązany strzał. To asocjacja z zachowaną tożsamością, nie randomizowany efekt.`,
  `CM ${roleCM.receptions}/${allReceptions} przyjęć (${pct(roleCM.receptions,allReceptions)}), ${n(roleCM.receptions*90/roleCM.minutes)} /player-90. Wagi minut/formacje jawne; brak duty-time ledger nie pozwala uznać całej roli za skalibrowaną.`,
  `W tej samej otwartej geometrii gifted/ordinary receiver quality=0.983/0.770, lecz retained estimate jest nasycony na 0.96 w obu; oba przyjęcia są bezpieczne. Wygrywa inny CM. To wyjaśnia tę parę, nie dowodzi ogólnego ignorowania skill ani uzasadnienia uniwersalnego bonusu.`,
  `Naturalne ending counts są w receipt. W kontrolowanym underlap open/timed/recovering wybrano inną akcję, weak wygasł, covered nie dostał intencji; nie ma podstaw do usunięcia asekuracji.`,
  `Pięć wariantów centralnego pressingu kończy się stratą. Timed support daje lokalny postęp, ale nie ukończoną kombinację/strzał. Nadal brak dowodu skutecznej ogólnej ucieczki z pressingu.`,
  `Adaptation ma niezerowy człon w ${adaptation.actualPassChoicesWithAdaptationTerm} wybranych podaniach, ale 10 kontrolowanych różnych historii/kontekstów nadal otwiera carry. Nie wykazano ogólnej poprawy wyniku adaptacji.`,
  `Nie wdrożono globalnej agresji. Lokalne kontrfakty zachowują wszystkie straty i wyniki; canonical loss po strzale/golu nie jest automatycznie turnoverem obronnym. Więcej prób bez gola nie dowodzi lepszego futbolu.`,
  `Nowe 12: faule ${fresh.totals.fouls}, yellow ${fresh.totals.yellowCards}, red ${fresh.totals.redCards}, accepted tackle attempts ${fresh.totals.tacklesAttempted}. Rozkład jest opisowy i stratyfikowany; nie potwierdza populacyjnego targetu sędziego.`,
  `Nie przyjęto nowej poprawki produkcyjnej. Potwierdzono i poprawiono diagnostyczne przypisanie stale retained restart/boundary hints oraz odróżniono self-reclaim od ukończonego podania. Fizyka/AI/format save pozostają byte-identical.`,
  `Wsparte: mała podaż niebezpiecznych kontrolowanych geometrii, gęsta realna cyrkulacja, ranking marginalnych strzałów poniżej carry/pass, słaba konwersja combinations→danger. Wkłady pojedynczych wag nie są izolowane.`,
  `Odrzucono uniwersalny shot/progressive/CM bonus, stały pass cooldown, goalie/defender nerf oraz luźniejsze safety guards. Przepisane strzały dowodzą możliwości mechanizmu, nie częstości naturalnej.`,
  `Tak dla zamrożonego finalnego źródła: 6 dotąd nieodczytanych fixtures. Nie ma accepted gameplay correction, więc nie przypisuje się im before/after poprawy.`,
  `Nie zadeklarowano poprawy gry. Niezależna walidacja potwierdza diagnozę/ograniczenia; mechanizmy i wynik nie są relabelled jako sukces kalibracji.`,
  `Produkcja ma ten sam hash co scalony PR174. Nowe opt-in observers mają osobno zmierzony koszt; pełne plain replays i seryjne okna nie uzasadniają twierdzenia o przyspieszeniu gry.`,
  `Tak: ${perf.fullMatchEquivalence.length} pełne nowe mecze ON/OFF, identyczne całe canonical final-state hashes i ticks; wszystkie okna/profiler także zgodne.`,
  `Dwa pełne career paths: ${career.rows.map((r)=>`${r.professional?'pro':'U17'} ${r.reloads} reloadów/${r.choices} jawnych decyzji`).join('; ')}. Save/hydrate, duplicate no-op i następny fixture przechodzą; hybrid contracts w verify.`,
  `Pozostają ilościowy wkład off-ball support/risk/threat w brak wejść, realna kalibracja okazji, conditional natural keeper quality, duty-specific CM usage, pressing escape i statystyki U-17.`,
  `NOT READY. Skrajny niedobór strzałów i rożnych oraz nadmierna cyrkulacja czynią model niewiarygodnym celem populacyjnej kalibracji summary.`,
  `Tożsamości, minuty, legalne zdarzenia, exactly-once result commit, actual pass/shot release ledgers i warunkowe fizyczne kontrakty. Nie częstości goli/strzałów/saves/corners ani udziały pozycyjne jako targety.`,
  `Najmniejszy następny repair: jeden odtworzony łańcuch final-third control→box access/credible choice, z analizą rankingu i ruchu wsparcia, kontrfaktami i nowym sealed set. Nie kolejny globalny mnożnik strzałów.`,
  `Tak, PR176 może badać 20–25 sezonów generacji/świata przy zachowanych kontraktach; PR177 pozostaje zablokowany w zakresie statystycznej kalibracji do canonical football. Kolejność PR176→177→178→179+ zachowana.`,
];
const text=`# PR175 — Independent Match Reality Validation

**Ocena: NOT READY jako źródło statystycznej kalibracji PR177.** Nowe 12 pełnych meczów daje średnio ${n(fresh.match.shots.mean)} strzału i ${n(fresh.match.passesAttempted.mean)} podań na mecz. Klubowa referencja ma odpowiednio ${n(dist.groups.club12.match.shots.mean)} i ${n(dist.groups.club12.match.passesAttempted.mean)}. Te różnice mają większe znaczenie niż wiarygodnie wyglądający końcowy wynik.

PR dostarcza niezależną walidację, powiązane ledgers, kontrolowane próby, korekty **diagnostyki** i jawną ocenę gotowości. Nie zmienia produkcyjnej piłki, decyzji, RNG, zegara, asekuracji ani formatu save. Nie znaleziono wystarczająco izolowanej nowej usterki mechanicznej uzasadniającej zmianę współczynników. Brak takiej zmiany jest wynikiem bramek dowodowych, a nie deklaracją realizmu.

## 1. Źródła i audyt

Baza: scalony PR174 **d6556eba33d240bfc6ed845e256b185e9a24bc4a**, head review **63957f998884e4f8397164ada636070940fbdb3e**. Hash wszystkich produkcyjnych plików matchSimulation: **9f6123b5e9861d07b945253c0f1a98934326fb66da8246ca85fd96735c761d21**. Frozen K: **afa0c77c984b8a5b5040dbd976836496c4ccc54034de214f0392a26a426278da**.

Przeczytano PROJECT_STATE, ROADMAP, MATCH_BEHAVIOUR_CALIBRATION i raporty PR171–174; zbadano canonical stepping, ranker, pass reception/first-touch, shot opportunity/eligibility/execution, goalkeeper intervention, restart laws/last-touch, combination lifecycle, threat memory i career accounting. Wykorzystano istniejące factories/trackers oraz opt-in loader faktycznych decyzji PR172. Nie ma drugiego symulatora.

Różnica K→merged dotyczy combinationPlay: każdy runner wymaga dwóch dostępnych nieuczestniczących graczy asekuracji; runner nie może liczyć siebie. [Source manifest, exact diff i hashe harnessów](performance/PR175-source-baseline.json). Historyczne receipts/archiwa pozostają niezmienione.

## 2. Ponownie ustanowiona baza

Wszystkie 16+8 osiąga full_time; pełne wejścia każdej pary są identyczne. Spośród 24 whole-state outcomes ${paired.identicalFinalStates} pozostaje identycznych względem K, a ${24-paired.identicalFinalStates} się zmienia. To nowe pomiary post-review, nie przemianowane dane K.

| Metryka | Oryginalne 16 K→merged | Wcześniej obejrzane 8 K→merged |
|---|---:|---:|
${table(['passesAttempted','shots','goals','possessionLost','fouls','corners'].map((k)=>[k,
  sum(originalPairs,k,'before')+'→'+sum(originalPairs,k,'after'),sum(reservedPairs,k,'before')+'→'+sum(reservedPairs,k,'after')]))}

[Każda para, delta i rozkład](performance/PR175-merged-baseline-comparison.json). Oryginalne 16 obejmuje osiem seed/design blocks z lustrami; wcześniej reserved osiem ma cztery bloki. Nie są świeżym holdoutem.

## 3. Nowe fixtures i zasady walidacji

Przed zmianami gameplay zamrożono 12 seedów i pełne input hashes: sześć development, sześć validation. Brak mirrors. Warianty obejmują U-17, seniorów, siłę, 4-3-3/4-4-2/4-2-3-1/3-5-2/3-4-2-1, possession/direct/press/counter, pace, technikę i keeper skill. Preskryptywne atrybuty to jawne stress strata, nie losowa populacja polskiej ligi. Dwa youth designs współdzielą bazową populację klubów i mają różne ustawienia/XI.

[Frozen manifest](performance/PR175-new-fixture-manifest.json), [final candidate freeze](performance/PR175-candidate-freeze.json). Validation została odczytana dopiero po freeze; nie zastosowano późniejszego tuningu. ${freeze.decision} [Końcowa walidacja](performance/PR175-post-correction-validation.json).

Staged runners zapisują zakończone mecze, potrafią wznowić zgodne receipts i zachowują failure state. Limit 7200 s nie jest automatycznym full_time. Kosztownych cohortów nie dodano do verify. Zakres 12 nowych meczów pozostawiono przy 24 historycznych oraz dodatkowych replay/career/controlled runs; nie udaje on precyzji 24 niezależnych nowych spotkań.

## 4. Real-football reference i definicje

<img src="https://static.hudl.com/craft/productAssets/statsbomb_icon.svg" alt="StatsBomb" width="48" height="48" />

**Dane: StatsBomb Open Data**, immutable commit **4b73468fc5b0f1950f9f66fada70ad3a4f9327cb**. Zachowano 12 chronological group-stage MŚ 2022 z PR171. Dodano 12 chronological available Bundesliga 2023/24, competition 9/season 281, periods 1–2, bez selekcji po wyniku. Każdy event-file i lista meczów mają SHA256. Pinned inventory nie dostarczył odpowiedniej youth reference użytej do kalibracji.

[Metodologia i wszystkie źródłowe URL/hashe](performance/PR175-reference-methodology.json). Research podlega [StatsBomb user agreement](https://github.com/statsbomb/open-data/blob/4b73468fc5b0f1950f9f66fada70ad3a4f9327cb/LICENSE.pdf) i [attribution terms](https://github.com/statsbomb/open-data/blob/4b73468fc5b0f1950f9f66fada70ad3a4f9327cb/README.md); [provider media pack/logo](https://statsbomb.com/media-pack/). Nie redystrybuuje się event dumps ani nie wymaga downloadu w normalnych testach.

MFL pass = released PassDiagnostic, wraz z throws/restarts/GK distribution, bez crosses i non-shot headers. Comparator StatsBomb usuwa cross flag, lecz reception/control i possession IDs pozostają nieidentyczne. MFL shot = rzeczywisty shot ID; initial block/save i final goal mogą być etapami tej samej próby. Nie sumuje się ich jako rozłącznych wyników. MFL corners są awards, a provider Corner passes są rzeczywistymi deliveries; niewykonane końcowe wznowienie może dać różnicę definicji. World Cup i Bundesliga są porównaniem struktury seniorów, nie U-17 targetem. Per-90 używa rzeczywistej sumy okresów; live-minute comparison z real football nie jest obliczane, bo brak zgodnego zegara live.

## 5. Rozkłady i niepewność

| Na mecz | Nowe 12: średnia / mediana / zakres | MŚ12: średnia | Klub12: średnia |
|---|---:|---:|---:|
${table(['passesAttempted','shots','goals','corners'].map((k)=>[k, n(fresh.match[k].mean)+' / '+n(fresh.match[k].median)+' / '+n(fresh.match[k].min,0)+'–'+n(fresh.match[k].max,0),n(dist.groups.worldCup12.match[k].mean),n(dist.groups.club12.match[k].mean)]))}

[Match/team-match/per90, SD, P10/P90, pełny zakres, każdy outlier i splits](performance/PR175-independent-match-distributions.json). Jednostką wyniku jest mecz/design, nie tick, posiadanie ani strona drużyny. Nie deklaruje się istotności, population CI ani identyczności distribution między youth/senior. Duża liczba kontaktów nie zwiększa liczby niezależnych meczów. Kontrolowane variants i repeated replays są zależne.

## 6. Lejek i największy bottleneck

| Obserwowalny etap | Epizody |
|---|---:|
${table(Object.entries(stages).map(([k,v])=>[k,v]))}

Właściwy wniosek: podaż niebezpiecznych kontrolowanych stanów jest bardzo mała. ${funnel.ownerDecisions} actual owner choices zawiera tylko ${funnel.credibleDecisionObservations} credible/high_value observations w ${funnel.credibleEpisodes} epizodach. Z tego ${funnel.credibleWithShotCandidate} ma generated shot, ${funnel.credibleSelectedShot} wybiera shot, a alternatywy to ${credibleAlternatives}. Widoczna jest również selekcja przeciw marginalnym strzałom, ale ticki tej samej okazji nie są osobnymi szansami.

ID epizodu, player/action-choice, canonical pass/shot/combination i physical timestamps są w pełnym archiwum. Shot candidate i selection to osobne fakty. Rutynowy zaakceptowany shot przechodzi eligibility/preparation/contact/release w jednej transakcji; nie ma fikcyjnego asynchronicznego wind-up. Incoming ma revalidation przy kontakcie. Wybranych hooks=${selectedTotal}, releases all-phase=${shooting.shots}, links=${funnel.releaseChoiceLinks}, selected-without-release=${funnel.selectedWithoutRelease.length}. Restarty mogą ominąć owner hook. [Pełny funnel](performance/PR175-possession-to-shot-funnel.json).

Rzeczywiste progressive releases do box target z zewnątrz: ${territory.boxTargetReleases}; wyniki=${JSON.stringify(territory.boxTargetResults)}. Forecast spełnia istniejące audytowe warunki w ${territory.withCredibleGeneratedForecast} przypadkach; target nie dowodzi actual box control. [Physical pass-to-recipient chains](performance/PR175-territory-to-danger.json).

To nie jest oracle wszystkich możliwych przestrzeni: generated_support/progression/box candidates są audytowalnymi propozycjami rankera, a nie dowodem, że każdy niewygenerowany ruch był niemożliwy. Exit causes odróżniają claim/interception/tackle, failed control, pass-out, foul/restart, goal i period end; nie każde niestrzelające posiadanie jest wadą. Najmniejszy przyszły repair powinien izolować pojedynczy łańcuch final-third→box/credible option przed zmianą wag.

## 7. Cadence i recykling

${cadence.passes} release IDs zgadza się z oficjalnymi attempts. Kierunki: ${JSON.stringify(cadence.directions)}; first-time execution=${cadence.executionTypes.first_time??0}; reciprocal consecutive=${cadence.reciprocal}. Mediana długości=${n(cadence.metres.median)} m, kontrola→wybór/release=${n(cadence.controlToRelease.median)} s, lot→rozstrzygnięcie=${n(cadence.flightSeconds.median)} s, reception→next release=${n(cadence.receptionToNextRelease.median)} s. Physical/awareness preparation nakładają się; nie dodaje się ich mechanicznie. Owner timings mają ${cadence.timedControlledPasses} zgodnych ścieżek; stare hints/restarts/incoming nie udają długiej kontroli. Self-reclaim jest oddzielony od teammate completion.

Clock exposure jest osobnym istotnym czynnikiem: średnio **${n(fresh.totals.liveSeconds/12/60)} min live** z ${n(fresh.totals.durationMinutes/12)} min elapsed (${pct(fresh.totals.liveSeconds,fresh.totals.durationMinutes*60)}). Tożsamość passes/match = passes/live-minute × live-minutes jest dokładna dla MFL. [FIFA 30.11.2022](https://vod.fifa.com/refereeing/news/collina-weve-asked-referees-to-calculate-stoppage-time-more-accurately) raportowała średni actual playing time zbliżony do 59 min w dotychczasowych meczach i maksimum 67.5 min w France–Australia. To inna, szersza próba z niepodanym N i bez identycznej anotacji; użyto jej jako kontekstu bardzo długiej ekspozycji, **nie** do wyliczenia reference passes/live-minute z cudzych totals. Mało wyjść piłki, shots i restartów łączy się z długim live; nie skrócono sztucznie zegara ani nie wprowadzono przerw do osiągnięcia celu.

${recycling.lowNetCirculation} epizodów ma >=4 pass i <5 m retained gain; ${recycling.recycledExcursion} traci >=10 m chwilowego zysku; ${recycling.repeatedExchanges} zawiera >=2 reciprocal exchanges. To deskryptory, nie etykiety błędu. Brak realnego matched contact clock uniemożliwia stwierdzenie, że wszystkie kopnięcia są fizycznie za szybkie. Nie wdrożono cooldownu. [Cadence](performance/PR175-passing-cadence.json), [recycling](performance/PR175-possession-recycling.json).

## 8. Strzały, gole, keepers i restarty

Gole=${shooting.goals}, shot releases=${shooting.shots}; final outcomes=${JSON.stringify(shooting.finalOutcomes)}, źródła goli=${JSON.stringify(shooting.goalSources)}. Dodatkowy, nierozłączny rebound flag=${shooting.reboundGoals} wymaga wcześniejszego wyniku tego samego shot ID oraz canonical deflection/keeper evidence; penalty rebound zachowuje także źródło penalty. Wszystkie score transitions zachowano. Duplicates=${shooting.duplicateReleaseIds}/${shooting.duplicateGoalIds}; brak release poza own-goal=${shooting.missingRelease.length}. Wysoka konwersja nie jest naprawiana kasowaniem goli ani dopisywaniem prób. Mean/median shot distance=${n(shooting.shotDistance.mean)}/${n(shooting.shotDistance.median)} m. Natural selection jest daleka od równomiernego zestawu strzałów z 12–30 m.

Oddzielny complete-state replay wszystkich 24 historical fixtures rozlicza ${historicalGoals.shots} shots i ${historicalGoals.goals} goli; źródła=${JSON.stringify(historicalGoals.goalSources)}; shot contexts=${JSON.stringify(historicalGoals.shotContexts)}. Niepowiązane gole poza own-goal=${historicalGoals.missingRelease.length}, duplicate shots/goals=${historicalGoals.duplicateShotIds}/${historicalGoals.duplicateGoalIds}. Każdy final hash zgadza się z nową bazą, a dawne K receipts pozostają historyczne. [Historical goal-source ledger](performance/PR175-historical-goal-sources.json).

| Kontekst fizycznego strzału | Historyczne 24: strzały / gole | Nowe 12: strzały / gole |
|---|---:|---:|
${table(['open_play','penalty'].map((k)=>[k,`${historicalGoals.byContext[k]?.shots??0} / ${historicalGoals.byContext[k]?.goals??0}`,`${shooting.byContext[k]?.shots??0} / ${shooting.byContext[k]?.goals??0}`]))}

Kontekst open_play obejmuje też strzały po rozegraniu wznowienia; źródło całej sekwencji jest osobnym polem. Same karne nie wyjaśniają ekstremalnej skuteczności: historyczny kontekst open_play nadal daje ${pct(historicalGoals.byContext.open_play.goals,historicalGoals.byContext.open_play.shots)}, nowy ${pct(shooting.byContext.open_play.goals,shooting.byContext.open_play.shots)}. Nowe osiem strzałów open_play ma średni dystans ${n(shooting.byContext.open_play.distance.mean)} m i zakres ${n(shooting.byContext.open_play.distance.min)}–${n(shooting.byContext.open_play.distance.max)} m. To bardzo wąska selekcja sytuacji, nie dowód poprawnej kalibracji skuteczności ani ilościowe rozdzielenie accuracy/GK/selection.

Historyczne 24 strzały w tym kontekście mają średni dystans ${n(historicalGoals.byContext.open_play.distance.mean)} m, medianę ${n(historicalGoals.byContext.open_play.distance.median)} m i zakres ${n(historicalGoals.byContext.open_play.distance.min)}–${n(historicalGoals.byContext.open_play.distance.max)} m; rozkład presji i pełne geometrie są w ledgerze. Nieliczne dalsze próby nie stanowią wystarczającej próby do osobnej kalibracji dalekich strzałów.

Legal restart restriction potrafi przetrwać wiele posiadań; lastBoundaryCrossing może opisywać wcześniejsze wyjście. Finalny projector odrzuca te stare wskazówki bez continuous possession lineage. Raw hints pozostają zachowane w archiwum. Regression tests chronią przypadki starego restartu i starego gola. [Shot i goal ledgers](performance/PR175-shooting-outcomes.json).

208 prescribed shots (13 one-factor variants ×16 common seeds) przechodzi przez prawdziwy release/flight/defender/keeper. Base: ${JSON.stringify(outcomeByVariant.base)}; pressure: ${JSON.stringify(outcomeByVariant['pressure-close'])}; 30m: ${JSON.stringify(outcomeByVariant['distance-30'])}; lane defender: ${JSON.stringify(outcomeByVariant['defender-block'])}; weak keeper: ${JSON.stringify(outcomeByVariant['keeper-38'])}; first-time slow: ${JSON.stringify(outcomeByVariant['incoming-slow'])}. Warianty nie są populacją naturalnych meczów, a częściowa non-monotoniczność małych próbek nie uzasadnia dostrajania accuracy. [Pełne physical outcomes i GK projections](performance/PR175-controlled-mechanisms.json).

Official natural saves=${fresh.totals.saves}, corners=${fresh.totals.corners}. Zero interwencji bez odpowiednich shots nie dowodzi wady GK. Audyt ${keepers.cornerAttribution.audited} rożnych sprawdza linię końcową, tożsamość i stronę ostatniego dotknięcia obrońcy oraz stronę wznowienia; rozbieżności=${keepers.cornerAttribution.mismatches.length}. Brak quotas/teleportacji. [Keeper/corner/set-piece lifecycle i preparation durations](performance/PR175-goalkeeper-and-corners.json). Domyślne testy PR172 nadal obejmują physical glancing block→natural corner w obu orientacjach.

## 9. Pozycje, kombinacje i pressing

CM receptions=${roleCM.receptions}/${allReceptions} (${pct(roleCM.receptions,allReceptions)}), ${n(roleCM.receptions*90/roleCM.minutes)} na player-90. Użyto rzeczywistych minut, formacji, odejść/zmian i within-team shares. Slot central_midfielder nie rozdziela wszystkich duties; nie ogłoszono role realism na podstawie jednej liczby. [Player/role rows](performance/PR175-positional-involvement.json). Kontrolowane gifted/ordinary receiver probes zachowują ranking i forecasts; brak uniwersalnego OVR/CM bonusu.

Ukończone canonical combinations=${combo.completed}, ${completedKinds}. ${combo.withSubsequentChoice} ma późniejszy wybór runnera, ${combo.withCredibleSubsequentChoice} credible subsequent choice, ${combo.withAttributedShot} conservative shot linkage. Wymagany jest konkretny continuation Pass ID, actual reception i dalsza kontrola runnera do jego następnego fizycznego podania. Późniejszy recykling nawet w tym samym posiadaniu nie tworzy linku; raw broad hints są zachowane oddzielnie. [Conversion ledger](performance/PR175-combination-conversion.json). Ten licznik nie jest efektem przyczynowym względem kontrfaktycznego braku kombinacji.

20 controlled team continuations obejmuje press/third-man/overlap/underlap, open/covered/timed/weak/recovering. Pięć central press variantes daje pięć loss events i zero shots. Timed overlap może się ukończyć; underlap często przegrywa z alternatywą albo wygasa. Nie osłabiono pressera, rest cover ani offside. Naturalne przyczyny scarcity poza konkretnymi ranking/expiry observations pozostają częściowo nierozdzielone.

Threat memory: ${adaptation.actualPassChoicesWithAdaptationTerm} selected pass choices ma niezerowy adaptation term, ale 10 same-geometry history/context probes nadal zaczyna carry. Same flag changes nie są dowodem lepszego wyniku. [Actual contributions/memory](performance/PR175-pressing-and-adaptation.json), [history counterfactuals](performance/PR175-tactical-adaptation.json).

## 10. Obrona i dyscyplina

Nowe 12: tackles attempted=${fresh.totals.tacklesAttempted}, won=${fresh.totals.tacklesWon}, interceptions=${fresh.totals.interceptions}, possessionLost=${fresh.totals.possessionLost}, fouls=${fresh.totals.fouls}, yellow=${fresh.totals.yellowCards}, red=${fresh.totals.redCards}. Legal challenges i fouls są oddzielnymi faktami. [Każdy canonical defensive counter i strata](performance/PR175-defence-and-discipline.json). Mała heterogeneous próba i skrajnie rzadka ofensywa nie ustanawiają skalibrowanego referee distribution.

## 11. Hipotezy i decyzje o korektach

${natural.rows.length} pierwszych stanów z predeclared categories ma dokładny whole-state replay i 8s canonical counterfactuals selected/best generated progressive/best generated shot. Dodatkowe 10 dev-strength obejmuje po obejrzeniu development osobny credible/no-candidate case. Zachowano także niepowodzenia, niedostępne alternatives i score/loss outcomes. W credible carry at 1341.4s zarówno wybrane prowadzenie, jak bezpośredni shot dają gola; odrzucenie shot nie było automatycznie błędem. Inny forced shot nie daje gola. [Frozen cases/outcomes](performance/PR175-natural-counterfactuals.json), [dev-strength](performance/PR175-natural-counterfactuals-dev-strength.json).

W stanie at 81s model opisuje okazję jako credible, lecz piłka jest 1.274836 m od ciała i settled shot eligibility=false. Brak kandydata nie był błędem generowania. [19 frozen-state readiness/awareness/contact audits](performance/PR175-perception-clock-audit.json). Jest to jawnie wybrany zestaw stanów, nie match-rate sample.

Nie przyjęto gameplay correction. Wsparte przyczyny opisowe nie izolują bezpiecznej zmiany pojedynczego mechanizmu, a każdy globalny bonus zmieniłby wiele sytuacji bez dowodu. Odrzucono: quotas, universal progressive/shot/CM bonus, stały pass cooldown, weaken keeper/defender, forced corners/fouls, loosening cover. Przyjęto tylko poprawne **badawcze** rozliczanie persistent hints i self-reclaims. [Hipotezy, gates i negatywne wyniki](performance/PR175-hypothesis-tests.json).

Końcowe reguły projekcji źródeł i ścisłych powiązań kombinacji dopracowano podczas audytu po akwizycji; nie są prerejestrowanym testem statystycznym. Dotyczy to także odrzucania starych wskazówek kontroli w pomiarze czasu. Reguły stosuje się jednakowo do development/validation, raw observations pozostają zachowane, a nowe regresje chronią odtworzone błędne przypisania. Nie zmieniono na tej podstawie polityki gry ani zamrożonych wejść. Formalna prerejestracja dokładnych miar i nowe nieodczytane fixtures pozostają wymagane dla przyszłego potwierdzającego eksperymentu kalibracyjnego.

## 12. Walidacja, determinism i career contracts

Sealed six oceniono na zamrożonym źródle ${freeze.sourceHash}; development/validation outcomes są osobne. Nie twierdzi się, że identyczny source stworzył nową poprawę before/after. [Final validation](performance/PR175-post-correction-validation.json).

${perf.fullMatchEquivalence.length} kompletnych świeżych canonical matches z detailed observers/actual-choice hook i bez nich kończy się identycznymi **pełnymi** hashes oraz ticks. Pełna natural-capture replay także równa się pierwotnemu całemu stanowi. Trzy serial window repeats każdego trybu i all-tick profiler zachowują stan. Source/save schemas/RNG nie zmieniają się.

Dwa nowe pełne careers: ${career.rows.map((r)=>`${r.professional?'pro':'U17'} choices=${r.choices}, reloads=${r.reloads}, active=${r.activeReloads}, score=${r.score.home}:${r.score.away}`).join('; ')}. Sprawdzono human decisions przez zwykły applyPlayerDecision, canonical autonomous continuation, wynik/minuty/rating, save/hydrate, duplicate no-op, powrót i następny fixture. Default career-match contracts sprawdzają również canonical-plus-summary i nie przypisują fikcyjnych indywidualnych kontaktów końcówce. [Career receipt](performance/PR175-career.json). Nie jest to nowy ręczny browser playthrough ani subiektywna ocena animacji; UI pozostało bez zmian.

## 13. Koszt i pełna weryfikacja

[Serial performance](performance/PR175-performance.json): 60s identycznego fixture, warm-up i trzy próby/mode; whole-state equality, all-2400-tick inclusive spans dla AI/planning/movement/collision/accounting. Osobna powtórka mierzy rzeczywiste wywołania reconcile/release/candidate kombinacji przez loader badawczy, z liczbą wywołań przy aktywnej intencji. Inclusive spans nakładają się i obejmują narzut zegara; nie są udziałem CPU całego meczu ani pełnym kosztem współdzielonego ruchu/prognoz. Full-match plain processes mają CPU/wall/memory i równają się observed hashes. Concurrent cohort wall times nie są porównaniem wydajności.

Production source jest identyczny z merged PR174: brak podstaw do twierdzenia o nowym przyspieszeniu lub gameplay overhead. Detailed research jest opt-in i ma osobny koszt. Memory snapshots nie są izolowanym peak benchmarkiem. Startup/save/load zachowuje payload i ma osobne serial receipt. Badawcze archiwa nie wchodzą do career saves.

| Tryb 60 s / mediana trzech prób | CPU, ms | Wall, ms | Zachowany payload, bajty |
|---|---:|---:|---:|
${table(Object.entries(perf.windowMedians).map(([mode,row])=>[mode,n(row.cpuMs),n(row.wallMs),row.retainedBytes]))}

Stosunek CPU detailed/plain wynosi ${n(perf.diagnosticCpuRatio)}. Dwa pełne przebiegi bez obserwatorów: ${perf.fullMatchEquivalence.map((r)=>`${r.id}: CPU ${n(r.cpuMs/1000)} s, wall ${n(r.wallMs/1000)} s`).join('; ')}. Są to pomiary tej maszyny, bez wniosku o populacyjnym przyspieszeniu. Startup dla obu etykiet wykonuje ten sam kod produkcyjny; różnice czasu to zmienność pomiaru, a wszystkie 14 payloadów save ma ten sam hash.

Mediana CPU detailed poniżej plain przy jednocześnie wyższym wall nie dowodzi przyspieszenia przez diagnostykę ani zerowego narzutu. Trzy krótkie próby nie izolują scheduler/JIT/GC; nie uzyskano stabilnego dodatniego oszacowania przyrostowego CPU. Większy zachowany payload jest zmierzony osobno. Czasów instrumentowanych cohortów z równoległego research nie używa się jako porównania narzutu.

Full-match CPU/wall obejmuje pętlę całego meczu, bez importów, tworzenia fixture, końcowego hashowania i zapisu JSON; nie jest czasem życia całego procesu. Osobny benchmark startup rozlicza tworzenie kariery, parse/validation świata oraz save/load.

| Wywołania kombinacji w osobnych 60 s | Wszystkie / z aktywną intencją | Wall łącznie / z aktywną intencją, ms |
|---|---:|---:|
${table(Object.entries(perf.combinationTimings).map(([name,row])=>[name,`${row.calls} / ${row.activeCalls}`,`${n(row.wallMs)} / ${n(row.activeWallMs)}`]))}

**npm run verify: PASS**, ${verification.totalTests} testów, lint, TypeScript i production build. Sześć nowych regresji sprawdza read-only/dedup/choice-release linkage, stale source attribution i odrzucenie późniejszego shot po recyklingu. Dotychczasowe tests, limits, workers, assertions, fixtures/goldens i CI command bez zmian. [Dokładna komenda, środowisko, log i wcześniejsze nieudane próby](performance/PR175-verification.json).

## 14. Ocena i dalszy najmniejszy zakres

**NOT READY.** Physical identity/law/exactly-once contracts i diagnostyka mogą wspierać PR177; naturalne pass/shot/goal/save/corner/role frequencies nie są wiarygodnym targetem summary calibration. Nie przeskakuje się tego ograniczenia dlatego, że final scores wyglądają znajomo.

Najmniejszy repair: odtworzona sekwencja final-third control→box access/credible opportunity, z osobnym sprawdzeniem candidate generation, aktualnego ruchu wsparcia, physical forecast i ranking terms. Potem pojedyncza wąska korekta, paired continuations, material turnover/defence regressions oraz **nowy** sealed set, ponieważ validation PR175 jest już consumed. Brak ogólnego redesignu w tym PR.

PR176 może badać generational renewal/world strength przez 20–25 sezonów przy zachowanych kontraktach. PR177 summary/PlayStyles musi respektować powyższą zależność. PR178 career UX/shot menu i PR179+ world expansion pozostają osobnymi etapami; bez fractional IDs.

## 15. Odpowiedzi na wszystkie 40 pytań

| # | Odpowiedź |
|---|---|
${table(questions.map((q,i)=>[i+1,q]))}

## Odtwarzanie

Node 24, zależności z niezmienionego lockfile. Wszystkie raw inputs/outcomes i dokładne harnessy: [evidence index](performance/PR175-evidence-index.json). Plik gzip zawiera mapę exact bytes; restore według nazw, zachowaj hash wersji. Seed manifest jest już frozen i runner nie pozwala go nadpisać. Reference download jest jawny i opcjonalny.

Archiwalny katalog pr175-measured-harnesses zachowuje trzy kopie użyte do adaptation/career/startup przed końcowym porządkowaniem CRLF i pustych linii na końcu pliku. Bieżące skrypty mają ten sam kod wykonywalny; zgodność po tej normalizacji sprawdzono bajtowo. Pozostałe harnessy cohort/performance zachowują dokładne bajty wersji pomiarowej.

Poniższe komendy używają PowerShell; checkout bazowy w ostatnim benchmarku musi mieć źródła scalonego PR174. W tym środowisku Windows ustawiono TEMP/TMP na zapisywalny katalog roboczy przed testami. Finalizer weryfikacji wymaga zapisanego logu i kodu wyjścia; nie zmienia komendy ani ustawień testów. Hashe zachowania wcześniejszych plików opisują dokładne bajty początkowego checkoutu Windows; normalizacja zakończeń linii w innym checkoutcie może zmienić hash tekstu bez zmiany bloba Git. Nowe harnessy i receipts PR175 mają wymuszone LF.

${fence}text
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
${fence}
`;
writeFileSync('docs/PR175_MATCH_REALITY_VALIDATION.md',text);
console.log('Rendered PR175 report, 40 acceptance answers');
