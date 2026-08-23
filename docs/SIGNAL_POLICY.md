# TransitCore signalpolicy

Felles LED-oppførsel ligger i `web/shared/signal-policy.js` og den felles animasjonen i `web/shared/signal-policy.css`.

## Tilstander og prioritet

1. `AT_STOP` – fast lys, høyeste prioritet.
2. `APPROACHING` – felles rolig pulsering.
3. `PASSED` – svakt etterlys, laveste aktive prioritet.
4. `OFF` – slukket.

Standardinnstillingene er 1,8 sekunders pulssyklus, maksimalt 10 sekunders etterlys, lysstyrke 32 for aktive signaler og 8 for etterlys.

Datakildene kan avgjøre tilstand på ulike måter. Trondheim bruker GPS-avstand, mens rutetabellbaserte kilder kan bruke ankomsttid. Når tilstanden er valgt, skal prioritet, animasjon og lysstyrke være lik på alle tavler.

Kjør `node scripts/test-signal-policy.cjs` etter endringer i policyen.
