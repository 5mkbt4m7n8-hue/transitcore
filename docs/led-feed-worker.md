# LED-feed som HTTP-endepunkt

`worker/led-feed-worker.mjs` er en Cloudflare Worker som leverer TransitCore LED feed v1.

## Endepunkter

- `GET /health`
- `GET /v1/boards/trondheim-bus-board/frame`

Worker-en laster tavle-, rute- og hardwareprofilene fra GitHub, cacher konfigurasjonen i fem minutter, henter live kjøretøy fra Entur og returnerer en full fysisk LED-frame med `Cache-Control: no-store`.

## Første publisering

1. Opprett en gratis Cloudflare-konto og åpne **Workers & Pages**.
2. Opprett en Worker med navnet `transitcore-led-feed`.
3. Lim inn innholdet fra `worker/led-feed-worker.mjs`, eller koble GitHub-repositoriet til Cloudflare og bruk `worker/wrangler.toml`.
4. Publiser og åpne `/health` på Worker-adressen.
5. Kontroller frame-endepunktet før adressen legges inn i ESP32-firmwaren.

Ingen Entur-nøkkel eller Wi-Fi-hemmelighet skal lagres i GitHub eller Cloudflare. `ET-Client-Name` identifiserer bare klienten.

## Drift

Worker-en er stateless. `sequence` er derfor Unix-tid i sekunder og øker uten behov for database. ESP32 skal avvise ugyldige frames, beholde siste gyldige frame ved korte feil og slukke når `generatedAt + ttlSeconds` er passert.

