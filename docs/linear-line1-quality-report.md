# Trondheim Linear – automatisk kvalitetsrapport for linje 1

Prototypen leser **de samme PixelFrame-oppdateringene** som Trondheim
Linear allerede viser. Ingen nye Entur-kall, produksjonsmotor,
kartgeometri eller fysisk tavle endres.

## Åpne

Etter at denne PR-en er publisert via GitHub Pages:

https://5mkbt4m7n8-hue.github.io/transitcore/web/linear/?route=atb-bus-1-live&view=network&quality=1

Åpne panelet «Linje 1 · kvalitetsrapport».

## To datagrunnlag

**Detaljert LIVE:** Rapporten teller observasjoner per eksakt
`NSR:Quay` for linje 1 fra de gyldige PixelFrame-meldingene
som nettleseren mottar. Et treff kan være eksplisitt
`entur-siri-provider-stop` / `providerReportedAtStop`,
GPS-nærhet til eksakt Quay/LED,
eller uavklart GPS nær en Quay fra `gpsObservations`.
InTransit A→B→C-trackeren bidrar med konkrete
`GAP`, `CONFLICT` og `NOT_VISIBLE`-hendelser, knyttet til
siste observerte Quay. Disse er *sporingsavvik*, ikke en
konklusjon om fysisk kjøring. Frames og hendelser samles lokalt
i nettleseren, beholder opptil 400 frames og maksimalt ett døgn
av data; alle identiske frames og rutehendelser dedupliseres.
Produksjon og staging telles separat.

**Lagret døgn (automatisk):** Fra «Datagrunnlag → Lagret døgn
→ Hent datoer» velges en dato, deretter «Analyser valgt dato».
Panelet leser eksisterende `/v1/trondheim/history` med
paginering, uten ekstra provider-polling. Den eksisterende
Trondheim-Workeren lagrer fortsatt et øyeblikksbilde
**hvert femte minutt** i en Durable Object, uansett
om nettleseren er åpen.

**Nye opptak:** Fra denne versjonen blir også et lite
`quality`-sammendrag tatt direkte fra den *rå* gyldige
PixelFrame-en **før** den komprimeres for lagring:
`NSR:Quay` og antall SIRI-bekreftelser, GPS-nærhet,
LED-only og eventuelle uavklarte GPS-treff. Kilde-ID-er,
vehicle ID-er og GPS-koordinater følger ikke med i dette
sammendraget. Kun eksakte Quays fra kildekatalogen blir
telt. Feil i originalfeeden lagres som historikkfeil;
ingen feil konverteres til «tom holdeplass».

**Eldre opptak:** Tidligere femminuttersopptak
mangler kildebevis og vises fortsatt som **LED-only**.
Rapporten opplyser hvor mange av dagens gyldige
målinger som har kildeberikede Quay-tall, og hvor mange
som faktisk har tilgjengelig GPS-avvisningsdiagnostikk.
Tomme felter merkes «–» i stedet for falske nullverdier.
Døgnets tidsluker og mislykkede frames er synlige.

**Hyppigere GPS-kontroll av linje 1 (fra denne versjonen):**
Eksisterende hovedopptak kjøres fremdeles på minutt 0, 5, 10 osv.
En ekstra, separat Worker-cron kjører på minutt 2, 7, 12 osv.,
men **bare linje 1**. Den henter ett Entur vehiclePositions-utvalg
for AtB, filtrerer til linje 1 og beregner eksisterende
Quay/LED-matching. Ingen ekstra SIRI-/ServiceJourney-oppslag
eller ny polling av øvrige linjer, flybuss og T-bane.

Mellommålingen lagrer bare aggregerte GPS/Quay-tellerdata,
eller en eksplisitt feilmelding, i samme Durable Object med
separat nøkkelrom. Hovedhistorikken og femminutters-demoen
endres ikke. De to opptaksseriene gir til sammen normalt
**ett målepunkt hvert 2.–3. minutt**, rundt 24 målinger per time
hvis oppgavene faktisk kjører og Entur svarer.

Døgnrapporten laster automatisk begge serier, teller
antall brukbare mellommålinger og viser serverfeil og
diagnostikkdekning. De ekstra GPS-målingene er ikke
SIRI-stoppbekreftelser. Dette er fremdeles diskrete
observasjoner; mellomliggende stopp og fysisk passering
skal aldri fylles inn på gjetning.

Oppsett: `worker/wrangler.toml` har tre cron-uttrykk,
med ekstra `2-59/5 * * * *`. Etter GitHub-merge må den
nye Worker-versjonen være aktiv i Cloudflare før målingene
faktisk starter. Ingen fysiske tavler berøres.

**Automatisk prioritering:** Ved opplagte
kilde-diagnostikkdata kan opptakene rangere Quays
med faktisk uavklart GPS. Historiske femminuttersopptak
brukes **ikke** til å rekonstruere uobserverte stopp,
spore kontinuerlige turer eller påstå fysiske avreiser.
Hvis avvisningsdiagnostikken mangler, vises ingen
oppdiktet «verste holdeplasser»-liste.

## Toppliste – stopp som bør undersøkes først

**Prioriterte stopp (maks 10)** vises øverst i tabellen. Listen
bygger **utelukkende på registrerte liveavvik** på en konkret Quay:
konflikter i rutefølgen, busser som ikke lenger er synlige i
mottatte frames, sprang mellom observerte Quays og kildeoppgitte
uavklarte GPS-matcher. Den er **ikke** en fasit over feilaktige
holdeplasser.

Sortering gir ekstra vekt til motstridende Quay-følge,
deretter bortfalt sporing, uobserverte mellomstopp og
uavklart GPS. Disse vektene er kun sorteringshjelp;
samme GPS-avvik kan dukke opp i flere frames. Hvert forslag
viser antall gyldige frames og hvor mange av dem som
faktisk inneholder detaljert GPS-diagnostikk.

Knappen **«Vis stopp på kart»** bruker Quay-bindingene
fra det originale `trondheim-layout.json` og fokuserer
eksisterende markør – ingen nye stopp eller kartkoordinater
opprettes. Ved ukjent/tvetydig kobling vises en melding,
ikke et gjettet stopp.

Dersom ingen ekte avvik ble observert, vises
**ingen toppliste**. Ved utilgjengelig detaljdiagnostikk
vises en uttrykkelig advarsel om begrenset grunnlag.
Fem-minutters serveropptak fra **før** dette
tillegget kan ikke rangere spesifikke GPS-/SIRI-avvik.
For **nye** opptak kan Quays med dokumentert
uavklart GPS prioriteres når de nødvendige
diagnosefeltene faktisk følger med fra kilden. Listen
er en undersøkelsesliste, aldri en feilprosent.

## Slik tolkes tabellen

- **SIRI:** antall positive, kildestøttede observasjoner på Quay,
  ikke antall forskjellige busser eller fysisk dokumenterte stopp.
- **GPS:** antall nærhetsobservasjoner, ikke stans.
- **LED:** antall LED-registreringer uten beholdt kildebevis.
- **Uavklart:** uavklarte GPS-observasjoner på eksakt Quay.
- **Forsvunnet:** bilen er ikke lenger i gyldige
  innkommende frames; dette kan være kommunikasjonsbrudd,
  GPS-avvik eller reell avreise.
- **Konflikt / hull:** ruteobservasjoner som ikke stemmer
  med kildekatalogen eller ikke dekker mellomliggende stopp.
- **Ingen observasjon:** ingen relevante treff i dette
  begrensede tidsutvalget. Dette er **ikke** det samme
  som at holdeplassen er feil.

Rader med avvik sorteres først, deretter etter antall
observasjoner. Rapporten kan eksporteres til JSON for å
sammenligne flere dager senere.

Den lagrede rapporten inneholder kun aggregerte tellerdata
og offentlige Quay-ID-er/navn, ingen rå VehicleRef,
ServiceJourney-ID eller GPS-koordinater.

## Begrensninger

Historiske treff viser et utvalg av sanntidsbilder – ikke
hele antallet planlagte eller gjennomførte stopp. En
prosentvis «treffsikkerhet» ville derfor vært misvisende
uten uavhengig fasit. Rapporten presenterer **ikke**
en oppfunnet prosentvis nøyaktighet eller «100 % korrekt».
Testførst: se på gjentatte avvik, ta vare på JSON, og
rett konkrete feil fortløpende.

Regresjoner: `node scripts/test-line1-quality-report.mjs`,
`node scripts/test-line1-route-progress.mjs` og
`node scripts/browser-intransit-map.mjs`.
