# InTransit Trondheim – geografisk kart (første versjon)

Startside: `web/linear/geo/index.html`.
GitHub Pages: https://5mkbt4m7n8-hue.github.io/transitcore/web/linear/geo/

## Hva er implementert

En selvstendig kartvisning **ved siden av** eksisterende Linear og
«Hele kartet», basert på Leaflet 1.9.4 og OpenStreetMap-fliser. Det finnes nå en tredje lenke **Geografisk kart** i
visningsvelgeren på Linear-hovedsiden. Den åpner den separate
karteditoren, med en lenke tilbake til Linear/skjemakart.

- Det originale skjemakartet og alle de 100 originale stopp-ID-ene
  forblir uforandret. De 23 navnløse stoppene er reelle stopp,
  men får **ingen oppdiktede geografiske koordinater**.
- Koordinater fra bekreftede stopp-til-Quay-koblinger i eksisterende
  bordkatalog gir **ubekreftede kandidatplasseringer**, ikke
  ferdig godkjent geografi. Sprik over ca. 125 meter mellom de
  tilknyttede plattformene gjør kandidaten uavklart.
- Brukeren kan velge et stopp, velge «Plasser valgt stopp», og trykke
  på kartet for å fastsette faktisk `[lon,lat]`. Dette er en
  **brukerverifisert** posisjon, lagret separat fra skjemapunktet.
  «Tilbakestill dette stoppet» fjerner den manuelle plasseringen.
- «Tegn ny trasé» + flere karttrykk legger til en geografisk
  linje etter «Fullfør». «Fjern siste punkt» og «Avbryt» støttes.
  Traséen er *manuell geometri*, ikke bevis for faktisk kjørt rute.
- Stopp og linjer kan eksporteres og importeres som **GeoJSON**
  (`FeatureCollection`). Manuelle data lagres også i
  `localStorage` på **samme nettleser og enhet**, med utkastversjon
  knyttet til opprinnelige stopps ID-er. «Forkast geografiske endringer»
  sletter lokale tilpasninger.
- Visningen bruker eksisterende tavlefeed og skiller uttrykkelig
  mellom ETA og GPS. Bybuss, felles busstopp og FB73 kan velges.
  Dette gir ikke ny kjøretøysporing, og ingen buss beveges langs
  geografiske linjer uten en faktisk posisjonskilde.

## Viktige avgrensninger

1. Skjemakartets `viewBox` er **ikke** koordinater i WGS84, og
   konverteres ikke med interpolasjon eller geokoding.
2. De to Samfundet-markørene kan fortsatt representere ulike
   plattformer; ingen automatisk StopPlace-sammenslåing.
3. Brukeren må selv kontrollere kandidatplasseringer og godkjenne
   dem, selv om en Quay-posisjon finnes i katalogen. En
   Quay kan ha et punkt midt i perrongområdet, ikke nøyaktig
   fysisk LED-plassering.
4. GeoJSON `coordinates` er `[longitude,latitude]`.
5. Eksisterende Worker, ESP32 og produksjons-LED-motor er urørt.
6. GitHub Pages trenger nettforbindelse til Leaflet CDN og OSM.
   Offentlige OSM-fliser brukes bare ved vanlig interaktiv navigasjon,
   **ikke** til forhåndshenting/offline/bulk scanning:
   https://operations.osmfoundation.org/policies/tiles/
7. Denne versjonen er en første prototype. Automatisk snapping
   til vei, ruteverifisering, flerbrukerlagring, kartflisetilbyder for
   større trafikk og synkronisert redigering mot GitHub er ikke levert.

Referanser: https://leafletjs.com/download.html
og https://developer.entur.no/docs/open-services/journey-planner
