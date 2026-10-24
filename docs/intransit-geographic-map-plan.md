# InTransit Trondheim: geografisk kart som egen visningsmodus

## Mål

Behold det opprinnelige hvite skjemakartet og `Hele kartet` i Linear.
Legg **senere** til en valgfri, faktisk geografisk kartmodus med de
samme stopp-ID-ene, led-statusene og tegneredskapene, uten å konvertere
SVG-piksler til GPS-koordinater. Dette er en arkitekturplan, ikke en
påstand om at geografisk kart er implementert nå.

## Foreslått datamodell

Den kanoniske listen over 100 originale stopp med `original-NNN`-ID-er,
plattformkoblinger og lokal redigeringshistorikk blir liggende.
Et nytt, separat geo-lag lagres/versjoneres for eksempel slik:

```json
{
  "schemaVersion": 1,
  "crs": "EPSG:4326",
  "stops": {
    "original-000": {
      "coordinates": [10.4, 63.43],
      "verification": "pending",
      "source": "manual-unverified"
    }
  },
  "paths": []
}
```

Koordinatene i eksemplet er **kun illustrasjon**, aldri faktiske
holdeplasser. GeoJSON bruker `[longitude, latitude]`, ikke
`[latitude, longitude]`; de to lagene må aldri forveksles.

- En allerede verifisert `NSR:Quay` i kataloget kan gi et
  **foreslått punkt** (ofte hvert plattformområde). Før faktisk
  plassering lagres som godkjent må riktig retning/plattform bekreftes.
- De 23 navnløse punktene er **ekte holdeplasser** med ennå ukjent
  geokobling. Ikke gjett geografi fra posisjonen på skjemakartet.
- Begge Studentersamfundet-punktene forblir **to separate kartobjekter**.
  Ingen automatisk kollapsing på `NSR:StopPlace`.
- Realistiske kartlinjer har egne `LineString`-koordinater, separate
  fra skjemakartets polylinjer og manuelle rutegodkjenninger. Å
  plassere en holdeplass på kartet beviser **ikke** veitraseen mellom
  holdeplassene.
- Eksporter/importer GeoJSON for posisjoner og streker. Sikker
  revisjon og angre, pluss lokal arbeidskopi; påfølgende
  produksjonsoppdatering gjøres eksplisitt fra godkjente endringer.

## UI og teknologi

Et tredje valg kan være **[Lineær] [Skjemakart] [Geografisk kart]**.
Vi kan bruke **MapLibre GL JS** med godkjent kartflisekilde fra en
tilbyder; MapLibre støtter GeoJSON-lag, klikk, draggable markers
og linjetegning:
https://maplibre.org/maplibre-gl-js/docs/ .

Kartet må ha synlig `© OpenStreetMap contributors`-attribusjon
om det bruker OSM-data. Offentlig `tile.openstreetmap.org` har
kapasitets-, caching- og bruksvilkår; ved utvidet bruk bør vi velge
tilpasset fliseleverandør og ikke forhåndslaste hele Trondheim.
Policy: https://operations.osmfoundation.org/policies/tiles/

## Avgrensning og første test

Først test med et lite område og noen **eksplisitt verifiserte
NSR:Quay-ID-er**, deretter større område. Den geografiske modusen må
aldri kreve at brukeren tegner komplett bussrute fra A til B.
LED skal kun tennes etter eksisterende sannferdig datakilde (GPS
der tilgjengelig, ETA skilt tydelig), og bare for en verifisert
plattformkobling. Ingen geokoding av umerkede stopp eller automatisk
overføring av håndtegnet skjemageometri.
