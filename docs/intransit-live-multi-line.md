# InTransit Live – busslinjevelger 1, 2 og 3

## Bruk
Åpne `https://5mkbt4m7n8-hue.github.io/transitcore/web/linear/live/`.

Live-kartet har nå et mobilvennlig linjevalg over kartet. V1 har
AtB-busslinjene **1, 2 og 3**, basert på de originale
`config/routes/atb-bus-{1,2,3}-live.json`-filene.

| Linje | Ruteprofil | Holdeplasser | Punkter i profilen |
|---|---|---:|---:|
| 1 | Ranheim – Strindheim – sentrum – Tiller – Heimdal – Kattem | 32 | 98 |
| 2 | Strindheim – Lade – sentrum – Lund | 30 | 70 |
| 3 | Lohove – sentrum – Hallset | 24 | 71 |

Hver valgte linje leser bare sin registrerte ruteprofil. AtB/NSR
Quay-identiteter, original koordinater, rutegeometri, navn og kildebevis
endrer seg ikke. Som tidligere dekker en lagret profil ikke
nødvendigvis alle faktisk kjørte varianter.

Du kan også åpne `?line=2` eller `?line=3` direkte.
Bytte av linje bevarer om du har skjult holdeplasser eller
ruteprofil, men nullstiller GPS-markører og eventuell følge-modus.
En feil ved lasting av ny profil lar den gamle ruten bli stående.

## Målt GPS uten krysskobling

Den eksisterende, isolerte Cloudflare Worker-ruten for
`/api/v1/vehicles/atb-line-1` er utvidet med:
`/api/v1/vehicles/atb-line-2` og
`/api/v1/vehicles/atb-line-3`.

Serveren forespør Entur Vehicle Positions v2 for `codespaceId=ATB`.
Bare valgte linjers *eksakte* `publicCode` slippes gjennom.
Responsen inneholder eksplisitt `ATB:Line:2_N`,
`publicCode=N` og `measured-vehicle-position`.
Nettleseren kontrollerer disse feltene på nytt før markører vises.
Hver enkelt observasjon må være gyldig og høyst 90 sekunder gammel.

Et sent svar fra linje 1 forkastes etter bytte til 2 eller 3.
Alle gamle markører fjernes før linjebytte, og følgemodus avsluttes.
GPS for feil linje eller feil datakilde blir avvist. Det beregnes
ikke framdrift ut fra ETA, rutetrasé eller GPS-data fra andre linjer.

## Utrulling og viktige begrensninger

GPS-API-et har returnert HTTP 404 i produksjon selv når
GitHub har merget koden og Cloudflare har bygget versjonen.
Denne utvidelsen verken aktiverer en Worker-versjon eller
bekrefter at GPS er operativ i produksjon. Sjekk aktiv versjon
i Cloudflare når det passer. En gyldig respons fra testsimulatoren
beviser ikke at akkurat den offentlige ruten er aktiv.

Ved 404/503/nettverksfeil forblir **ruteprofil og holdeplasser synlige**,
men bussmarkører er tomme. En vellykket enkelt-observasjon
fra Entur sier heller ikke at kontinuerlig posisjonsdekning er garantert.

Ingen endringer i original Linear-tegning, 100 originale stopp,
18 skjematiske linjer, lokale redigeringsutkast, Oslo T-bane,
FB73, fysisk LED-logikk, DO/OTA eller eksisterende frame-endepunkter.

## Tester
- `node scripts/test-intransit-live.mjs`
- `node scripts/test-intransit-multi-line.mjs`
- `node scripts/test-atb-line1-gps.mjs`
- `node scripts/browser-intransit-live.mjs` i Playwright/Chromium

Tester validerer ruteprofiler, stopptall, eksakt GPS-kobling,
linjebytte, mobilvisning, følge-funksjon, deep links og
at feil kilde aldri kan bli en GPS-markør.
