# FB73 – ekte GPS som eneste grunnlag for posisjons-LED

## Status 2026-10-23
**Ingen GPS-strøm fra FB73 er bekreftet tilgjengelig for TransitCore ennå.**
Dagens `flybuss-trondheim-fb73-live` bruker `estimated-station-calls` (ETA).
ETA er ikke bevis for faktisk kjøretøyposisjon; ved forsinkelser og tunnelstenging
skal en ETA-LED aldri merkes som GPS/posisjon.

## Bekreftet teknisk spor
1. FourC er leverandør av Værnesekspressens offisielle app, som opplyser at den
   viser busser i sanntid. Google Play: https://play.google.com/store/apps/details?id=eu.fourc.bvtpaa
2. +CityxChange D2.5, *datert 30.06.2020*, side 22, sier eksplisitt at
   FourC drifter Værnesekspressens flåtestyring og tilbyr et **SIRI-VM**
   grensesnitt for posisjoner: https://cityxchange.eu/wp-content/uploads/2020/06/D2.5-Seamless-eMobility-system-including-user-interface.pdf
   **Dette er historisk dokumentasjon, ikke verifisering av dagens API-tilgang.**
3. Entur tilbyr GraphQL Vehicle Positions med `ET-Client-Name`, men `UNI`
   er ikke listet blant datastrømmene på
   https://developer.entur.no/open-data/realtime .
   `NBU` på listen er Connect Bus Flybuss, **ikke automatisk UNI/FB73**.
4. `scripts/probe-fb73-gps.mjs` gjør en **engangs, lesebasert prøve**
   mot Enturs Vehicle Positions, med aggregerte treff for UNI og NBU
   uten å logge ID-er, koordinater eller persondata. Ikke funn i én prøve
   er ikke bevis for at operatøren ikke har GPS.

## Må innhentes fra FourC/Unibuss
- Om det eksisterende SIRI-VM-grensesnittet fortsatt leverer posisjoner fra **FB73**.
- Dokumentert URL og API-protokoll (SIRI-VM/GraphQL/REST) og eventuelle
  adgangsvilkår/autentisering; aldri legg hemmelige nøkler i GitHub Pages.
- Felt for `vehicleId`, tjenestetur, linje/retning, bredde/lengde,
  `recordedAt`/datatid og eventuelt fart/kurs.
- Oppdateringsfrekvens, begrensninger, cache/TTL og tillatelse til privat
  fremvisning i InTransit/TransitCore.
- Om SIRI-VM kan leveres direkte til Entur på `UNI`, eller via en
  avtalt mottaker. Be om testtilgang uten tilgang til billettkjøp eller
  annen unødvendig informasjon.

Kontakter:
- FourC app support: **ve-app@fourc.eu** (offisiell Google Play-side)
- FourC AS: **apps@fourc.eu** (offisiell Google Play-side)
- Værnesekspressen/Unibuss: **vaernes@unibuss.no**,
  https://www.vaernesekspressen.no/support-og-hittegods/

## Akseptansekriterier før GPS-LED
- Kilden gir **faktisk, fersk, tidsstemplet koordinat**, ikke en predikert
  posisjon eller estimert ankomst.
- En unik, stabil bussidentitet per fysisk kjøretøy; retningen er verifisert.
- Avvis eldre/ugyldige posisjoner (f.eks. >30 sekunder uten nytt signal),
  uten å simulere bevegelse til neste holdeplass.
- Koble posisjoner til riktige holdeplasser, og hysterese hindrer hopping
  mellom nærliggende stopp. Ikke tenning på et framtidig stopp basert kun
  på ETA. Flere kjøretøy kan vises samtidig på forskjellige stopp.
- Ved tapt GPS: **ukjent/offline** er noe annet enn **ingen buss**.
  ETA kan vises i et *separat avgangsfelt* når det tydelig merkes.
- Bruk eksisterende TransitCore GPS-motor der egnet. Endre ikke
  produksjons-Worker, ESP32 eller andre ruter uten egen validering.
