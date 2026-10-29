# InTransit Trondheim Linear – automatisk skylagring

## Én Trondheim Buss-visning (1282-punktskatalog)

Linear (både «Lineær» og «Hele kartet») og geografisk kart bruker
`trondheim-city-lines-catalog` for Trondheim Buss. Valg av en busslinje
eller «Vis alle bylinjer» endrer bare visningsfilteret, ikke tavle-ID eller
LED-nummerering. Katalogen har 1282 *logiske LED-posisjoner* for 48
registrerte ruteprofiler, **ikke 1282 holdeplasser**. Originalkartets 100
stopppunkter og 18 tegnede linjer er uendret; uavklarte Quay-koblinger
forblir OFF i stedet for å gis en automatisk, mulig feil binding.

De gamle 147-LED-profilene er ikke brukerens alternative live-visninger.
Eksisterende historikk med 147 punkter leses fortsatt for å bevare eldre
opptak; nye planlagte døgnopptak bruker katalogprofilen. Dette er
arkivkompatibilitet, ikke en parallell aktiv Trondheim-versjon.

**Utrullingssjekk:** Før sammenslåing må katalogens fullstendige live
PixelFrame verifiseres mot faktisk Cloudflare-produksjon (inkludert 1282
LED-ID-er, 200/503, belastning og ferskhet). Katalogens opprinnelige
status var «catalog-only-select-lines-before-publishing»; at den finnes
i GitHub er ikke bevis for at produksjonsfeeden støtter den.
Eksisterende fysiske tavleprofiler skal ikke endres av denne UI-migreringen.

Linear-karteditoren lagrer alltid en lokal arbeidskopi i nettleseren. Skylagring
er et **valgfritt, beskyttet tillegg** som gjør skjematiske plasseringer,
kartlinjer og visningsnavn varige på tvers av redigeringsenheter.

## Engangsoppsett av Worker

1. Bekreft at Cloudflare Worker `transitcore-led-feed` er koblet til
   `DEVICE_STATUS` Durable Object (se `worker/wrangler.toml`).
2. Legg `PUBLISH_ADMIN_TOKEN` inn som kryptert Worker secret hvis den ikke
   allerede er satt opp for eksisterende publiserings- og enhetsadmin.
3. Deploy Worker med endepunktet `/v1/admin/linear-draft`.

Bruk **ikke** GitHub Personal Access Token i editoren. Administratornøkkelen
er Worker-nøkkelen fra `worker/PUBLISHING.md` og lagres ikke i HTML eller Git.

## Bruk i editoren

1. Åpne **Hele kartet → Rediger kart**.
2. Under **Permanent skylagring**, skriv inn administratornøkkelen og velg
   **Koble til skylagring**.
3. Når status er «Skylagring aktiv» eller «Skyutgaven er hentet», vil redigering
   av navn, punkter og kartlinjer sendes automatisk til Cloudflare etter ca.
   0,65 sekunders inaktivitet.
4. Vent på **Lagret permanent i skyen** før fanen lukkes.
5. På en annen enhet åpner du den samme editoren, kobler til med nøkkelen og
   henter siste lagrede skyversjon.

Ved forskjeller mellom lokal og sentral kopi stopper synkroniseringen og tilbyr
**Hent fra skyen** og **Bruk lokal versjon i skyen**. Det skjer aldri lydløs
overskriving ved konflikt.

Ved nettverksfeil blir endringene lagret lokalt. Status viser at skylagringen
ikke er bekreftet, og editoren prøver igjen. Nøkkelen beholdes kun i
nettsidens aktive JavaScript-minne og må tastes på nytt etter en oppdatering.

## Begrensninger

- Dette er en *privat redigeringsarbeidskopi*, ikke automatisk GitHub-commit
  eller endring av offentlig originalkart. Publisering av et ferdig kart i
  `main` er en separat godkjenning.
- Brukeren må aktivere skyen ved starten av en redigeringsøkt. Uten nøkkel
  fungerer eksisterende lokale autosave som før.
- Skjemakartets GPS-/Entur-koblinger påvirkes ikke av navnealias.
- Geografiske stoppunkt og geografisk redigeringshistorikk synkroniseres ikke
  av dette endepunktet; **skjemakart og visningsnavn** er omfanget.
- Sentrale snapshots bruker optimistisk versjonskontroll. De siste
  10 forrige revisjonene beholdes i DO-lagringen for manuell gjenoppretting.
- Siden kan ikke garantere at siste endring når skyen hvis nettleseren lukkes
  umiddelbart; vent på grønn lagringskvittering.

## Testing

`node scripts/test-linear-cloud-draft.mjs` validerer autentisering, skjemadata,
cloud-revisjoner, sikker konflikthåndtering og klientens lokale fallback.
`node scripts/browser-intransit-map.mjs` tester editorens faktiske
skylagringsflyt i Chromium med en simulert, autentisert Worker.

## Publiser kartet på GitHub

Det er nå en egen **Publiser kart til GitHub**-knapp under
**Rediger kart → Permanent skylagring**.

1. Koble til med administratornøkkelen.
2. Rediger navn, holdeplasser og linjer.
3. Vent til skylagringen kvitterer med **Lagret permanent i skyen**.
4. Trykk **Publiser kart til GitHub** og godkjenn handlingen.
5. Åpne lenken **Åpne publiseringsforslag på GitHub**. Her opprettes en
   **draft-PR**, ikke en automatisk merge eller direkte endring av `main`.
6. Kontroller kartendringene og GitHub Actions. Marker PR-en som klar, og
   merge den når du ønsker å publisere på GitHub Pages.

Publiseringen henter bare den lagrede, bekreftede skyrevisjonen fra Workerens
Durable Object. Nettleseren sender **ikke** et vilkårlig kart som kan skrive
direkte i depotet. Den samme administratornøkkelen og det begrensede
`GITHUB_PUBLISH_TOKEN` fra `worker/PUBLISHING.md` brukes på Worker-siden.

### Hvorfor et eget publisert lag?

GitHub endrer **bare**
`web/linear/network/published-edits.json`. Editorens uendrede grunnkart
`trondheim-layout.json` og originalfotoet beholdes som kilde. Når PR-en er
merged, lastes de godkjente skjematiske plasseringene, kartlinjene og
visningsnavnene automatisk inn i den offentlige Linear-kartvisningen.

Denne modellen beholder originalkartets stabile fingeravtrykk, slik at en
publisering ikke gjør gamle sky- og nettleserutkast uleselige.
Eksisterende Quay/StopPlace-ID-er, verifisering og offisielle navn kan ikke
endres av publiseringsendepunktet; det kan kun publisere endret geometri og
lokale visningsnavn. Godkjent geometri er *ikke* en endring av fysiske
GPS-posisjoner eller sanntidsdata.

For øyeblikket gjelder den globale, offentlige publiseringen **skjemakartet**.
Geografiske kartposisjoner som er lagret lokalt, publiseres ikke av knappen.
Den publiserte navnevisningen i skjemakartet kan derfor være forskjellig fra
lokale navneoverstyringer i den geografiske editoren på andre enheter.

Hvis det ikke finnes en lagret skyrevisjon, eller skyen er usynkronisert,
blokkeres publisering. Ved uventet konflikt må du velge korrekt skyversjon før
du kan opprette publiseringsforslaget.

Test med `node scripts/test-linear-publish.mjs` og
`node scripts/browser-intransit-map.mjs`.

## Kontrollmodus: plattformer på venstre og høyre side

Kartet har 100 originale punkt, hvorav 65 i nåværende kilde er koblet til
to eller flere ulike `NSR:Quay`-ID-er. Disse **er ikke automatisk
godkjent som fysisk høyre eller venstre side**. Alle 100 punkt fortsetter
som felles markører inntil brukeren eksplisitt slår på «To dioder» eller
kontrollerer plattformtilordningen.

Under **Rediger kart** finnes nå:
- **Neste uavklarte plattform**: går til neste holdeplass med flere
  ufullstendig gjennomgåtte Quay-ID-er.
- **Plattformkontroll**: viser navnet, hver Quay-ID, dokumentert linje,
  retning-ID og oppgitte destinasjoner fra innlastet rutekonfigurasjon.
- Velg **Venstre på tegningen**, **Høyre på tegningen** eller
  **Ikke gjennomgått** for hver Quay.
- Oversikten viser antallet helt gjennomgåtte holdeplasser. Begge sider
  må være representert, og hver kjent Quay må ha et manuelt valg.

**Venstre/høyre her er de to markørposisjonene på den skjematiske
tegningen**, ikke en geografisk påstand om veiens sider sett i
kjøreretning. `routeDirections`-ID 0/1 brukes som informasjonskilde,
**aldri** til automatisk sideplassering.

Manuelle sidevalg lagres i `stop.platformSides[quayId]` med
`verification: "user-reviewed"`. De følger vanlig lokal og autentisert
skylagring, og kan publiseres gjennom eksisterende PR-flyt uten å
endre originalens NSR-/Quay-bindinger.

Når «To dioder» er aktivert, filtrerer venstre/høyre markør sanntidsdata
på **de Quay-ID-ene som er godkjent for akkurat den siden**. Ukjente
sider viser OFF; data fra en annen Quay får ikke aktivere den
markøren. En fysisk LED som deles av forskjellige Quays, kan ikke
skilles sikkert og blir derfor ikke brukt som sidebevis.

Dette er **kontroll av representasjonen i kartet**. Den nye funksjonen
endrer ikke datainnhenting, fysisk LED-kabling, Entur-ruter eller
GPS-posisjoner. Det forutsetter også at produksjons-Workerens
skylagring faktisk er satt opp; den ble ikke verifisert i denne endringen.

Test: `node scripts/test-intransit-map.mjs`,
`node scripts/test-linear-cloud-draft.mjs`,
`node scripts/test-linear-publish.mjs` og
`node scripts/browser-intransit-map.mjs`.


## Sanntidsmonitor for Trondheim-kartet

Under **Hele kartet → Sanntidsmonitor** finnes et skrivebeskyttet
diagnosepanel. Det kan åpnes direkte med
\`web/linear/?view=network&debug=1\`.

- Velg holdeplass og eventuelt spesifikk \`NSR:Quay\` for å se
  dokumenterte tavlekoblinger, fysisk LED-ID og observerte busser.
- Se aktiv kilde (produksjon/staging), feedstatus, tavle, framesevens,
  oppdateringsalder og TTL.
- Se årsaken til at LED ikke lyser: ugyldig/utdatert/manglende frame,
  uavklart holdeplass eller Quay, Quay uten tilknytning til aktiv tavle,
  delt/ambivalent fysisk LED, annet linjefilter, eller ingen observasjon
  på tilknyttet LED i den aktuelle framen.
- Søk etter en *kjent buss-ID* i hele den allerede mottatte framen,
  for å finne fysisk LED-ID der bussen faktisk er observert i den framen.
  Søket henter ikke GPS eller andre eksterne busser.
- Eksporter **trondheim-live-diagnose.json** med tidsstempel, identiteter,
  diagnoser, valgt linjefilter, alle kjente Quays og matchende observasjoner.
  Det eksporteres ingen administratornøkler.
- Monitoren leser bare feeden som allerede benyttes av Linear. Den
  sender ikke ekstra forespørsler og endrer aldri PixelFrame, ruteoppsett,
  LED-tilstander eller skylagring.

**Begrensning:** En buss som ikke finnes i siste gyldige frame, kan
fortsatt kjøre i området. Et kartpunkt uten vist LED beviser **ikke**
at ingen buss er i trafikk. \`source=GPS\` er bare dokumentert der
en faktisk observasjon inneholder denne kildeverdien; ellers vises
ukjent eller ETA. Det samles ikke historikk på serveren i denne fasen.

Monitorens diagnosemodell testes med
\`node scripts/test-linear-live-monitor.mjs\` og nettlesertesten
\`node scripts/browser-intransit-map.mjs\`.


## Serveropptak av én dag / demonstrasjonsarkiv

**Etter at produksjons-Worker er oppdatert**, kjører den eksisterende
Cloudflare-cronjobben hver femte minutt og henter en egen
\`trondheim-shared-stops-board\`-frame med 40 tilgjengelige AtB-linjeprofiler
på de **147 definerte tavle-LED-ene**. Dette representerer ikke alle
kjøretøy i Trondheim eller et sekund-for-sekund GPS-opptak.

- Gode frames lagres i en separat Durable Object (eksisterende
  \`DEVICE_STATUS\`-binding, \`__trondheim-day-history__\`).
- Feil på datainnhenting eller lagring blir ikke erstattet med en oppdiktet
  tom trafikk-frame: feilhendelser vises som hull. Kjøringer som ikke fant
  sted kan heller ikke rekonstrueres.
- Kun Whitelistede felt fra LED-framen lagres: board, tidsstempel,
  rekkefølge, LED-ID/tilstand/farge, tilordnede buss-ID-er, linje,
  destinasjon, datakilde og eventuelt posisjonsalder/avstand.
  Rå koordinatfelt (breddegrad/lengdegrad) blir ikke kopiert.
- Automatisk beholdes **kalenderdagen i dag og i går**, regnet i
  \`Europe/Oslo\`, slik at gårsdagens ferdige opptak kan arkiveres dagen
  etter. Dette er ikke permanent lagring av alle dager.
- **Første nesten komplette døgn** (minst 240 av normalt 288
  femminuttersmålinger og over 20 timers spenn) beholdes **automatisk**
  som demo når neste kalenderdag starter. Brukeren trenger ikke åpne
  nettleseren. Startdagen kan være ufullstendig ved deploy og blir da
  ikke automatisk arkivert. Dette er et eksplisitt kontrollert opptak,
  ikke et garantert hullfritt GPS-datasett.
- En annen ferdig dag kan beskyttes som **demoarkiv** ved å skrive inn
  administratornøkkel og trykke «Bevar valgt døgn som demo». Den
  originale dagen beholdes da i Durable Object over tid, også når de
  rullerende dagene slettes. Ny arkivering erstatter forrige demovalg.
  Nøkkelen lagres aldri lokalt.
- Opptaket er skrivebeskyttet for publikum: **GET**
  \`/v1/trondheim/history\` for status/dager, og
  \`?day=YYYY-MM-DD&limit=40&cursor=...\` for paginert frameliste.
  Demo arkiveres gjennom autentisert **POST**
  \`/v1/admin/trondheim/history/demo\` med body \`{"day":"YYYY-MM-DD"}\`.
- I **Hele kartet → Historikk** kan du laste inn en dag og spille av,
  pause, dra tidslinjen, bytte tempo, laste ned opptaket som JSON, og
  trykke «Tilbake til LIVE». Ved avspilling er LED-farger og status
  evaluert på tidspunktet for den lagrede framen, aldri mot dagens
  klokkeslett. En manglende/error-frame viser **ingen aktiv markør**,
  og grensesnittet er tydelig merket **HISTORIKK – IKKE LIVE**.
- Kartet bruker kun skjematiske stopp som allerede er registrert; en
  dynamisk, *ikke lagret* Quay/LED-kobling lar
  \`trondheim-shared-stops-board\` vise 40 linjer med riktig fysisk
  LED-mapping uten å endre NSR-verdiene i karteditoren.

Dette forutsetter at eksisterende \`DEVICE_STATUS\` faktisk er koblet
i Cloudflare-produksjon og at cron-kjøringer er aktivert. Koden/CI
kan ikke bevise at opptaket allerede pågår på live Worker; kontroller
den offentlige status-API-en etter deploy. En hel dags data finnes
først etter et faktisk døgn med registrerte kjøringer. Det er *ikke*
fem-minuttersbevis for hvert stopp eller en søkbar komplett buss-GPS-logg.

Tester: \`node scripts/test-trondheim-day-history.mjs\` og
\`node scripts/browser-intransit-map.mjs\`. Opptaksskjema v1, én demo
og fremtidig eksport er eksplisitt dokumentert.
