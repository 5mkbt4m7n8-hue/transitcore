# Separat SIRI VM/ET-kontroll for GPS V2.17

Kontrollen kjører ved PR-endringer i sine egne filer eller manuelt. Ingen
planlagt polling, hemmeligheter, Worker-import, produksjonsskriving eller deploy.
GitHub-token har bare `contents: read`; checkout lagrer ikke legitimasjon.
Rapporten lagres som Actions-artifakt i sju dager. Rå XML, koordinater og
kjøretøy-ID lagres ikke. Offentlige tur-, linje-, mønster- og Quay-ID-er og
kildetidspunkter beholdes for etterprøving, sammen med SHA-256 av responsene.

## Beslutningsregel

To GET-kall henter AtB SIRI-VM og SIRI-ET med XML Accept og maks 10000 elementer.
`MoreData=true`, feil, ugyldig XML eller manglende kilder gir utilstrekkelig
bevis; kontrollen fyller ikke ut manglende data. Ingen retry eller abonnement.
Kildene kan være tatt på forskjellige tidspunkt. VM må være høyst 60 sekunder
gammel og ET høyst fem minutter gammel; maksimalt fem sekunders framtidsavvik.

- `CONFIRMED`: eksakt tur-ID OG eksplisitt driftsdato kobler fersk VM til én
  entydig ET-versjon, samme linje, ikke kansellert, ingen eksplisitt
  retningskonflikt, og komplett ET-stoppsekvens med stigende Order og
  tidspunkter samsvarer fullt med V2.17s kildefrosne mønster. Avgangen må være
  innenfor sekvensens tidsrom med én times margin. Flere mønster-ID-er med
  identisk sekvens og retning oppgis samlet.
- `CONFLICT`: eksakt datert tur har motstridende linje/retning, kansellering,
  eller komplett ordnet ET-sekvens avviker fra V2.17-referansen. Siste tilfelle
  kan skyldes omkjøring eller foreldet katalog, og beviser ikke GPS-feil.
- `INSUFFICIENT_EVIDENCE`: alle andre tilfeller, inkludert ukjent dato,
  annen tur-ID, delvise stopp, ukjente stopp-ID-er eller flere ET-versjoner.
  Ingen prefiksbytte, headsign-match eller antatt dato fra kalenderklokken.

Tonstadkrysset linje 1 bruker NSR:Quay:102733 i begge retninger. Derfor må
ordnet nabosekvens finnes; Quay alene beviser aldri retning. Lerkendal
kontrolleres separat for linje 1 (73729/102720) og 11 (73420/73421).
Linje 11 antas ikke å betjene Tonstadkrysset. En tur som ikke har et fokussted
gir ikke bekreftet dekning der. Stedets forrige/neste Quay finnes i JSON.
Se også [eksisterende kildekontroll](gps-v216-source-validation.md).

## Betydning for GPS V2.17

`CONFIRMED` gjelder kildekoblingen og forventet stoppsekvens. Offentlig
V2.17-rapport er aggregert og tilbyr ingen eksakt tur-/kjøretøy-/datokobling
til en bestemt produksjonslås. `gpsV217Comparison` forblir derfor
`INSUFFICIENT_EVIDENCE`, og `physicalStopConfirmed=false`. Ingen påstand om
fysisk stopp, riktig veikant eller validert LED følger av kildetreffet.

## Kjøring og resultater

`python3 -m unittest discover -s scripts -p test_siri_trip.py -v`
kjører offline regresjoner. `python3 scripts/audit_siri_trip.py` henter live
kilder. `--vm-file` og `--et-file` kan brukes for XML-replay; ferskhet vurderes
fortsatt mot kjøringstidspunktet. En grønn jobb betyr fungerende kontroll,
ikke at kildene bekrefter turene. JSON og jobbsammendrag må leses.

Første live-resultat og teststatus dokumenteres i PR-en etter Actions-kjøring.
Ingen automatisk merge eller deploy.

Kildespesifikasjon: [Entur realtime](https://developer.entur.no/open-data/realtime)
(datasetId, XML, MoreData og grense fire kall per minutt),
[Norsk SIRI-profil](https://entur.atlassian.net/wiki/spaces/PUBLIC/pages/637370420/Norwegian+SIRI+profile).
