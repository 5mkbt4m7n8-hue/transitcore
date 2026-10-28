# InTransit Trondheim Linear – automatisk skylagring

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
