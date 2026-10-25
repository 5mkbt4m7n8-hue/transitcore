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
