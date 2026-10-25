# InTransit – AtB linje 1: målt GPS på geografisk kart

## Mål og visning

Åpne `web/linear/geo/`. I panelet «AtB linje 1 – faktiske GPS-posisjoner»
vises **bare** ferske målte observasjoner fra Entur Vehicle Positions v2.

- Hver rød markør er en konkret, tidsstemplet GPS-observasjon på
  `ATB:Line:2_1` (ATB-kodespace og publicCode `1`).
- Trykk på markøren for måletid, datakilde og rapportert destinasjon.
- «Vis alle busser» tilpasser kartutsnittet til de målte posisjonene.
- «Oppdater GPS» forespør på nytt, og panelet oppdaterer automatisk
  hvert 30. sekund så lenge fanen er synlig.
- Skru GPS-laget av/på. Redigering av holdeplasser, egendefinerte
  geografiske linjer og eksisterende LED-/ETA-markører er uavhengig
  av dette laget.
- Hvis datakilden svarer uten ferske posisjoner, vises ingen GPS-markører.
  Meldingen betyr **ikke** at bussene ikke kjører. Hvis kilden feiler,
  slettes utdaterte GPS-markører og en kildefeil vises.

## Datakilde og endepunkt

Det geografiske kartet på GitHub Pages henter fra en lesebasert,
isolert Cloudflare Worker-rute:

`GET https://transitcore-led-feed.lgb84.workers.dev/api/v1/vehicles/atb-line-1`

Denne ruten forespør `POST https://api.entur.io/realtime/v2/vehicles/graphql`
med `ET-Client-Name: transitcore-line1-geo`. Kilden støtter
ATB Vehicle Positions. GraphQL-skjemaet bygger på eksisterende
`core/providers/entur/entur-provider.mjs` og bruker
`vehicleId`, `lastUpdated`, `destinationName`,
`line{publicCode}` og `location{latitude longitude}`.

Filteret er bare `codespaceId=ATB`, `publicCode=1`. API-responsen
identifiseres som `ATB:Line:2_1` etter dette kontrollerte oppsettet;
det er **ikke** automatisk rutematching ut fra geografisk nærhet.
Ingen GPS blir estimert fra oppgitte ankomsttider. Ingen posisjoner
ekstrapoleres, interpoleres, knyttes til nærmeste vei, eller flyttes
til et holdeplasspunkt. Brukerens skjematiske strekninger tegner
heller ikke en offisiell GPS-rute.

## Sikker datakvalitet

- Maks **90 sekunder** etter Enturs måletid. Observasjoner uten
  gyldig, soneangitt ISO-tidsstempel forkastes.
- Tolererer maksimalt 10 sekunder framtidsavvik.
- Krever reelle latitude/longitude-tall i et konservativt Trondheim-
  utsnitt; posisjoner uten koordinater og ugyldige punkter forkastes.
- Dupliserte kjøretøy-ID-er håndteres med nyeste gyldige observasjon.
- Server returnerer kildefeil som HTTP 503, uten å fabrikkere
  posisjoner eller gjøre en ETA-fallback.
- Nettleseren validerer at svaret gjelder nettopp ATB linje 1,
  `measured-vehicle-position`, GPS-kilde og måletid før markører vises.
- Ruten returnerer **bare linje 1** og ingen rådata om andre AtB-linjer.
  Ingen kjøretøy-ID-er eller koordinater skrives til testloggene.
- Ved null svar kan vi ikke slå fast at GPS ikke finnes, eller at
  kjøretøy ikke kjører. Kontinuerlig kildeobservasjon gjenstår.

## Uendret funksjonalitet

Eksisterende `/api/v1/frame/*`, Worker-sanntidsmotor,
Oslo-metro, FB73, fysisk LED-status, originaltegningen
(100 stopp, 18 tegnede linjer), navneadministrasjon
og lokal geografisk arbeidskopi er urørt.

Endringen legger til én isolert read-only API-rute; ny Worker-versjon
rulles ut via eksisterende produksjonsflyt når endringen merkes til
`main`. Testdata legges aldri inn i produksjonen.

## Verifisering

`node scripts/test-atb-line1-gps.mjs`

`node scripts/test-intransit-geo.mjs`

`node scripts/browser-intransit-geo.mjs` (Playwright, Leaflet og
simulert nettverkssvar for å teste gjengivelse, feil og nullobservasjoner).

En ikke-blokkerende observasjonsjobb i CI kjører
`node scripts/probe-atb-line1-gps.mjs`; den rapporterer bare
aggregater for kildeobservasjoner. En slik øyeblikksmåling er
ikke en garanti for kontinuerlig dekning.

API-dokumentasjon: https://developer.entur.no/apis/graphql/vehicle-positions
