# TransitCore LED feed v1

LED-feeden er kontrakten mellom en datatjeneste og en fysisk TransitCore-tavle. Datatjenesten gjør Entur-oppslag, rute-/retningsmatching og logisk-til-fysisk mapping. ESP32 trenger bare å validere feeden og tegne den siste gyldige framen.

## Format

```json
{
  "schemaVersion": 1,
  "boardProfile": "trondheim-bus-board",
  "generatedAt": "2026-08-11T13:45:00.000Z",
  "sequence": 42,
  "ttlSeconds": 30,
  "ledCount": 147,
  "leds": [
    {
      "id": 0,
      "rgb": [0, 255, 80],
      "brightness": 32,
      "state": "AT_STOP"
    }
  ]
}
```

`leds` inneholder bare aktive fysiske LED-er. Alle andre LED-er skal være av.

## Regler for mottakeren

- Godta bare `schemaVersion: 1` og forventet `boardProfile`.
- Avvis en frame hvis `ledCount` ikke stemmer med tavlen, en LED-ID er utenfor området, RGB/brightness er ugyldig, eller `generatedAt` mangler.
- Erstatt hele render-framen atomisk; en ny frame er ikke en delvis oppdatering.
- Behold siste gyldige frame ved midlertidig nettverks-, HTTP- eller JSON-feil.
- Slukk tavlen når siste gyldige frame er eldre enn `ttlSeconds`.
- `sequence` skal øke for hver generert frame. En mottaker kan ignorere eldre eller dupliserte frames.

## Tilstander

- `APPROACHING`: kjøretøyet er innen tavleprofilens ytre radius.
- `AT_STOP`: kjøretøyet er innen tavleprofilens ankomstradius.

Farge og maksimal lysstyrke bestemmes av rute- og hardwareprofilen. Feed-generatoren, ikke ESP32, avgjør hvilken rute-/retningsfarge som skal brukes.

## GitHub Pages-laben

`web/feed/` er en nettleserbasert referanseimplementasjon. Den genererer og viser feeden lokalt for kontroll, men er ikke et HTTP-endepunkt som ESP32 kan hente. Et senere server-/edge-endepunkt skal implementere samme kontrakt.

