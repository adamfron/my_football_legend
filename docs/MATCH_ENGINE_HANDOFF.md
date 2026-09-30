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
- `playerDecision.ts` jest czystą projekcją okazji. `decisionOutcome.ts` zamyka zdarzeniowe okno
  wyniku; checkpoint sprawczości może łańcuchować kolejną decyzję.
- `matchMoment.ts` obserwuje; polityka prezentacji wybiera epizody, nie wyniki futbolu.
- `TacticalMatchSandbox.tsx` zarządza batchami i fazą widoku. Three.js tylko renderuje klatki.
- `matchFlowTelemetry`, statystyki i debug capture są obserwatorami i nie zużywają RNG.
- Benchmark `npm run benchmark:background` rozdziela core, telemetrię, moment, complete i profile.

## Inwarianty

1. `FIXED_MATCH_DT = 0.025` i jeden integrator fizyki piłki.
2. Prezentacja nie zużywa RNG, renderer nie rozstrzyga futbolu.
3. Flaga kontroli nie zmienia preferencji kolegów wobec adresata podania.
4. AI nie wykonuje wysokowartościowej akcji kontrolowanego gracza, gdy człowiek posiada epizod.
5. Udana akcja z zachowaniem/zdobyciem posiadania może prowadzić do kolejnej decyzji człowieka.
6. Polityka prezentacji decyduje o wejściu do epizodu, nie o właścicielu każdego następnego kontaktu.
7. Podział tych samych ticków na batche nie zmienia wyniku.

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

- zaangażowanie/touches i wolumen podań protagonisty mogą być wysokie;
- przechwyty i czułość prezentacji nadal wymagają kalibracji;
- nowe łańcuchowanie epizodów wymaga długich testów manualnych;
- udział bramkarza i podania zwrotne wymagają obserwacji;
- brak zmęczenia, zmian, fauli/kartek i oceny meczowej;
- modele i animacje 3D pozostają lekkim prototypem; kamera, hitboxy i baza strojów mają fundament PR141.

## Roadmap

Ukończono PR141 (interfejs, barwy, kosmetyczna kamera, hitboxy, transformacja celowania).
Następny jest **PR142 — Match Animation & 3D Presentation v1**. Kamera gry przechowuje offset
wokół bieżącego pivotu, a celowanie korzysta z promienia i wspólnego `goalCoordinates`;
PR142 musi zachować tę granicę projekcji. Następnie: stamina/fatigue, zmiany, faule/kartki,
ocena meczu, dalsza kalibracja futbolu i integracja kariery. Nie uznawać kalibracji za zakończoną.
