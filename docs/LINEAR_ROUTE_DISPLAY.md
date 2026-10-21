# Linear – kompakt visning av flere bybusser

Når `Vis alle bylinjer på disse holdeplassene` er krysset av,
viser den vanlige Linear-siden feltet `Visning per holdeplass`.
Det har tre valg:

- **Detaljer** (standard): dagens fargede etiketter med linje, status og destinasjon.
- **Kun farger**: én liten farget sirkel per buss, uten synlig tekst.
- **Linjenummer i diode**: én større farget sirkel per buss, med rutenummer i sirkelen.

Hold musepekeren over en sirkel (eller bruk tilgjengelighetsnavnet)
for å se linje, status og destinasjon. Ved kollisjoner får hver buss
sin egen lille rutemarkør, også to busser på samme linje. En rutemarkør
i siden er **ikke en ny fysisk LED**; de eksisterende LED-indikatorene,
retninger, fargeveksling og GPS-motor er uendret.

Visningsvelgeren skjules når bare én linje vises eller når Flybussen
velges. Bytte mellom de tre valgene bruker siste gyldige PixelFrame,
utløser ingen ekstra serverforespørsler, og fungerer både med
produksjonsvisningen og den isolerte staging-feeden.

Bare `web/linear/index.html`, den eksisterende
mobilintegrasjonstesten og dette dokumentet endres. Ingen Worker,
ESP32, Cloudflare-bindinger eller deploy-workflow endres.
