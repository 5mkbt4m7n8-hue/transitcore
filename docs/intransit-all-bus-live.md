# InTransit Live – alle registrerte AtB-busslinjer i ett kart

## Kartet

Åpne `web/linear/live/` eller
`https://5mkbt4m7n8-hue.github.io/transitcore/web/linear/live/`.

**Alle linjer** er nå startvalget. Kartet henter og viser de **47 registrerte
AtB-busslinjeprofilene som faktisk finnes i
`config/routes/atb-bus-N-live.json`** – det betyr ikke alle rutene
AtB noensinne kjører. 47 profil-ID-er:
1, 2, 3, 10, 11, 12, 13, 14, 15, 16, 18, 20, 21, 22, 23, 25,
28, 40, 41, 42, 43, 44, 45, 46, 50, 51, 52, 53, 54, 70, 71,
72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 85, 86, 91, 92.

- **Fargekodede ruter:** Hver profil har en bestemt farge og kartets
  profiltrasé tegnes uavhengig av eventuell sanntid.
- **Velg linjer:** Trykk «Velg linjer», søk etter linjenummer eller
  rutenavn og slå linjer av/på med individuelle brytere.
  «Vis alle» og «Skjul alle» gjør det enkelt å administrere oversikten.
- **Holdeplasser:** Det samme offisielle NSR Quay-stoppet får
  bare én kartmarkør selv om det finnes i flere valgte profiler.
- **Bussmarkører:** Viser linjenummer og kartfarge når en
  dokumentert GPS-observasjon (maks 90 sek gammel) finnes.
  «Følg buss», «Vis alle busser», rutekart, fullskjerm, mobil,
  og eksisterende vis/skjul-valg virker også for flåtevisningen.
- **Velg enkeltrute:** Linjevelgeren har fortsatt 1, 2 og 3
  for fokusert visning av én rute. Sjekkede profiler i
  «Alle linjer» beholdes i samme fanes minne hvis du bytter tilbake.
- Ruteprofiler hentes i avgrensede parallellgrupper; en ugyldig
  eller utilgjengelig fil skjuler ikke de andre. Antall tilgjengelige
  profiler oppgis i grensesnittet.
- `?line=all` kan brukes som direktelenke.

## Én GPS-forespørsel for hele AtB-flåten

Nytt lesebasert Worker-endepunkt:

`GET /api/v1/vehicles/atb-live-all`

Det gjør **ett** POST-kall mot Entur Vehicle Positions v2 med
`codespaceId=ATB`. Bare faktiske målinger som matcher en
registrert publicCode fra profilkatalogen slippes gjennom.
Linjekoder blir ikke gjettet fra kartposisjon.

Server og klient krever geografisk gyldige koordinater og tidsstempel,
maks 90 sekunders alder, ingen mer enn 10 sekunders framtidsavvik,
og at GPS-kilden er `measured-vehicle-position`.
Sporing er per `line:vehicleId`, slik at samme kjøretøy-ID på
ulike linjer aldri blandes. Utløpte eller manglende observasjoner
fjernes; ingen ETA-fallback, interpolering eller animerte
«oppdiktede» bussposisjoner.

Kartet oppdaterer som før hvert 30. sekund når fanen er synlig.
Lokalt filter bestemmer hvilke av de målte posisjonene som vises.
Det sendes ikke 47 separate GPS-forespørsler.

## Drift og kjente begrensninger

Cloudflare Worker-produksjonen har tidligere svart HTTP 404
selv om GitHub-versjoner er merget. Dette endres ikke automatisk
av en vellykket GitHub-PR. For å vise ekte bussposisjoner må
den nye aktive Worker-versjonen være tilgjengelig på
`transitcore-led-feed.lgb84.workers.dev`. Inntil da fungerer
ruter og holdeplasser, men kjøretøymarkører uteblir.

Linjeprofiler er lagrede geografiske traséer, ikke offisielle spor
for alle kjøretøy eller alle turvarianter. Rutevalget omfatter
Trondheimsområdet, blant annet enkelte lengre ruter mot
Malvik og Byneset.

Ingen endringer i originaltegning (100 stopp og 18 streker),
lokale redigeringsutkast, eksisterende LED-/OTA-/enhetsmotor,
Gråkallbanen, FB73, Oslo T-bane eller deres kjøretøysporing.
Visningen skriver ingenting til localStorage.

## Testdekning

- `node scripts/test-intransit-all-routes.mjs`: 47 profiler,
  GPS-validering, 1 Entur-kall, kilde- og linjetilhørighet.
- `node scripts/browser-intransit-all.mjs`: faktisk Chromium,
  47 profiler, søk, individuelle brytere, dublettsikre stopp,
  GPS-markører, GPS-feil og 404, aldersfilter og mobil.
- Eksisterende ruter, GPS, Worker, Linear og geografisk editor
  testes fortsatt separat.
