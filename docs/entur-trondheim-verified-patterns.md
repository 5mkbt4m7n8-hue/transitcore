# Entur-verifiserte rutemønstre for Trondheim – 31. oktober 2026

## Resultat fra kildehenting

Kilderevisjonen i GitHub Actions hentet **alle 47 AtB-busslinjene**
i `trondheim-city-lines-catalog.json` med POST til
`https://api.entur.io/transit-data/v1beta/graphql`, 
`ET-Client-Name: intransit-pattern-audit`.

- **43 linjer godkjent**, inkludert eksisterende pilotlinje 1 og 11.
- **41 nye linjer** lagt i fem versjonerte,
  skrivebeskyttede katalogfiler:
  `config/gps/atb-verified-patterns-01.json` til `-05.json`.
- **53, 54, 91 og 92 er utelatt** fra kildebasert
  rutesekvensdiagnostikk. Under denne innhentingen hadde
  de ikke rutemønstre med begge retninger i samme
  kildegrunnlag. De vises fortsatt som vanlige linjer i
  Trondheim-kartet.
- Linje 1 og 11 beholder nøyaktig sitt eksisterende
  kildeutvalg fra `atb-journey-patterns-1-11.json`.

### Strenge importkrav

Hver godkjente linje er kontrollert mot disse kravene:

1. Entur `line.id` må være eksakt
   `ATB:Line:2_<linjekode>`; hver JourneyPattern-ID
   er unik, og hver Quay-ID har formatet `NSR:Quay:<id>`.
2. `journeyPatterns` hentes fra den **faktiske**
   Transit Data-responsen. `quays(first:200)` må returnere
   `pageInfo.hasNextPage=false`. Delvise eller feilede
   oppslag kasseres; ingen liste kompletteres med gjetting.
3. Minst to mønstre og dokumenterte `inbound` og
   `outbound`-retninger må finnes.
4. Minst to brukbare nabopar mellom nøyaktig kartlagte
   Quays må eksistere. En delt LED med tvetydig
   GPS-plattform er **ikke** bekreftet ved stopp.
5. Det finnes en tilsvarende aktiv ruteprofil i
   katalogtavlen. Kildemønsteret avgjør kun forventet
   Quay-rekkefølge, aldri fysisk LED-belysning.

`scripts/test-verified-entur-patterns.mjs` kontrollerer
hele det kildefrosne materialet i CI, også hvilke
linjer som eksplisitt ikke skal kunne velges.

### Bruk i Linear

Panelet **«Trondheim · kildeverifisert A → B → C-sporing»**
har linjevelger for alle godkjente koder.

- Linje 1 og 11 har fortsatt egne aktive
  nettleserspor, uavhengige logger og eksport.
- Bare **én ytterligere valgt linje** kjøres samtidig,
  slik at mobil/nettleser ikke gjør 43 parallelle
  gjennomganger av hver PixelFrame.
- Bytte av ekstra linje nullstiller kun aktive
  kjøretøykoblinger for den gamle linjen; allerede
  lagrede, anonymiserte diagnosehendelser beholdes.
- Vi gjenbruker eksisterende Trondheim PixelFrame.
  **Ingen nye Entur-kall, Worker-jobber, SIRI-oppslag,
  ekstra fysiske LED-er eller endringer i karttegningen.**
- Kvalitetsrapporten med døgnopptak er fortsatt
  **kun for linje 1**. De andre linjenes A→B→C-logger
  samles bare mens Linear er åpen.

## Bevis og begrensninger

En GPS-posisjon nær en Quay er ikke bevis på
fysisk stopp. To observerte Quays kan støtte en
retning ut fra riktig JourneyPattern, men faktisk
kjørt retning og ServiceJourney-ID krever fortsatt
egne Entur/SIRI-kildeopplysninger.

Transit Data er en beta-tjeneste: et kildefrossent
rutemønster kan bli foreldet ved senere ruterevisjon.
Det er **ikke** automatisk oppdatering av dokumenterte
JourneyPatterns. Nye endringer krever ny
kilderevisjon og CI før bruk, ikke automatisk
skriving til produksjonskatalogen.

Dato for kilderevisjon: **2026-10-31**.
