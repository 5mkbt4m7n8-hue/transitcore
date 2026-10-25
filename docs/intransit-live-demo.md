# InTransit Live – DEMO-modus (ingen faktisk GPS)

## Start

Besøk [DEMO for alle registrerte ruter](https://5mkbt4m7n8-hue.github.io/transitcore/web/linear/live/?line=all&mode=demo)
eller åpne Live-busskartet og velg **DEMO – SIMULERT (uten GPS)**
under *Datamodus*. Vanlig Live-kart åpnes fortsatt i **Ekte GPS**
med mindre `?mode=demo` er uttrykkelig valgt.

- DEMO viser **to oppdiktede testbusser per registrert rute**. I
  oversikten over alle 47 kildeprofiler blir det **94 simulerte
  markører** når alle profilene kan leses.
- Alle DEMO-markører har egne `demo:linje:nummer`-ID-er og
  tydelig påskrift **DEMO**. Et stort varsel på siden og kartet,
  samt teksten i popup, følgemodus og status, sier at posisjonen
  er simulert. Ingen kilde eller UI omtaler dem som ekte GPS.
- Bussene flyttes langs eksisterende **lagrede ruteprofiler**;
  dette er ikke spor etter reelle busser, offisiell avgangstid,
  historiske posisjoner eller kjøretøydata.
- Du kan pause/fortsette, velge 0,5× / 1× / 2× / 4× fart,
  følge en demonstrasjonsbuss, sentrere kartet og vise/skjule
  stopp, ruteprofiler og individuelle linjer.
- De tidligere fokuserte visningene av linje 1, 2 og 3
  støtter også DEMO med **to testbusser per valgt linje**.
- Delbar lenke: `?line=all&mode=demo`,
  `?line=1&mode=demo` og tilsvarende for 2 og 3.

## Data- og sikkerhetsgrenser

DEMO kjører **100 % i nettleseren** med de kildeprofilene som
allerede ligger statisk i GitHub Pages. Den krever ingen
Cloudflare-versjon, Entur-token, GPS-API eller beregnede ETA-verdier.
Ingen Worker-/Entur-forespørsler skal startes mens DEMO er aktiv.

Når DEMO velges:
1. Alle ekte GPS-markører fjernes fra kartet.
2. Eksisterende GPS-kall ugyldiggjøres slik at sene svar
   ikke kan vises midt i simuleringen.
3. Polling mot Worker/Entur er deaktivert.
4. Eget DEMO-lag viser posisjoner beregnet med fast
   eksempeltempo (25 km/t før tidsmultiplikator) og reversering
   ved ende av profiltraséen.

Når **Ekte GPS** velges igjen, fjernes alle simuleringer,
DEMO-merking og følgevalg, og Live starter sine vanlige
strengt validerte målte GPS-spørringer igjen.
Ekte GPS-markører vises bare med ferske kildeobservasjoner,
maks 90 sekunder gamle, som tidligere.

Den eldre Cloudflare-feilen (HTTP 404 på GPS-endepunktet)
løses **ikke** av DEMO. På vanlig Live må fortsatt riktig
Worker-versjon aktiveres/undersøkes separat.

Hverken lokalt georedigeringsutkast, original skjemategning
(100 stopp / 18 opptegnede traséer), 47 ruteprofiler,
Worker, LED-hardware eller lokal lagring blir endret
av demonstrasjonsmodusen.

## Tester

- `node scripts/test-intransit-demo.mjs` kjører ren Node-test
  av ruteberegning på alle 47 kilder, interpolasjon,
  hastigheter og merking.
- `node scripts/browser-intransit-demo.mjs` bruker Chromium:
  start fra direkte DEMO-lenke uten Worker-kall, alle 94
  markører, pause, fart, filter, følge, linjebytte,
  overgang til ekte GPS, et forsinket GPS-svar,
  mobilbredde 390 px og ingen endring i localStorage.
- Eksisterende Live/GPS/Worker/karteditor/Linear-regresjoner
  kjøres uendret.
