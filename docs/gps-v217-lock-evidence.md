# GPS V2.17 – skillet mellom retningshypoteser og kildebevis

## Bakgrunn

GPS V2.16 fikk `diagnosticRevision: 216` i Worker-produksjon. Det rettet
rapportering av avvist gjeldende GPS, men en eksisterende `Locked` kan
fortsatt gjentas ved en akseptert, **stasjonær** observasjon. Summen av
`Locked` er ikke antallet nye retningslåser eller faktisk passerende busser.

Enturs SIRI-VM-profil tillater `VehicleJourneyRef` eller
`FramedVehicleJourneyRef`, `MonitoredCall.StopPointRef`,
`VehicleAtStop` og tid på en gitt kildemelding:
https://entur.atlassian.net/wiki/spaces/PUBLIC/pages/637370425/SIRI-VM.
Nøyaktig join av én slik hendelse mot én anonym shadow-lås finnes **ikke**
i eksisterende offentlige døgnsummer. Det er derfor ikke mulig å måle
falsk-fysisk-retning-prosent eller knytte enkeltlåser til SIRI-hendelser
uten en separat, eksplisitt og personvernvurdert kildekobling.

Den kildeverifiserte, statiske rutemønsteroversikten i
`docs/gps-v216-source-validation.md` viser at:
- Tonstadkrysset linje 1 bruker Quay `NSR:Quay:102733` i **begge** retninger.
- Lerkendal linje 1 bruker `73729` inbound, `102720` outbound.
- Lerkendal linje 11 bruker `73420` inbound, `73421` outbound.
- Enkelte linje 11-turer besøker ikke Lerkendal.

## Endring, kun i skygge-/diagnostikk

V2.17 legger til **tre uttømmende, ortogonale oppdelinger** av hver
*aksepterte* `directionReasonLocked`, på identiske 180s-/240s-frames:

1. `lockFirst` versus `lockRepeated`: retning var hhv. ikke lagret
   eller allerede lagret i forrige aksepterte shadow-spor.
2. `lockQuaySame` versus `lockQuayChanged`: **kandidatsettet**
   er identisk eller endret, ikke bevis for flytting mellom stopp.
3. `lockTonstadShared` (bare linje 1 ved felles kilde-Quay),
   `lockLerkendalCandidate` (Quay samsvarer med statisk
   kildebasert retningsmønster) eller `lockOther`.

Hver oppdeling skal summere til `directionReasonLocked` i sin
egen 180s-/240s-variant. Verifiserte, innkommende source-event-joins
er ikke tilgjengelig; **ingen av kategoriene betyr fysisk verifisert**.
Eksisterende V2.16 `NoAfter` mot avvist GPS beholdes uendret.

Bare tellere lagres i dagsrapporten. Gamle frames uten V2.17-feltene
inkluderes ikke som null. Ingen nye Entur-kall, GPS-identiteter,
ekstra posisjonslagring, Quay-sekvenser per buss, endret TTL,
alarm, aktiv GPS, radius, LED, fysisk tavle eller korreksjon av
retningsvalget.

**Verifikasjon:** Test for begge linjer og TTL-er, første lås etter
restore, gjentatt stasjonær lås, avvist/reversert GPS, felles
Tonstadkrysset-Quay, retningsbestemte Lerkendal-Quays, sumkontrakter,
ugyldige/eldre frame-skjemaer, og at offentlig sum ikke lekker identitet.

**Utrulling:** Cloudflare har separate prod-builds fra GitHub;
PR-merge er ikke deploy. Krev live Worker-resultat
`diagnosticRevision:217` og observerte nye V2.17-`lockFrames`
før tolkning av effekten. Ingen fysisk riktig retning er sertifisert.
