# Tonstadkrysset – test direkte i Trondheim Linear

Dette er en **nettbasert testvisning**; ingen fysisk tavle finnes
eller brukes. Koden endrer ikke den originale rutetegningen,
kartnoder, Quay-ID-er eller LED-katalogen.

## Åpne testpanelet

Etter at endringen finnes på GitHub Pages:

https://5mkbt4m7n8-hue.github.io/transitcore/web/linear/?route=atb-bus-1-live&view=network&stop=original-075&tonstad=1

Panelet **«🧪 Tonstadkrysset · sanntidstest for linje 1»**
er åpent når `tonstad=1` er oppgitt. Knappen **«Vis på Hele
kartet»** fokuserer eksisterende stopp `original-075`.
Datakilde velges med den eksisterende produksjon/staging-velgeren.
Panelet følger samme 10-sekunders PixelFrame-oppdatering; det
sender ingen ekstra forespørsler til Entur.

Det spesifikke Quay-et er **`NSR:Quay:102733`**, og det får
nøyaktig én LED-posisjon i `trondheim-city-lines-catalog`,
uavhengig av hvilken retning buss 1 har. Andre Quays innen
samme StopPlace er ikke slått sammen.

## Hva vises?

- **Entur-bekreftet**: aktivt, ferskt `AT_STOP` for den eksakte
  Quay-en; `positionType=entur-siri-provider-stop` og
  `providerReportedAtStop=true`. Antall med kildebekreftet
  `inbound/outbound` vises bare når transportfeeden faktisk har
  bekreftet dette med `ServiceJourney`. Dette er kildebevis,
  ikke en uavhengig fysisk sensor.
- **Kun GPS**: en buss har blitt plassert ved Quay-en, men ingen
  eksplisitt SIRI-stoppmelding er påvist. Dette er **ikke**
  det samme som å stå på holdeplassen.
- **Uavklart GPS**: hvis en diagnostikk-frame eksplisitt
  angir `nearestQuayId=NSR:Quay:102733` og
  `status=unresolved`, vises filtrerte avvisningsgrunner.
- **Ingen observasjon**: valgt feed viste ingen match i siste
  gyldige frame. Det er **ikke** et bevis for at ingen buss
  kjørte forbi.
- **Utdatert/feil tavle**: ingen buss oppgis som bekreftet.

Visningen forutsetter en faktisk feed med SIRI-berikelse for å
få status **Entur-bekreftet**. Koden alene kobler ikke Entur
SIRI til produksjonsfeeden. Den eksisterende ordinære
Trondheim-feeden kan derfor fortsatt vise null kildebekreftede
stopp selv når Entur har registrert dem, og det skal ikke
forveksles med en påvist feil i selve Quay-mappingen.

## Testdekning og feilretting

`scripts/test-tonstad-live-test.mjs` dekker kildebevis begge
retninger, to kjøretøy på samme LED, ren GPS uten bekreftelse,
uavklart GPS, feil Quay, manglende kartbinding og
utdatert/feil feed. `scripts/browser-intransit-map.mjs`
kontrollerer at det nye panelet viser riktig
LED-nummer for Quay i faktisk nettleser. Ingen nye
stopp eller linjer er tegnet.

Endringer er enkle å reversere i GitHub om livekartet viser
feil. Hensikten er å finne feil raskere, ikke å skjule dem
bak omfattende stagingprosesser.
