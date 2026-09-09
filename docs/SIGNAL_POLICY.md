# TransitCore signalpolicy

Policykontrakten har versjon `1`. Worker legger `signalPolicy` i hvert LED-frame med pulstid, etterlystid, lysstyrker og tilstandsprioritet. Universal Board Client v1.0.8 validerer versjonen og bruker `approachPulseMs` direkte. Eldre klienter ignorerer feltet og fortsetter som før.

For lineære GPS-tavler er `PASSED` en posisjonsstyrt stasjonstilstand. En
mellom-LED bruker bare `APPROACHING`. Etter `AT_STOP` beholder vognen den samme
stasjons-LED-en som `PASSED` så lenge GPS-posisjonen fortsatt er innenfor
stasjonens konfigurerte avgangssone. Utenfor sonen flyttes den ene aktive
vognposisjonen til neste mellom-LED som `APPROACHING`. Manglende GPS-data lager
ikke et nytt eller ekstra `PASSED`-signal.

Felles LED-oppførsel ligger i `web/shared/signal-policy.js` og den felles animasjonen i `web/shared/signal-policy.css`.

## Tilstander og prioritet

1. `PARKED` – fast rødt lys, høyeste prioritet. Utløses først når samme vogn
   har holdt seg innenfor en GPS-sone på 15 meter i minst 5 minutter, og
   oppheves straks vognen beveger seg utenfor sonen.
2. `AT_STOP` – fast linjefarge.
3. `APPROACHING` – felles rolig pulsering.
4. `PASSED` – svakt etterlys, laveste aktive prioritet.
5. `OFF` – slukket.

Standardinnstillingene er 1,8 sekunders pulssyklus, maksimalt 10 sekunders etterlys, lysstyrke 32 for aktive signaler og 8 for etterlys.

For lineære GPS-tavler kan profilen kreve at samme vogn er innenfor
bevegelsestoleransen gjennom én hel 10-sekunders feedperiode før `AT_STOP`.
Frem til dette er bekreftet, fortsetter LED-en å pulsere som `APPROACHING`.
Busstavler med korte stopp bruker ikke denne ekstra ventetiden; første gyldige
GPS-treff innenfor ankomstsonen gir `AT_STOP`. Et live-signal med flere vogner
på samme fysiske LED skal aldri erstattes av interpolering eller etterlys for
bare én av vognene.
Når en vogn først har fått `PASSED` på en stasjon, låses denne avgangsstatusen
mot korte GPS-regresjoner. Samme vogn kan derfor ikke gå tilbake til `AT_STOP`
på den samme stasjonen før den har forlatt avgangssonen og senere returnert.

Datakildene kan avgjøre tilstand på ulike måter. Trondheim bruker GPS-avstand, mens rutetabellbaserte kilder kan bruke ankomsttid. Når tilstanden er valgt, skal prioritet, animasjon og lysstyrke være lik på alle tavler.

Kjør `node scripts/test-signal-policy.cjs` etter endringer i policyen.
