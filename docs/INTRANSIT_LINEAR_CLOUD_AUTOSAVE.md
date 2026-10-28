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
