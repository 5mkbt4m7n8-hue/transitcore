# Trondheim buss – daglig feltlogg, 27. oktober 2026

**Dette er en midlertidig, lesebasert logg for én dag, ikke en ny
transportdatamotor eller et permanent telemetrisystem.**

## Hvorfor

Brukeren observerte 26. oktober omkring kl. 15:30 at to busser på
linje 11 var ved Lerkendal, men at en buss ved **Lerkendal gård**
ikke kom frem i Linear. Før man endrer GPS- eller stopplogikken,
skal både den faktiske dataobservasjonen og tavleprofilens fysiske
dekning dokumenteres.

**Viktig profilfunn:**

- `trondheim-bus-board`: 147 LED-er, linje 1–3 og ingen Lerkendal gård.
- `trondheim-shared-stops-board`: 147 LED-er, linje 11 finnes på
  Lerkendal, **men ikke på Lerkendal gård**.
- `trondheim-city-lines-catalog`: 1282 LED-punkter. Linje 11:
  Lerkendal gård **LED 616/617** (NSR Quay 73414/73415),
  Lerkendal **LED 613/614** (NSR Quay 73420/73421).
  Hele katalogen er merket `catalog-only-select-lines-before-publishing`;
  den er ikke et bekreftet fysisk LED-produkt.

Dette gir en konkret **kartleggingshypotese**, ikke en verifisert diagnose
av hvilken `boardId` Linear faktisk leste under observasjonen.

## Slik logger workflowen

[Trondheim bus GPS / LED one-day audit](../.github/workflows/trondheim-day-audit-2026-10-27.yml)
på standardbranchen kjøres planlagt omtrent hvert femte minutt
**kun når lokal kalenderdato i Oslo er 27. oktober 2026**.
Hvert kjør tar flere GPS-/frame-prøver med omtrent 20 sekunders
mellomrom i litt over tre minutter. GitHub Actions-cron **kan være
forsinket eller utgå**. Den samler bare data fra etter at koden er
merget og workflowen først faktisk starter, ikke fra midnatt
eller dagen før.

Innsamlingen henter bare offentlig lesbare GET-responser:

- `/api/v1/vehicles/atb-live-all` – alle **47** eksisterende
  AtB-ruteprofiler, målt GPS, maks 90 sek gammelt.
- `/api/v1/frame/trondheim-shared-stops-board` – autoritative
  logiske LED-tilstander for 147-punktsprofilen, hvis tilgjengelig.
- `/api/v1/frame/trondheim-city-lines-catalog` – fullkatalogens
  logiske LED-tilstander, **hvis Worker tillater oppslag**.
  404/503 og ugyldige svar registreres som feil/ukjent.

Kandidater for nærhet til stopp beregnes med avstand til de
offisielle Quay-punktene i den **eksisterende** katalogprofilen.
85 meter er en **undersøkelsesradius**, ikke bevis for at bussen
har stoppet, åpnet dører, passert riktig holdeplass eller at
TransitCore har tent riktig LED. GPS og frame-snapshot kan
komme fra ulike tidspunkt og har ikke samme framesequens.
Retningen/Quay kan være tvetydig og flagges som slik.

**Personvern:** Arkivene lagrer aldri rå GPS-koordinater, ekte
vehicleId-er, autentiseringsnøkler eller komplette Worker-svar.
Et kort, dagsbundet pseudonym gjør at én buss kan telles uten
å publisere rå ID. Arkivene lagres som GitHub Actions-artifacts i
3 dager; den samlede rapporten i 30 dager. Ikke kopier rå
forflytningsdata inn i kildekoden eller GitHub-commits.

## Resultater og stoppregnskap

Klokken 00:15 Oslo-tid **28. oktober** (GitHub Actions kan forsinke
kjøringen) forsøker workflowen å slå sammen dagens observerte
prøvearkiver til `trondheim-buss-dagsrapport-20261027`. Innhold:

- `trondheim-day-report.md`: kvalitetskontroll og Lerkendal-status.
- `trondheim-lines.csv`: 47 linjer, kjøretøykandidater og prøvetall.
- `trondheim-stop-candidates.csv`: rute og Quay, stoppliste,
  geografiske nærhetsprøver og `IKKE_OBSERVERT`.
- `trondheim-report.json`: maskinlesbart tallgrunnlag.

**IKKE_OBSERVERT er aldri det samme som en manglende
stoppregistrering!** Alle busser kjører ikke nødvendigvis
hele strekningen, enkelte ruter/varianter betjener ikke alle
stopp, GPS-dekning og ruteforhold varierer, og sampling har hull.

For å bevise en reell Linear-feil må vi ha samtidige og
sammenlignbare observasjoner av samme buss, dens faktiske
GPS-tid og holdeplass/retning, autoritativ PixelFrame fra
**samme boardId** som Linear, samt helst fysisk feltobservasjon.
Først da klassifiseres hendelser i riktig kategori.

## Endringsgrenser

Dette er bare nye, isolerte Node-skript og en GitHub Actions-workflow.
Den endrer ikke Worker, Cloudflare-bindings, GPS-provider,
kanoniske tilstandsmotorer, eksisterende Linear UI, LED-koblinger,
OTA, Cloudflare-kron eller fysiske ESP32-er.

**Drift:** GitHub Actions kan bruke CI-minutter; ingen 24/7-garanti
og ingen permanent drift eller ny abonnementstjeneste. Etter 28.10
skal den tidsavgrensede cron-workflowen fjernes eller deaktiveres
ved neste dokumentasjonsopprydding. Den har datoguard og gjør
ingen nettverksforespørsler utenfor den valgte datoen.
