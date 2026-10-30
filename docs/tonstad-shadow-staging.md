# Tonstadkrysset – isolert Cloudflare-staging (kandidat, IKKE deployet)

**PR #279. NO-GO for merge og produksjon.** Denne kandidatens kildekode
ble bygd med `wrangler deploy --dry-run`; ingen Worker ble distribuert.

## Separasjon

| Egenskap | Kandidat | Eksisterende produksjon |
| --- | --- | --- |
| Worker | `transitcore-tonstad-shadow-staging` | `transitcore-led-feed` |
| Wrangler | `worker/wrangler.tonstad-shadow-staging.toml` | `worker/wrangler.toml` |
| Entry | `worker/tonstad-shadow-staging-worker.mjs` | `worker/led-feed-worker.mjs` |
| Durable Object | ny SQLite `TONSTAD_GATE` / `TonstadStagingGate` | `DEVICE_STATUS` |
| Cron, produksjons-API, ESP, hardware, produksjonshistorikk | Ingen | Uendret |
| Nettverkskall til Entur | Kun ved manuelt autorisert POST | Uendret |
| Datadeling | Kun aggregert, personvernbegrenset testrespons | Uendret |

**Ingen rutemønstre, LED-katalog, produksjonsbindings, Cloudflare
hemmeligheter eller cronjobber deles eller modifiseres.** Koden
leser den inncheckede tavlekatalogen og rutefilen, men skriver
aldri til dem.

## Endepunkter og kildebudsjett

- `GET /health` gir kun status `NO_GO`; ingen kildetilgang.
- `POST /v1/probe` krever headeren `x-probe-token` med en
  *staging-spesifikk* hemmelighet `STAGING_PROBE_TOKEN`
  (minimum 32 tegn; **ikke** en produksjonshemmelighet).
- Alle andre forespørsler avvises. Ingen automatisk polling.
- Én SQLite Durable Object (fast identifikator `tonstad-shadow-v1`)
  reserverer **120 sekunders varig cooldown** atomisk før
  hvert kildeoppslag – også ved Entur-feil. Cooldown er felles
  på tvers av Worker-instanser og datacentre.
- Hvert godkjente kall gjør **maksimalt én** SIRI-VM request,
  **én** Vehicle Positions request, og **to**
  `ServiceJourney`-oppslag; ingen retry ved HTTP 429.
- Hvert kilde- og identitetstreff behandles med samme
  `joinSiriVehicleToServiceJourney`,
  `evaluateEnturStopEvidence` og
  `evaluateTonstadShadowFrame` som tidligere er testet.
  Bare `NSR:Quay:102733` kan løftes til simulert AT_STOP;
  Østre Lund og alle andre tvetydige plattformer kan ikke det.

Ved manglende bevis blir simulert LED avslått og årsaken rapportert.
Utdata inkluderer offentlig Quay-ID, simulerte LED-nummer,
hvor mange bekreftede stoppmeldinger som støttes, og filtrerte
diagnosefelt. **Ingen rå kjøretøy-ID, tur-ID, koordinater eller
rå XML sendes i responsen.** At leverandøren melder
`VehicleAtStop=true` er sterkere enn ren GPS, men ikke
uavhengig fysisk verifikasjon.

## Sikker validering uten deploy

```sh
node scripts/test-tonstad-shadow-staging.mjs
node scripts/test-shared-quay-frame-shadow.mjs
npx --yes wrangler@4.43.0 deploy \
  --config worker/wrangler.tonstad-shadow-staging.toml \
  --dry-run --outdir /tmp/tonstad-shadow-staging-dryrun
```

Den særskilte GitHub-arbeidsflyten
`tonstad-shadow-staging-checks.yml` kjører testsuite og
kompileringskontroll uten å røre Cloudflare-konto.
De gamle skrivebeskyttede Entur-pollene er fortsatt kun
`workflow_dispatch`; de startes ikke automatisk ved hvert PR-push.

## Før eventuell manuell utrulling

1. Kontroller i Cloudflare at produksjonsintegrasjonen kun deployer
   `worker/wrangler.toml` og at den **ikke** automatisk kjører
   stagingkonfigurasjonen. Merk at merge av PR-endringer i
   `worker/*` kan trigge eksisterende produksjonsdeploy
   gjennom Git-integrasjon, selv om innholdet er staging-relatert:
   **IKKE merge før denne risikoen er håndtert.**
2. Klargjør en egen staging Worker med eget navn, DO-namespace,
   separate rettigheter og en tilfeldig hemmelighet på minst
   32 tegn i `STAGING_PROBE_TOKEN`. Aldri kopier
   produksjonstokens eller DeviceStatus-namespace.
3. Innhent eksplisitt godkjenning til å gjennomføre en
   **staging-only** `wrangler deploy` med *den spesifikke*
   `worker/wrangler.tonstad-shadow-staging.toml`; dette
   dokumentet utfører ikke deployment.
4. Etter stagingdeploy: bekreft ingen cron eller produksjonsruter,
   ubekreftet POST → 403, korrekt token → isolert testrespons,
   neste POST innen 120 sekunder → 429 og **0 ekstra Entur-kall**.
5. Test faktiske linje 1-passeringer i begge retninger. Verifiser
   fysisk LED-ID og at ingen falsk AT_STOP markeres. Undersøk
   ratebegrensninger og kildetilgjengelighet over tid.
6. Deretter separat go/no-go for videre staging og
   produksjonskandidat. Denne Workeren har **ingen**
   produksjons-/LED-aktivering eller utløpsdato for
   prøveperioden; stagingkallet må fortsatt være manuelt.

**Status:** kun kode, automatiske tester og compile-only dry-run.
Ingen skriftlig autorisasjon, tokenoppsett, staging-Worker-URL
eller Cloudflare-deploy er utført.
