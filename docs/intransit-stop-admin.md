# InTransit – administrasjon av originale holdeplasser

**Åpne:** `web/linear/stops/` eller fra visningsvelgeren i Linear:
https://5mkbt4m7n8-hue.github.io/transitcore/web/linear/stops/

Panelet viser én rad per original kart-ID, med navn og kvalitet på eksisterende
koblinger og koordinater. Originalkartet har 100 stopp, 18 manuelt tegnede
linjer, 23 ubekreftede originalnavn og 32 stopp der den opprinnelige
kartkoblingen ikke er bekreftet. Disse tellingene bygger på
`network/trondheim-layout.json`, ikke på sanntids-GPS.

## Egenskaper

- Oppsummering av alle originale stopp, ubekreftede navn/koblinger og
  antall manuelt plasserte vs foreslåtte geografiske punkter.
- Søk etter navn, original-ID, `NSR:Quay` eller `NSR:StopPlace`.
  Filter for ubekreftede navn, kartkobling, manglende/foreslåtte/manuelle
  geografiske posisjoner og stopp med lokalt navn. Sorter på original rekkefølge
  eller synlig navn.
- Detaljfelt med originalnavn, eventuelt lokalt visningsnavn, koblingsstatus,
  gyldige Quay-ID-er, StopPlace-ID-er, separate GPS-/geografistatusfelt
  og skjemakoordinater uttrykkelig merket **ikke GPS**.
- Rediger/tilbakestill lokalt navn uten å endre original navnegodkjenning,
  stopp-ID eller bindinger. Lagring gjenbruker den geografiske editorens
  `intransit-geo-draft-v1` via `stop-links.js` og bevarer manuelt
  plasserte punkter og linjer.
- Naviger til den **samme original-ID-en** i «Hele kartet» eller
  «Geografisk kart». Eksporter filtrert statusoversikt som CSV.
- Utfør oversikt/filtrering på mobil. Synkronisering mellom nettleserfaner
  skjer gjennom `storage`-hendelser, ikke mellom enheter.

## Dokumentasjon og datagrunnlag

- `nameConfirmed` angir om **originalnavnet** er bekreftet. Lokalt navn
  bekrefter aldri originalnavnet automatisk.
- En kartkobling regnes dokumentert kun når det originale stoppet er
  verifisert og tilhørende Quay finnes i tilknyttet katalog/board med
  eksakt ID, StopPlace- og plattformtilhørighet.
- Et geografisk **katalogforslag** er ubekreftet selv om det har lat/lon.
  En **manuell plassering** betyr at bruker har satt punktet selv,
  ikke at faktisk GPS fra et kjøretøy er mottatt.
- Delvis skjematisk bussnett trenger ikke komplette ruter;
  hvert manuelt tegnet segment er separat fra offisiell rutedokumentasjon.
- Lesing eller redigering endrer ikke skjemategningen, 100 ID-er,
  18 originalstreker, GPS-/ETA-feed, Worker eller ESP32.
- En utdatert/ugyldig lokal geografisk arbeidskopi skal ikke overskrives
  av navneeditoren. Eksporter original arbeidskopi før nye endringer.
- CSV-eksporten gjøres i nettleseren og forhindrer regnearkformler
  fra brukerstyrte felter.

## Tester

`node scripts/test-intransit-stops.mjs`

`node scripts/browser-intransit-stops.mjs` (Playwright + Chromium)


## Gjennomgangsmodus for de 23 ubekreftede originalnavnene

Klikk **Start gjennomgang** fra `web/linear/stops/`. Modusen viser
alle stopp der originalkilden har `nameConfirmed !== true`, i den
opprinnelige rekkefølgen. Det er **23** ved denne versjonen, men listen
utledes alltid av originalkartfilen.

- Sammenlign et forstørret, uendret utsnitt av brukerens originale JPEG
  `web/linear/assets/trondheim-original.jpg` med et eget utsnitt av
  de 18 opprinnelige skjematiske linjene og stoppmarkørene.
- Originalbildet vises fra faktisk kilde, ikke en nyskapning eller
  geokodet gjetning. Utsnittet sentreres på
  `stop.source.centerPixels`; et gult siktepunkt markerer bildepikselen.
  Velg mellom tre zoomnivåer. Dersom originalbildefilen mangler eller
  størrelsen ikke samsvarer, vises en feil i stedet for et misvisende bilde.
- Bruk **Forrige**, **Neste**, stoppvelgeren eller
  **Neste ikke gjennomgåtte** for å arbeide systematisk.
- Lagre et *lokalt navneforslag* gjennom eksisterende navnekobling til
  Linear og geografisk kart. Det endrer ikke originalnavn,
  `nameConfirmed`, plattformidentitet, GPS eller offisielt rutenett.
- Lagre lokale notater og en av følgende inspeksjonsstatuser:
  **Ikke gjennomgått**, **Sett på originaltegningen** og
  **Må undersøkes nærmere**. «Sett på» er ikke offisiell
  bekreftelse av originalnavnet. Brukeren kan nullstille notat/status
  uten å slette et lagret navneforslag.
- Vis lokal framdrift og eksporter notatene som JSON sammen med
  lokale navneforslag. Ingen informasjon sendes til en server.
- Gjennomgangsnotater lagres i en **separat** nettlesernøkkel
  `intransit-stop-name-review-v1`, med fingeravtrykk av de originale
  stopp-ID-ene. En arbeidskopi laget mot en annen kartversjon blir ikke
  stille overskrevet. Navneforslag er fremdeles lagret i
  `intransit-geo-draft-v1`, slik at geografiske linjer/koordinater
  beholdes.
- Direkte lenker `?review=1&stop=original-003` åpner
  gjennomgang på riktig stopp. URL-kobling til begge kart bevarer
  samme originale stopp-ID.

Tester: `node scripts/test-intransit-stops.mjs` og
`node scripts/browser-intransit-stops.mjs`, sistnevnte kontrollerer
den opprinnelige JPG-bildelastingen, tekst, zoom, lokal lagring,
gjeninnlasting, framdrift, nullstilling, eksport og mobil.
