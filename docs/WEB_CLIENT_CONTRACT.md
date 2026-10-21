# TransitCore – funksjonskontrakt for webklienter og staging

**Dato:** 15. oktober 2026  
**Dokument:** `docs/WEB_CLIENT_CONTRACT.md`.  
**Status:** Teknisk funksjonskontrakt og testkontrollpunkt. Ingen deploy-godkjenning. Inneholder tekniske krav og rapportert status, ikke private produktidéer.

## Plattformkontrakt

1. **TransitCore er autoritativ motor.** En kanonisk PixelFrame v1 per `boardId` fastsetter logiske LED-indekser, kjøretøytilordninger, status og datatider. Webklienter og ESP32 skal lese samme beslutning, med forbehold om separat polling, frame-sekvens, fargegjengivelse og lysstyrke.
2. **Ikke dupliser live-beregninger i nettleseren.** Klientene kan validere frame, beholde siste gyldige frame frem til TTL, vise offline/stale, animere LED-er og tilby eksplisitt simulering. Ikke lag egen produksjonslogikk for GPS/ETA/lifecycle eller fabrikerte ankomster.
3. **GPS og ETA er ikke det samme.** Uverifiserte eller utgåtte ETA-prognoser er ikke bevis på fysisk `AT_STOP`/`PASSED`. Mangel på signal og usikkerhet må være synlig i diagnostikk.
4. **Samme `boardId` for paritetskontroll.** En generell Trondheim-tavle med 147 LED-er kan ikke direkte sammenlignes med Bus1s åtte-LED-tavle. Sammenlign samme profil og helst samme PixelFrame-sekvens.

## Eksisterende brukerflater som SKAL bevares

### Tavlebygger/editor
- Design, konfigurasjon av holdeplasser/ruter/retninger, LED-/hardware-tilordning og overføring til Preview må fortsatt fungere.
- Ikke fjern kontroller eller gjøre editor avhengig av staging-token for lokal/draft-preview.

### `web/preview/?from=editor`
- Bevar eksisterende utseende, layout, interaktivitet, LED-farger/animasjoner og editor-integrasjon.
- Preview er også en **potensiell selvstendig tavlevisning** senere: arkitekturen skal ikke gjøre den til et uerstattelig engangs-demo eller kreve editor i alle kjøremodi.
- Skille mellom demo/simulert input og autoritative live-frames må være tydelig. Sikker autentisert live-preview er ennå ikke fullverifisert.

### `web/linear/?v=110`
- **Primær felt-testvisning på mobil i Trondheim**. Skal vise eksisterende holdeplass-/retningskolonner, linjevalg, flerlinjemodus, LED-farger, pulsering, etterlys, klikkinfo, kvalitetstall, diagnosepanel, visuell LED-test og mobil-layout.
- **Må bevare fargeveksling når flere kjøretøy/linjer er på samme LED.** Lokal migreringskandidat har rapportert regresjon her – dette er en blokkerende feil før kandidatcommit.
- Eksisterende webdesign skal beholdes. Når staging live kobles på, må kilden vises tydelig, og staging-credentials holdes på server/proxy, aldri i klienten.

### `web/lab`
- Funksjonen **«Vis alle samtidig»** må bevares. Lokal kandidat har rapportert at den er erstattet av lenker – regresjon som må rettes. Tilleggslenker kan beholdes, men ikke erstatte flervisning.

### `web/board/client-diagnostics.html`
- Eget teknisk test- og diagnoseskjermbilde. Skal vise riktig tavleprofil, frame-sekvens/tidsalder, LED-ID-er, kjøretøy og tilstander, usikkerhet og avvik.
- Åtte-LED Bus1 testvisning er ikke den samme som Linear sin generelle 147-LED bybusstavle.

### Øvrige webflater
- `web/board`, `web/feed`, `web/map`, `web/network`, `web/oslo` og øvrige berørte sider skal ikke miste eksisterende funksjoner ved migrering til felles kanonisk frame-klient.
- Delte komponenter for validering, TTL og sist gyldige frame skal foretrekkes fremfor kopiert separat logikk.

## Staging og deploy-krav

- Staging: Worker `transitcore-staging`, egen DO-klasse `UnifiedBusStaging`, separat historikk/state og eget tilgangstoken. Ingen deling av produksjonens DeviceStatus, OTA, device registry eller eksisterende Cloudflare runtime.
- **API-only først** for teknisk røyktest; deretter autentisert, sikker tilkobling til `web/linear` slik at bruker kan teste live fra mobilen. Aldri hardkod staging-token i GitHub Pages eller browser JavaScript.
- Staging sin wrapper og Wrangler-fil skal være identiske med godkjent bootstrap på `main`. Ingen automatisk staging-deploy; krever manuell kandidat-SHA og GitHub Environment-godkjenning.
- Hold eksisterende `transitcore-led-feed` / GråkallBoard uendret. Før enhver branch-push, verifiser om Cloudflare Builds kan trigges; opplastet «Ready»-versjon er ikke identisk med aktiv trafikkpromotering.
- GitHub-regel `Protect TransitCore main` krever PR, `bootstrap-diff` fra GitHub Actions og oppdatert branch. Testet med positive PR #209 (PASS) og negative PR #210 (forventet FAIL), begge lukket uten merge. Bootstrap PR #208 er merget som SHA `f2c7303436552f67b8617b5f7bebc1735d8b89d2`.

## Minimums-akseptanse før staging-kandidatcommit

- [ ] Ingen tap av eksisterende funksjoner i Linear (særlig fargeveksling), Lab, editor/Preview og diagnostikk.
- [ ] Målrettede regresjonstester for fargeveksling og Lab «Vis alle samtidig».
- [ ] Aktuelle motor-/frame-/staging-/Gråkallbanen-tester PASS, med tydelig registrerte unntak og Node/CI-forskjeller.
- [ ] Fullstendig liste over filer i kandidatdiff, ingen secrets, og uendrede godkjente staging-bootstrap-filer.
- [ ] Mobil og desktop browser-QA dokumentert som utført eller ærlig registrert som utestet (ingen falske PASS).
- [ ] Original lokal arbeidsmappe urørt; ingen commit, push, PR, merge eller deploy uten særskilt godkjenning.

## Verifikasjonsstatus per 15. oktober

- **Verifisert på GitHub:** PR #208 og `main`-regler / bootstrap-diff test-PR-er.
- **Rapportert av Codex lokalt:** kandidat på 20 endrede + 15 nye kodefiler, 46/46 testskript, 57 frame-regresjoner og 388 Trondheim-sammenligninger. Ikke en selvstendig CI- eller browser-verifikasjon.
- **Rapportert blokkert:** Linear-fargeveksling, Lab flervisning, autentisert live-preview/staging-browser, full mobil-QA.
- **Ikke gjennomført:** staging-deploy, feltvalidering med ny motor, Cloudflare-ytelsestest eller full fysisk ESP-paritet.

Denne kontrakten er **teknisk dokumentasjon**, ikke lanseringsbekreftelse eller godkjenning til deploy.