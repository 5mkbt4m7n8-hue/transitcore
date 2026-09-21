# OTA og trådløs diagnostikk · prototype 1.2.12

## Første installasjon og logglesing

Installer 1.2.12 over USB én gang. Bruk Arduino ESP32-kjerne 3.3.11 eller
nyere, riktig ESP-modell og partisjonstabell med to applikasjonspartisjoner.
Behold enhets-ID, token, GPIO og fysisk LED-antall. S3-prototypen bruker
GPIO 14; dette må fortsatt velges i dens maskinvareprofil.

Publiser Worker og nettsiden fra samme utgivelse. Åpne web/device-log/,
skriv enhets-ID og administratornøkkel og start en økt. Nøkkelen holdes bare
i sidens minne. Loggene er ikke del av den offentlige statusresponsen.

- Økten varer 15 minutter og må startes på nytt manuelt ved behov.
- ESP oppdager økten ved neste helserapport, normalt innen fem minutter.
- Under økten sendes opptil 24 linjer hvert tiende sekund.
- ESP har en RAM-ring med 48 linjer på maksimalt 191 bytes. Gamle linjer
  overskrives; dette er ikke en tapsfri Serial-opptaker.
- Serveren beholder siste 300 linjer. Omstarter har egen boot-ID, og
  gjentatte leveranser dubleres ikke. Linjene har oppetid og mottakstid.
- Last ned tekstfil fra siden. Skjult fane slutter å lese serveren, men
  ESP-økten fortsetter til den stoppes eller de 15 minuttene er over.
- Wi-Fi-navn, passord og oppsettsinput tas ikke med. Bare utvalgte
  driftsprefikser speiles. ROM-/bootloaderutskrift og bibliotekenes egne
  logger fanges ikke.
- Ved nettutfall vises ingen nye linjer. Den eksisterende vedvarende feilkøen
  fungerer fortsatt, men RAM-loggen forsvinner ved omstart.

Ingen nye forespørsler sendes uten aktiv økt; bestillingen følger eksisterende
helserespons. En full økt gir omtrent 90 opplastinger og 90 lesninger, pluss
start/stopp og vanlig feedtrafikk. Dette fungerer også på gjestenett med
utgående HTTPS.

## Kontrollert OTA

Klienten sjekker etter to minutter, deretter hver sjette time. OTA CHECK i
Serial bestiller ny kontroll etter oppstartsperioden. Ingen nyere utgivelse
gir HTTP 204. Bare eksplisitt enhets-ID, tavleprofil, ESP-modell, GPIO og
begge LED-antall godtas. Gamle tavlebaserte/wildcard-manifester gir ingen
oppdatering.

Enhetsidentiteten ligger fortsatt i firmware. Bygg derfor neste versjon fra
samme enhets lagrede pakke med dens lokale secrets.h. Ikke bruk CI-binærfiler
eller en annen enhets pakke. Ikke publiser slike binærfiler i offentlige
repoer: de inneholder kompilerte enhetsopplysninger.

Metadata for den kompilerte applikasjonsfilen:

```json
{
  "version": "1.2.13",
  "deviceId": "grakallbanen-prototype-board-test",
  "boardProfile": "grakallbanen-prototype-board",
  "chip": "esp32s3",
  "gpio": 14,
  "ledCount": 16,
  "physicalLedCount": 16,
  "url": "https://private-firmware.example/device-specific-release.ino.bin"
}
```

```sh
node scripts/prepare-ota-manifest.mjs application.ino.bin release.json
```

Verktøyet sjekker at bildet er en ESP-applikasjon for oppgitt brikke og
beregner størrelse og MD5. Metadata må beskrive samme kompilering; verktøyet
kan ikke lese GPIO eller enhetstoken ut av bildet. Legg resultatet i
Worker-hemmeligheten OTA_RELEASE_MANIFEST først når riktig fil ligger på
HTTPS-adressen.

Klienten sjekker ledig OTA-partisjon og bruker forventet MD5 fra manifestet.
En feil nedlasting avvises før omstart. En OTA-prøveoppstart bekreftes
tidligst etter 60 sekunder, to gyldige feedhentinger og en levende LED-oppgave.
Etter fem minutter uten godkjent oppstart forsøkes rollback. Installert
bootloader må støtte rollback. Dette bekrefter programdrift, ikke fysisk lys.

## Før fysisk aktivering

Disse endringene publiserer ingen OTA-utgivelse eller enhetsbinær automatisk.
USB-installasjon, faktisk OTA, avbrutt nedlasting og rollback må testes på
en fysisk test-ESP før kanalen aktiveres. Feil partisjonstabell kan kreve USB.

Før salg: flytt enhetsidentitet til egnet vedvarende lagring, innfør signerte
bilder og autentisert binærdistribusjon, og test gradvis utrulling. HTTPS
og MD5 er ikke en digital signatur.
