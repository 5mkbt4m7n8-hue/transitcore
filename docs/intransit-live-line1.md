# InTransit Live – AtB linje 1

## Bruk

Åpne `https://5mkbt4m7n8-hue.github.io/transitcore/web/linear/live/`.

Denne siden er en **selvstendig, mobilprioritert kartvisning** som ikke
inneholder redigeringsverktøy. «Linear», «Karteditor» og
«Holdeplasser» har lenker hit. Data- og redigeringsmodusene er adskilte.

Kartet viser:
- Ruteprofilen `config/routes/atb-bus-1-live.json`, med 98
  geografiske knekkpunkter fra den allerede eksisterende profilen,
  tegnet som en rød profiltrasé.
- 32 holdeplasser langs denne profilen, markert med lyse stoppsymboler,
  navn og offisiell NSR Quay-ID i datagrunnlaget.
- Ferske, målte bussposisjoner fra eksisterende
  `GET /api/v1/vehicles/atb-line-1`, i et separat lag
  med røde markører og datotidsstempel. Kildevalidation gjenbruker
  `web/linear/geo/line1-gps.js`.

## Kontroller

- **Hele linjen** tilpasser kartet til lagret ruteprofil.
- **Alle busser** tilpasser kartet til *faktisk mottatte GPS-målinger*;
  knappen er deaktivert ved null GPS.
- **Følg buss** følger valgt kjøretøy mellom nye målte datapunkter.
  Bevegelse blir aldri interpolert; kartet hopper bare når ny GPS måles.
  Manuell kartdragging stopper følgemodusen. Hvis kjøretøyet ikke lenger
  rapporteres ferskt, forsvinner det og følgemodusen avsluttes.
- **Fullskjerm** bruker nettleserens Fullscreen API eller en CSS-reserve
  der dette ikke støttes (f.eks. enkelte iOS-nettlesere).
- **Holdeplasser / Ruteprofil** kan vises og skjules hver for seg.
- **Oppdater GPS** henter på nytt, i tillegg til automatisk polling
  hvert 30. sekund når siden er synlig.

## Feil, datakvalitet og originaltegning

**GPS kan per 25. oktober 2026 returnere HTTP 404**, fordi riktig
Worker-endepunkt ennå ikke er bekreftet aktivt for produksjonstrafikk.
Da viser Live-kartet en tydelig melding, men hele ruteprofilen og
holdeplassene kan fortsatt leses.

- HTTP 404 betyr at endepunktet ikke er tilgjengelig i Worker, ikke at
  bussene eller rå GPS-data er fraværende.
- HTTP 503, nettverksfeil eller manglende GPS gir ikke noe beregnet
  kjøretøypunkt. Tidligere posisjoner fjernes.
- Posisjoner eldre enn 90 sekunder blir fjernet lokalt i nettleseren.
  Det finnes verken ETA-fallback, nearest-road-snapping, geokoding,
  interpolering, ruteberegning eller simulert kjøretøybevegelse.
- Route shape er *lagret ruteprofil* og trenger ikke dekke alle
  variantkjøringer. Den brukes ikke som bevis for bussens posisjon.
- Den originale skjematiske tegningen (100 stopp, 18 linjer, 23
  navneuklarheter), geografisk arbeidskopi, Worker-/LED-motor og
  eksisterende datakilder er uendret.
- Kartvisningen skriver **ikke** til localStorage. Besøk på siden
  kan ikke overskrive lokalt redigerte geografiske traséer/navn.

## Tester

`node scripts/test-intransit-live.mjs`

`node scripts/browser-intransit-live.mjs` (krever Playwright og Leaflet)

Chromium-testene bruker simulert nettverkssvar for gyldig GPS,
eldre observasjon, tomt svar, HTTP 404 og HTTP 503, samt følger en
buss, fullskjerm, mobilstørrelse, kildeprofil og uendrede lokale data.

Siden tester ikke en live Worker-produksjonsutrulling.
Den har en egen GitHub Actions workflow for kode- og funksjonstester.
