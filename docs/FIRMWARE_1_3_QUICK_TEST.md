# Firmware 1.3.x – vanlig ESP32 på 15–20 minutter

Start med [reiseguiden](FIRMWARE_1_3_TRAVEL_TEST.md) for konkret bygg/flashing,
Snapshot A/B/C og Fleet-felter. Fase I-B krever selektiv config-endpoint-test for
Q15; uten tilgjengelig kontrollert testoppsett markeres den BLOCKED.

Denne testen gjelder vanlig ESP32. Den gir ikke godkjenning av S3, OTA eller soak.
Bruk en allerede kompilert/provisjonert 1.3.x med riktig GPIO, LED-antall og
enhetsidentitet. Nedlastingspakken har fortsatt 1.2.13 som standard. Ikke flash
CI-fixturen med CI_ONLY-hemmeligheter eller syntetisk GPIO.

## Før du starter

- Klargjør lokal JSON fra ../hardware-tests/examples/esp32-quick-test.json.
  Noter firmware, firmware-commit, modul, profiler, flash og partisjon.
- Ha et kjent Wi-Fi/hotspot du selv kan slå av/på, og Fleet-adgang.
  Ikke endre jobbnettets brannmur. En fungerende Worker er nødvendig.
- Serial Monitor: 115200 baud. Åpne den før en planlagt reset slik at [BOOT]
  fanges. USB/monitor kan selv utløse reset; noter det som planlagt.
- Sett av maks 20 minutter etter flashing. Ukjent oppsett/feilsøking utover dette
  markeres BLOCKED og tas senere. Ingen kontinuerlig logging kreves.
- Ta tre korte snapshots: A cold boot, B LIVE/frame/status, C reconnect og en
  separat planlagt reboot. Lagre dem lokalt uten credentials.

## Testrekkefølge

0–5 min: Q01–Q09 og første boot-verdier Q10–Q12. Første health-forsøk skjer etter
stabil Wi-Fi; vanlige senere forsøk følger config (300–900 sekunder).

5–8 min: Q13, slå hotspot av i ca. 45 sekunder. Ikke forvent at tavlen forblir
tent etter TTL: ved utløpt gyldig frame er slukking forventet.

8–10 min: Slå nett på igjen og bekreft Q14 uten reset først. Noter uendret
bootId/bootCount og økende uptime. Gjør deretter én separat planlagt reset for
Q10–Q12. Q15 gjennomføres bare med kontrollert selektiv config-endpoint-blokkering
som beskrevet i reiseguiden; ellers BLOCKED.

10–20 min: Kontroller Q16/Q17. Første config etter tilkobling kan
bli LIVE med en gang; hvis et forsøk har feilet er retry normalt fem minutter.
Fleet kan henge etter neste health-intervall (opptil 15 min). Hvis en verdi ikke
kan bekreftes innen tidsbudsjettet: BLOCKED, ikke PASS. Resten kan dokumenteres
med snapshots og fullføres ved senere kontroll.

| ID | Handling | Observer / forventet resultat | FAIL hvis |
|---|---|---|---|
| Q01 | Kaldstart med kjent strøm/oppsett | Én boot, eventuell LED-test fullføres, loop starter | Henger eller gjentatte uventede starter |
| Q02 | Les [BOOT] og oppstartsbanner | Nøyaktig kandidat 1.3.x samsvarer med rapport | Annen firmware kjører |
| Q03 | Vent på kjent nett | Wi-Fi OK/IP og [WIFI] connected | Får ikke kontakt med bekreftet fungerende nett |
| Q04 | Se første configforsøk | [CONFIG] result=SUCCESS og profil samsvarer | Gjentatt ugyldig/avvist config med kjent gyldig oppsett |
| Q05 | Les configlinjen | [CONFIG] source=LIVE | Kilden forblir DEFAULT/CACHED etter vellykket gyldig henting |
| Q06 | Vent på feed | HTTP 200 fulgt av LED-frame OK | 200, men frame avvises eller visningen står feil med kjent gyldig feed |
| Q07 | Ta to frame-linjer | Akseptert sequence er ikke synkende; nyere upstream-frame aksepteres | Eldre/ugyldig frame erstatter akseptert state |
| Q08 | Se statuslinje | STATUS &#124; HTTP 200 | Gjentatte avslag mot bekreftet tilgjengelig endpoint |
| Q09 | Les [WIFI] rssi og Fleet | RSSI er rapportert, ikke null/Ikke rapportert mens tilkoblet | Rapporter mangler RSSI ved stabil kontakt |
| Q10 | Sammenlign før/etter planlagt reset | [BOOT] bootCount øker én; ingen UNKNOWN | Teller faller, uteblir eller UNKNOWN/NVS-feil |
| Q11 | Sammenlign [BOOT]/Fleet | bootId ny etter reset, stabil innen samme boot | Samme ID over reset eller endring uten restart |
| Q12 | Les reset= og Fleet | Reason samsvarer med kjent handling; USB/EN-reset kan være board-avhengig | Uforklart watchdog/brownout eller feil normalisering |
| Q13 | Slå hotspot av ca. 45 s | Wi-Fi-frakobling registreres; eventuell TTL-slukking; samme boot | Restart-loop eller fastlåst prosess |
| Q14 | Slå nett på igjen uten reset | Wi-Fi/frame kommer tilbake; samme boot-ID; recovery synlig i HELSE tilbake | Må manuelt resette for å gjenoppta |
| Q15 | Etter LIVE: planlagt reset med bare config-endepunktet utilgjengelig i kontrollert testoppsett | source=CACHED og feil ved config-fetch; riktig profil/feed; ellers BLOCKED uten oppsett | Cache mangler etter dokumentert vellykket lagring, eller feil layout |
| Q16 | Observer boot-ID/teller gjennom testen | Kun planlagte resetter; forbindelsen gjenopprettes | Uventede gjentatte boot/reset |
| Q17 | Åpne Fleet, velg riktig device | Ny lastSeen/bootId, firmware, profil og health samsvarer | Bekreftet nye rapporter gir feil enhet/metadata |

Utilgjengelig nett/Worker, manglende Fleet-adgang eller utilstrekkelig snapshot
betyr BLOCKED. Faktisk observert avvik med gyldige forutsetninger betyr FAIL.
Q07 kan være BLOCKED dersom ingen nyere upstream-frame finnes under testen.
En tom, gyldig frame er ikke feil bare fordi ingen tog er aktive.

## Serial-vurdering og begrensninger

Kildekontroll: initializePlatform/activateRuntimeConfig i
TransitCore_Platform_v1.h og ensureWifi/reportHealth/acceptCandidateFrame i 1.3.0.
[BOOT] gir firmware, bootId, bootCount og reset. [CONFIG] gir kilde, profil,
poll/health-intervall og fetch-resultat. [WIFI] gir RSSI. LED-frame OK gir sekvens.
HELSE gir uptime, brudd/tilbake, poll-tellere, frame-alder og free/min heap.
STATUS HTTP 200 viser mottatt statusrespons, men beviser ikke dashboard-innhold.
Fleet gir detaljert kanonisk health og serverens lastSeen.

Det finnes ingen read-only Serial SNAPSHOT-kommando. MODE STATUS gjelder lysmodus.
Verdier fra boot kan ikke hentes frem igjen på forespørsel; ta et planlagt
oppstartssnapshot eller bruk Fleet. Serien logger heller ikke komplett health-JSON.
Ingen ny logging er nødvendig for denne testen, og firmware er ikke endret.
Hvis senere tester krever det kan en separat, godkjent read-only SNAPSHOT vise
boot/config/RSSI/heap uten URL-er, credentials, NVS-skriving eller nettverkskall.
Largest-free-block og kontinuerlig reset-/feilhistorikk finnes ikke i dagens
snapshot; disse manglene er dokumentert, ikke automatisk implementert.

Fyll forventet/faktisk/resultat i HARDWARE_VALIDATION_REPORT_TEMPLATE.md og kjør
hardware-test-report.mjs på din manuelle JSON. Utestede S3-/soak-gater forblir
NOT_RUN/BLOCKED etter en vellykket reisestest.
