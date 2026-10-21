# Linear – kompakt visning av flere bybusser

Når `Vis alle bylinjer på disse holdeplassene` er krysset av,
viser den eksisterende Linear-siden `Visning per holdeplass`:

- **Detaljer** (standard): eksisterende etiketter med linje, status og destinasjon.
- **Kun farger**: kun de eksisterende LED-diodene i holdeplasskartet. Ingen
  egne prikker, etiketter eller nye LED-er. En diode med flere busslinjer
  fortsetter å veksle mellom linjefargene som tidligere.
- **Linjenummer i diode**: nøyaktig samme eksisterende diode og fargeveksling,
  men nå med rutenummer inne i selve dioden. **Nummeret og fargen skifter
  samtidig** når det er flere linjer på samme LED.

En fysisk LED-posisjon kan representere flere busslinjer; dette øker
ikke antall dioder. Dersom en holdeplass allerede har to retninger eller
flere fysiske dioder i konfigurasjonen, beholdes disse – visningsvalgene
lager ingen ekstra dioder. Bare rutene som inngår i eksisterende
`prioritizedOccupants`-syklus vises; statusprioriteten endres ikke.

Valget er bare synlig når alle bylinjer vises; Flybussen og vanlig
énlinjevisning påvirkes ikke. Bytte av visning bruker samme siste
PixelFrame uten ny serverforespørsel, og virker både for produksjons-
og staging-datakilden. Ingen Worker, ESP32, oppdateringsintervall,
GPS-policy eller Cloudflare-konfigurasjon endres.
