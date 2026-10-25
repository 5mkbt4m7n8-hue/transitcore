# InTransit Diagnostics – lesebasert kontrollpanel

Åpne `https://5mkbt4m7n8-hue.github.io/transitcore/web/linear/diagnostics/`
eller **Diagnose** i navigasjonen på Linear, Live-busskartet,
karteditoren eller holdeplassadministrasjonen.

## Hva panelet undersøker

Trykk **Kjør full kontroll**. Nettleseren foretar **kun offentlige
GET-forespørsler** (ingen endringer i eksisterende Worker, LED-system,
lagrede geografiske utkast, skript eller kontoer):

1. **Worker API-helse:** `/api/v1/platform/health` må gi JSON
   med `api.status=ok` og `api.version=1`.
2. **Felles GPS-feed:** `/api/v1/vehicles/atb-live-all` må gi
   `measured-vehicle-position` for 47 registrerte linjer.
3. **Tre enkeltlinjer:** Separate GPS-endepunkter for linje
   1, 2 og 3. Hvert svar valideres mot eksakt AtB-linjekode.
4. **Alle 47 geografiske ruteprofiler:** Kontroll av hver
   eksisterende `config/routes/atb-bus-N-live.json`: HTTP,
   gyldig JSON, AtB-kilde, forventet original ID/linjekode,
   faktiske koordinater og NSR-stopp.

Rutefilene lastes med maksimalt seks samtidige forespørsler.
Kartet får ikke en fiktiv rute dersom en fil ikke kan leses.

## Slik leses resultatene

- **OK:** Endepunktet returnerte forventet JSON, eller kildefilen
  inneholdt en gyldig kartprofil.
- **0 FERSKE:** GPS returnerte HTTP 200 med riktig struktur,
  men ingen GPS-observasjoner var innenfor 90 sekunderskravet.
  Dette er ikke bevis for at kjøretøy ikke er i trafikk.
- **HTTP 404:** Nettleseren fikk et lesbart HTTP 404-svar.
  Endepunktet finnes ikke på tjenesten nettleseren treffer.
  Det kan tyde på at riktig Cloudflare-versjon ikke er aktiv;
  panelet kan **ikke** konkludere hvilken versjon som er aktiv.
- **HTTP 503:** Ruten svarte, men meldte om kildeproblem.
- **NETTVERK/CORS:** Nettleseren kunne ikke lese statusen.
  Ikke anta at dette er en 404 eller at Entur mangler GPS.
- **UGYLDIG SVAR:** Et HTTP 200-svar manglet forventet API-,
  linje- eller GPS-kildefomat, eller rutefilen hadde feil data.
- **TIDSAVBRUDD:** Ingen lesbar HTTP-status innen tidsgrensen.

Panelet viser lesbar HTTP-status, målt svartid,
kontrolltidspunkt, antall ferske, målte GPS-observasjoner og
**nyeste gyldige GPS-måletid** når den finnes. Alt er
øyeblikksobservasjoner målt fra nettleseren.

## Hva panelet ikke kan gjøre

Det kan ikke lese Cloudflares private deploymentversjon, fremtvinge
en utrulling, bevise kontinuerlig GPS-dekning eller omgå CORS-regler.
Hvis prod-Worker fortsatt svarer 404 etter PR-merging, må aktiv
deployment kontrolleres i Cloudflare separat.

Det gjør ingen direkte anrop til Enturs API fra nettleseren;
GPS-svar kommer bare via den offentlige Worker-ruten.
Ingen beregnede eller syntetiske bussposisjoner vises.

## Eksport

**Eksporter statusrapport (JSON)** lager en lokal fil med
HTTP-koder, teststatuser, svartider, kontrolltidspunkt,
antall stopp/punkter i ruteprofiler og aggregerte GPS-tall.
Ingen råsvar, individuelle kjøretøy-ID-er, GPS-koordinater,
tokens eller autentiseringsdetaljer følger med.
Eksporten kan deles for feilsøking dagen etter.

Ingen localStorage-, cookie-, Worker-, device- eller
kartredigeringsdata skrives av kontrollpanelet.

## Tester

`node scripts/test-intransit-diagnostics.mjs`

`node scripts/browser-intransit-diagnostics.mjs` (krever Chromium
og Playwright via eksisterende geo-workflow)

Chromium-testen kjører alle 47 profilene, simulerer lesbar HTTP 404,
503, manglende ferske GPS-observasjoner, blokkert nettverk/CORS,
gyldige ferske målinger, re-kjøring, redigert rapport uten private
kjøretøydata og 390px mobiloppsett. Eksisterende tester for
Worker, Live-kart, 100 originale stopp og geografisk editor
beholdes.
