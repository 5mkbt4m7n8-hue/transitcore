# InTransit Board Studio v0.6

Vektoreditor og fysisk LED-layout i millimeter: `web/board-studio/index.html`. Arbeidet er beholdt i draft-PR #324. Ingen merge, produksjonsdeploy eller endringer i Map Studio/PR #323, GPS, Entur eller firmware.

## Stasjonsplassering i v0.6

- **S** viser det faktiske symbolet ved pekeren før klikk. **R / Shift+R** roterer, og **Esc** avslutter. Velg symbol og LED-modus i den lokale plasseringslinjen; S forblir aktivt for flere stopp.
- **Felles stasjon – to LED-striper** og **Dobbelstasjon – to LED-striper** velger først A og deretter B. Begge ringene og de faktiske LED-indeksene vises før siste klikk. Resultatet er én stasjon, ett navn og to separate bindinger.
- Velg **Bare A / Bare B / Hele stasjonen** etter plassering. Samlet eller individuell fysisk flytting krever bekreftelse. Direktebundne sentre står fast ved grafisk redigering; ringstørrelse, yttermarkering og navn kan endres separat.
- På mobil/nettbrett vises symbolet over fingeren og bekreftes med en egen stor knapp ved tegneflaten.

[Full norsk veiledning, testresultater og begrensninger](placement-validation.md) · [Tostripe-prosjekt](examples/two-strip-stations-v06.json) · [Vektor-SVG](examples/two-strip-stations-v06.svg).

## Montering og klaringer i v0.5

1. Åpne **Montering**. Velg **Nytt hull**, navn, X/Y og hulldiameter i mm. **Lagre hull** oppretter hullet, mens **Plasser med mus** lar deg klikke ønsket plassering på tavlen. Rutenett og hjelpelinjer brukes; hold Ctrl for fri plassering. Escape avbryter.
2. Velg et eksisterende hull fra listen eller klikk det på tavlen. Endre mål eller dra hullet. Flytting, diameterendring og sletting viser før/etter i den fysiske bekreftelsesdialogen. **Avbryt** beholder originalen. Angre/Gjør om bevarer ID-en.
3. Under **Fire hjørnehull** angir du hullsenters avstand fra platekanten og diameter. **Forhåndsvis hjørnehull** endrer ikke prosjektet. Grønt betyr at plasseringen består hullkontrollen; rødt viser konflikt. **Legg til fire hjørnehull** oppretter alle fire i én angrehandling. Eksisterende hull erstattes aldri.
4. Under **Mekaniske klaringer** velger du minste avstand fra **hullkant til platekant** og mellom **hullkanter**. **Lagre klaringer** lagrer dem for hele prosjektet, inkludert LED-hull. Standard 0 mm til platekant og 1 mm mellom hull beholder tidligere validering; velg mål for ditt materiale og feste. Dette er ikke en materialberegning.
5. Åpne **Kontrolliste** for å finne objekter som bryter kravene. Klikk et funn for å se hullet og åpne monteringspanelet. Ingen automatisk flytting utføres. Samme krav blokkerer produksjonseksport.
6. Laget **Monteringshull** har egne vis/skjul-, lås- og eksportvalg. Lås hindrer redigering. Borefilene inkluderer alltid alle fysiske hull, også skjulte hull. Lagre JSON for å bevare permanente ID-er og klaringsinnstillinger.

Eksempel med 18 LED-hull og fire monteringshull, 15 mm senterinnrykk og Ø 3,2 mm: [Prosjekt-JSON](examples/trondheim-buss-v05-mounting.json) · [A4-PDF forside](examples/trondheim-buss-v05-mounting-front.pdf) · [Hull-SVG bakside](examples/trondheim-buss-v05-mounting-back.svg) · [Koordinater bakside](examples/trondheim-buss-v05-mounting-back.csv). [Testresultater og begrensninger](mounting-validation.md).

## Boremal og produksjonsfiler i v0.4

1. Kontroller faktisk LED-pitch og første LED-senters avstand fra stripeenden på den målte stripen. Oppdater profilen og bekreft eventuelle fysiske hullflyttinger i editoren. Lagre prosjektets JSON sammen med filene du skal bruke.
2. Velg **Boremal 1:1** øverst. Dialogen viser fysiske feil, antall hull, arkoppsett og forhåndsvisning. Hull utenfor platen, hullkonflikter, direkte senteravvik og andre mekaniske funn må rettes før borefiler kan lastes ned. Ubundne punkter krever et eksplisitt valg hver gang dialogen åpnes.
3. Velg **Forside** eller **Bakside**. Baksiden speiles venstre–høyre rundt tavlens loddrette midtakse. TOPP er fortsatt opp. Originalprosjektet, hullene og LED-bindingene flyttes ikke.
4. Velg **A4 stående**, **A4 liggende** eller **Samlet tavleformat**. Standard er 15 mm marg og 10 mm overlapp. En tavle på 300 × 400 mm gir fire stående A4-ark eller seks liggende A4-ark. Samlet PDF er 330 × 430 mm med merknadsmarg, mens selve tavlen fortsatt er nøyaktig 300 × 400 mm. Små tavler får minst 180 × 80 mm ark for lesbare merknader.
5. Last ned riktig fil fra tabellen under. **Lagre eksportvalg i prosjektet** er et eget valg med Angre/Gjør om. Selve eksporten endrer ingen prosjektdata. Tillatelse til å eksportere ubundne punkter lagres ikke som en varig godkjenning.
6. Skriv ut **100 % / faktisk størrelse**, uten «Tilpass til ark». Mål kontrollstrekene i både X og Y med en fysisk linjal. På A4 og store tavleark er de 100 mm; mindre ark kan ha en kortere Y-kontroll med faktisk lengde angitt. Juster skriveroppsettet eller øk margen hvis skriveren klipper merknader. Ikke bruk en skalert utskrift til boring.
7. Ved flislagt PDF: sett arkene sammen etter R/C-numrene, X/Y-forskyvningen og registreringskryssene i overlappsområdene. Samme kryss har samme koordinattekst på naboarkene. Ikke legg arkene kant mot kant; bruk overlappen.

| Fil                       | Innhold og koordinater                                                                                                                                                                                                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bore-PDF**              | Vektorhull i 1:1, separat tavlekontur, valgfrie senterkryss/hullnummer, sidebetegnelse, X/Y-kontrollmål og arkregistrering. Samlet format eller A4-fliser.                                                                                                                                                          |
| **Bore-SVG for utskrift** | Samlet tavle med merknadsmarg og separate lag for hull, senterkryss, hullnummer, kontur og kontrollmål. For eksempel 330 × 430 mm ark med 300 × 400 mm tavle. Dette er en utskriftsmal; root-origo inkluderer margen.                                                                                               |
| **Hull-SVG (plateorigo)** | Bare fysiske hull, uten marg, tekst, kontrollmål eller platekontur. Root-størrelse er tavlens faktiske mål, med origo i øvre venstre platehjørne sett fra valgt side. Bruk denne til maskinimport. Ingen kerf-/verktøykompensasjon er gjort.                                                                        |
| **Grafikk-SVG**           | Bare grafiske eksportlag: traséer, kapsler, ringer, navn og eventuell kontur. Ingen borehull eller LED-layout. Root-størrelsen er tavlemålet. Baksidevalg speiler også teksten som del av hele grafikken. Kontroller fontgjengivelse i mottakerverktøyet.                                                           |
| **Koordinater CSV**       | UTF-8 med BOM, semikolon og punktum som desimalskilletegn. Hullnummer, faktisk hull-ID, stasjons-ID/navn/punkt, valgt sides X/Y, diameter, forsidekoordinater og kvalifiserte LED-identiteter. Tekst som kan tolkes som regnearkformler beskyttes med en innledende apostrof; prosjekt-JSON beholder originaltekst. |

Alle fysiske hull tas med uavhengig av skjulte/låste lag eller editorens eksportvalg. Grafikk-SVG følger derimot de grafiske eksportvalgene. Grafiske ringdiametere endrer aldri borediameteren. Eksplisitt delte, sammenfallende hull med samme diameter tegnes én gang, mens CSV beholder én rad per logisk referanse til samme hullnummer. Lyslederbindinger beholder sine eksplisitte hullkoordinater. Monteringshull som ligger i `production.mountingHoles` tas også med og kontrolleres; disse redigeres i **Montering** fra v0.5.

Eksemplene under er generert fra det tenkte Trondheim-prosjektet med nominell 10 mm pitch. De dokumenterer filformatet og er ikke en verifisering av en målt stripe, materialtoleranser eller en faktisk bussrute.

| Eksempel          | Forside                                               | Bakside                                              |
| ----------------- | ----------------------------------------------------- | ---------------------------------------------------- |
| A4-boremal        | [PDF](examples/trondheim-buss-v04-drill-a4-front.pdf) | [PDF](examples/trondheim-buss-v04-drill-a4-back.pdf) |
| Utskrifts-SVG     | [SVG](examples/trondheim-buss-v04-drill-front.svg)    | [SVG](examples/trondheim-buss-v04-drill-back.svg)    |
| Hull i plateorigo | [SVG](examples/trondheim-buss-v04-holes-front.svg)    | [SVG](examples/trondheim-buss-v04-holes-back.svg)    |
| Grafikk           | [SVG](examples/trondheim-buss-v04-graphics-front.svg) | [SVG](examples/trondheim-buss-v04-graphics-back.svg) |
| Koordinater       | [CSV](examples/trondheim-buss-v04-holes-front.csv)    | [CSV](examples/trondheim-buss-v04-holes-back.csv)    |

[Samlet PDF, forside](examples/trondheim-buss-v04-drill-full-front.pdf) · [Produksjonsdialog](v04-production.png) · [Gjengitt PDF-side](v04-drill-page.png) · [Validering](production-validation.md).

## Nye arbeidsflyter i v0.3.3

### Se forbindelsen før siste klikk

Velg L, klikk startporten og hold pekeren over en sluttport. Den stiplede kurven viser den faktiske forbindelsen før du klikker. Grønt betyr gyldig geometri; rødt betyr at portvalget ikke kan opprettes slik det står. Du kan prøve andre sluttporter uten å endre prosjektet. Escape avbryter. Forhåndsvisningen bruker samme geometri som opprettelsen og følger ikke med i lagring/eksport.

### Bygg flere stopp langs en LED-stripe

1. Åpne **LED-layout → Plasser stopp langs stripen**.
2. Velg et innebygd/egendefinert symbol, eller **Valgt standardstasjon**, og riktig segment.
3. Velg startens faktiske LED-indeks og stoppintervall 1/2/3/4. **Egne indekser** lar deg skrive varierende intervaller, for eksempel `0, 4, 9`. Indeksene følger segmentets kontroller/kjede og indeksretning.
4. Gi eventuelt et navneprefiks og velg **Start plassering**. Neste gruppe markeres på tavlen, med et gjennomsiktig symbol og indeksene i panelet.
5. Velg **Plasser neste stopp**, trykk Enter med tavlen i fokus, eller klikk den første markerte fysiske LED-en. Fortsett til ønsket antall stopp er plassert.
6. **Avslutt**, Escape eller et annet verktøy avslutter modusen. Navnene kan endres i stasjonspanelet. Angre/Gjør om gjelder ett stopp om gangen, og markøren følger hva som igjen er ledig.

Flerpunktsymboler bruker påfølgende fysiske LED-er. Avstand og symbolretning tilpasses derfor den faktiske stripen; ringdiameter, hulldiameter, kapselstil og navnestil følger malen. Intervallet angir mulige startposisjoner. Opptatte LED-er og grupper som ikke får plass, hoppes over. Nye stopp får egne stasjons-/hull-/bindings-ID-er og ingen Entur-/Quay-identiteter. Eksisterende stopp og hull flyttes ikke. Hullene i det nye stoppet ligger på de fysiske LED-sentrene ved direkte belysning.

### Finn og undersøk feil

Velg **Kontroll** øverst eller gå til **Kontroll av tavlen** i høyrepanelet. Filtrer mellom fysisk layout, linjegeometri og ubundne punkter. Klikk et funn for å velge riktig stasjon, punkt, forbindelse eller stripesegment og sentrere visningen. Markeringen vises også når objektets vanlige lag er skjult. Kontrollnavigasjon endrer ikke prosjektdata eller lagvalg og korrigerer ingenting automatisk.

Ubundne punkter er informasjonsfunn under grafisk arbeid. Ugyldige linjer og fysiske konflikter må undersøkes før produksjon. Listen er en grunnkontroll, ikke en godkjenning av maskin-/materialtoleranser.

[Arbeidsflyttester](workflows-validation.md) · [Linjeforhåndsvisning](v033-preview.png) · [Hurtigplassering](v033-rapid.png) · [Kontrollnavigasjon](v033-checks.png).

## Presis plassering av LED-striper

- **Fest LED-striper** gjelder både **Plasser med mus** og flytting av en eksisterende stripe. Stripens faktiske LED-sentre fester seg til stasjonens hullsentre; to passende punkter i en dobbeltstasjon prioriteres. Første LED-offset og faktisk pitch brukes, også ved 90° og skrå orientering. En stripe roteres ikke automatisk.
- Har du rotert bare symbolet, kan ringene og hullene være forskjellige. For en ubundet stasjon kan stripen feste til de synlige ringene og foreslå tilsvarende hulltilpasning. Du ser hullene før/etter og må bekrefte før endringen lagres. Avbryt beholder både stasjon og stripe uendret. Bundne stasjoner får ikke slik automatisk hulltilpasning.
- Parallelle striper fester **kant mot kant**, med nærmeste LED-posisjon justert langs stripen når den er innenfor treffavstanden. De kan også festes **ende mot ende**. Stripebredde og faktisk segmentlengde brukes; kjeder og bindinger slås ikke sammen. Treffet markeres med mål og navn. En stripe festes ikke automatisk oppå en annen stripes LED-sentre.
- Hold **Ctrl under flytting** for å slippe rutenett-, hjelpelinje-, LED- og stripesnapping midlertidig. Slipp Ctrl for å aktivere valgene igjen. For striper kan Ctrl holdes inne fra draget begynner. Eksisterende fysiske bindinger og låste parallellavstander oppheves ikke av Ctrl.
- Bakgrunnen har nå hovedrutenett, vanlig rutenett og et ekstra svakt finrutenett. **½ rutenett** halverer den valgte millimeteravstanden og rutenettsnappingen, for eksempel 5 → 2,5 → 1,25 mm. Visningen tilpasses zoom for å unngå tett flimmer; millimeteravstanden for feste beholdes.

Snapping justerer plasseringen ved dette draget, og lager ingen permanent mekanisk kobling mellom stripene. Flytting av allerede bundne LED-/hullsentre bruker fortsatt fysisk bekreftelse. [Tester og avgrensning](strip-snapping-validation.md).

## Ny linjearbeidsflyt i v0.3.2

1. Velg **Koble stasjoner (L)**. Midlertidige porter vises på stasjonene. Et rundt punkt velger én LED-ring; en firkant velger ringparet samlet. Enkeltstopp har fire porter; flerpunktsymboler har fire per ring og to samlede sideporter.
2. Velg **Enkeltspor/Dobbeltspor**, sporavstand og **Avrundet/Rett** i panelet. Valget brukes også på neste forbindelse.
3. Hold pekeren over en port for navn og fremheving. Klikk startporten og deretter sluttporten på en annen stasjon. Den valgte starten blir grønn, slutten gyllen. Bruk Tab og Enter/Space for tastaturvalg. Escape eller **Avbryt portvalg** avbryter.
4. For to parallelle spor: velg **Dobbeltspor** og de firkantede samlede portene. Begge spor beregnes fra samme senterkurve. For en gren fra én ring brukes ringens runde port. En samlet port til en ringport gir en overgang mellom et ringpar og ett punkt.
5. Velg samme port som hovedlinjen bruker når en sidegren skal dele utgangen. Portene følger symbolvinkelen. Navnet ved pekeren beskriver markørens synlige retning på tavlen, også ved skrå orientering. Den samme logiske porten følger stasjonen ved senere rotasjon.
6. Velg en forbindelse med V for å se start/slutt, endre sporantall/avstand/kurvestil, **Slett valgt strekning** eller **Skill ut delstrekning**. **Velg nye koblingspunkter** lar deg velge nye porter på de samme to stasjonene, start først; den lokale manuelle kurveformen nullstilles når portene endres. Andre forbindelser og hull beholdes.
7. **Avanserte linjeinnstillinger** åpner kontrollhåndtak, knekkpunkt, linjebredde, kurveparametere, fri form og parallellbinding. Håndtakene skjules når seksjonen lukkes. En rett forbindelse krever porter som vender langs forbindelsen. Et portvalg som ville gi kryssing eller ugyldig radius avvises med melding; editoren bytter ikke side automatisk.

Portmarkørene er bare editorhjelp og følger ikke SVG-eksporten. Eksisterende prosjekter beholder sin tidligere geometri; gamle forbindelser kan få eksplisitte porter via **Velg nye koblingspunkter**. JSON lagrer de logiske portnavnene og kurvestilen. Fysiske LED-bindinger, ringer og hull flyttes ikke ved linjetegning.

[Før/etter-eksempel](v032-before-after.svg) · [Åpnbart eksempelprosjekt](examples/port-sidebranch-v032.json) · [v0.3.2-testresultater](v032-validation.md). Last ned JSON-eksempelet og velg **Åpne prosjekt** i editoren.

## Nytt i v0.3.1

- Velg forbindelsen mellom to stasjoner med V-verktøyet. Den valgte forbindelsen markeres grønt. Ved overlapp velger du riktig **Grafisk rute for valgt forbindelse** i panelet. Velg **Slett valgt strekning** eller trykk Delete utenfor tekstfeltene. A–B–C–D blir A–B og C–D ved sletting av B–C. Stasjoner og fysiske LED-bindinger beholdes. Ctrl+Z/Y angrer/gjør om hele slettingen.
- Endrer du sporantall, sporavstand, linjebredde eller kurveinnstillinger i trasépanelet, brukes samme stil på de neste forbindelsene du tegner. Endre tilbake til enkeltspor for neste unntak. Eksisterende andre forbindelser beholder sin stil. Valget følger prosjektets JSON og Angre/Gjør om.
- **Fest rutenett**, **Fest hjelpelinjer** og **Fest til LED** er separate valg. LED-treff prioriteres innen 12 skjermpiksler ved alle zoomnivåer. Treffringen viser segment og LED-indeks. Ingen panorering eller zoom skjer ved treff.
- Åpner du **LED-layout**, aktiveres **Fest til LED** og **Fest og bind til LED**. Velg punkt A/B i stasjonspanelet før du drar en eksisterende stasjon. For nye symboler velges punktet i verktøylinjen. Ved første binding flyttes et ubundet symbol samlet; når et punkt allerede er bundet, justeres det valgte punktet selvstendig, og kapselen følger ringene. Bindingen bruker den fysiske LED-ens fulle millimeterkoordinater for både hull og ring.
- Fjern **Fest og bind til LED** for bare sentrering uten ny binding. Et direkte bundet punkt må bindes om eller løses fra sin LED før det kan sentreres på en annen LED. Lyslederbinding og eksplisitte frontforskyvninger finnes fortsatt i bindingspanelet.
- Eksisterende hull flyttes først når du bekrefter det fysiske endringsforslaget. Avbryt beholder prosjektet uendret. En LED som allerede brukes, avvises med konkret melding. Bevisst deling velges eksplisitt i bindingspanelet.

[Dokumenterte tester for v0.3.1](v031-validation.md). Formatet er fortsatt versjon 3 med valgfrie tilleggsfelt; eldre v1/v2/v3-prosjekter åpnes med eksisterende migreringer. Sletting lagres som separate trasékomponenter, slik at både JSON og SVG beholder gapet.

## Kort norsk brukerveiledning

### Symboler og grafikk

1. Åpne **Symbolbibliotek**. Velg Trondheim buss, Gråkallbanen eller Oslo T-bane. Hver kategori har enkeltstopp, dobbeltstopp uten kapsel, felles kapsel, trepunkts overgangsstasjon, felles LED-stopp og egendefinert utgangspunkt.
2. Klikk symbolkortet og plasser på tavlen. Escape avbryter. **Som standard** lar S-verktøyet plassere flere like. Ctrl+C/V, høyreklikk og Dupliser-knappen er beholdt.
3. Juster ring, kapsel, vinkel, etikett og eventuell egen overgangslengde. Marker flere med Ctrl-klikk/områdemarkering for å endre ringdiameter, linjetykkelse, farge eller kapselstil samlet. Hullsentre og fysisk pitch endres ikke. Navnetekst og punktantall gjelder første stasjon.
4. Gi egen mal et navn og kategori og velg **Lagre valgt som symbolmal**. Egne kort har **Oppdater fra valgt**. Oppdatering endrer bare malen; allerede plasserte stasjoner og tidligere valgt standardmal er snapshots. Velg Som standard på nytt hvis den oppdaterte malen skal brukes videre.
5. **Eksporter egne / Importer** flytter strukturerte symbolfiler mellom prosjekter. Nye mal-/stasjons-/hull-ID-er opprettes; Entur-/Quay-identiteter, rutetilknytninger og fysiske LED-bindinger følger aldri med. Relative ring-/hullposisjoner og individuelle hulldiametere bevares.

### Stripeprofil og rette segmenter

1. Åpne **LED-layout**, velg **Ny WS2812B-profil**. Utgangspunktet er WS2812B-2020 RGB, 5 V, 5 mm bredde, 100 LED/m nominelt, 500 LED og 5000 mm full striplengde. Nominell pitch er 10 mm; **Faktisk LED-pitch** er redigerbar og brukes i alle beregninger. Første senter er foreløpig 5 mm fra stripeenden og kan endres etter måling.
2. Velg **Nytt segment**. Angi start X/Y, vinkel, LED-antall, segmentlengde, startindeks, kontroller og kjede. Lagre eller velg Plasser med mus. På et eksisterende segment flytter musevalget startpunktet; det oppretter ikke en ekstra, overlappende indekskjede.
3. Et nytt segment får egen kjede som utgangspunkt. Segmenter kan bare dele kontroller/kjede hvis indeksintervallene er forskjellige. Samme indeks er tillatt i forskjellige kjeder. Kjede-/kontrollerfeltene er identitetsnavn for layouten, ikke faktisk hardwarekonfigurasjon.
4. Vinkler måles fra +X med positiv retning med klokken i tavlens frontkoordinater. +Y peker ned. Bakside/forside er monteringsmetadata og speiler ikke koordinatene i skjul. Striperetning velger indeksrekkefølge langs samme fysiske LED-posisjoner.
5. Den fysiske stripen er alltid rett. En grafisk kurve bøyer aldri en stripe. Bruk flere rette segmenter ved svinger. Kutt angis etter lokal LED-posisjon (første = 0), og skjøtepunkter som avstand fra segmentstart i mm med notat. Elektrisk utførelse kommer senere.
6. LED-sentre, indekser, segmentnavn og retning vises på egne lag. Koordinattabellen viser fire desimaler og har den fulle verdien som tooltip. JSON lagrer full tallpresisjon. Flytt et ubundet segment ved å dra stripen eller endre numeriske felt.

### Bind et stasjonspunkt til fysisk LED

1. Velg stasjonen og **Punkt A/B/…** i Fysisk LED-binding. Velg Direkte eller Lysleder/fiberoptikk.
2. Velg segment/LED i listen, eller bruk **Velg LED på tavlen** og klikk LED-en. En bundet LED kan klikkes for å velge stasjonspunktet igjen; stasjonsnavnet velger også stasjonen.
3. Ved **direkte belysning** brukes samme koordinat for fysisk LED, hull og grafisk ring. Før første hullflytting vises et fysisk endringsforslag. Bekreft eller avbryt. Punktets LED-referanse identifiserer segment og permanent lokal LED-ID; indeksen vises i sin kontroller-/kjedekontekst.
4. Ved **lysleder** beholdes frontpunktet når LED-en flyttes. Under Frontpunkt og lyslederforskyvning kan hull-/ringsentre og hulldiameter angis separat. LED→hull-forskyvningen vises i mm og som kobling på bindinglaget. Fysiske hullflyttinger krever bekreftelse.
5. Velg Hver LED / Annenhver / Hver tredje / Hver fjerde og **Neste LED** for å flytte pekeren i LED-listen. Egendefinert indeks velges direkte. Hvert stasjonspunkt har en selvstendig binding; ulike stopp kan derfor ha ulike intervaller. Neste LED endrer ikke en eksisterende binding før Koble valgt LED brukes.
6. Bytt LED med et nytt eksplisitt valg, eller bruk **Løsne binding**. Løsning beholder hull og grafikk. En brukt LED avvises som standard. **Bevisst deling** oppretter en eksplisitt felles delingsgruppe for alle berørte bindinger. Sammenfallende, like hull i en slik gruppe behandles som én fysisk åpning i overlappkontrollen.
7. Direktebundne punkter kan ikke flyttes fritt bort fra LED-en. Flytt segmentet, bytt binding eller løsne den. Endring av punktantall/vinkel/punktavstand er sperret mens stasjonen har bindinger; ring-/kapselstil og navn er fortsatt redigerbare uten å flytte hull.

### Bekreftelse og historikk

- Flytting/rotasjon av et bundet segment og endring av profilens pitch/første offset beregnes fra segmentankeret. Permanent lokal LED-ID beholdes. Redusert antall eller sletting som ville fjerne en bundet LED avvises til bindingen er løsnet.
- Editorens forhåndsvisning viser foreslått layout og en tabell med LED-/hullsentre før og etter. Data lagres først ved **Bekreft fysisk endring**. **Avbryt** eller Escape beholder hele prosjektet. Profilendringer viser også flyttede, ubundne LED-er på eksisterende segmenter.
- Bekreftet endring er én Angre/Gjør om-handling. Ctrl+Z/Y og prosjektlagring beholder ring-/hullseparasjon, segmentanker, profiler og LED-identiteter. Rutenett-/kurve-/parallellverktøyene fra v0.2 er beholdt.

## Trondheim-prototypen

Velg **Trondheim buss** øverst. Dette er en **fysisk demonstrasjon, ikke en verifisert ruteplan**. Ingen nettverks-, Entur- eller Quay-identiteter er funnet på. Tre vannrette striper og fire grafiske korridorer viser fysisk montering; navnene er bare eksempler.

- 300 × 400 mm, nominell/faktisk pitch 10 mm, 5 mm stripebredde.
- Tre rette segmenter med 24 LED-er hver, fra X=30 mm ved Y=80/190/300 mm. Første LED-senter er X=35 mm.
- 12 holdeplasser, 18 direktebundne punkter, enkelt-/dobbeltstopp og felles kapsler.
- Fire stoppgrupper per segment: lokale LED-er `[1,2]`, `[6]`, `[10,11]`, `[18]`. Intervallene varierer. Hver stripe har sin egen uttrykkelige kjede; alle tre starter på indeks 0.
- Grunnkontrollen gir ingen funn for eksempelet. Dette bekrefter ikke materialtoleranser eller fysisk produksjonsmetode.

[Prosjektfil](examples/trondheim-buss-v03.json) · [Vektorgrafikk](examples/trondheim-buss-v03.svg) · [Skjermbilde](v03-trondheim.png) · [Bibliotek](v03-trondheim-library.png) · [Binding](v03-trondheim-binding.png) · [Fysisk endringsforslag](v03-trondheim-confirmation.png).

Regenerer med `node scripts/generate-v03-board-studio.mjs`. SVG-filen er grafikk, ikke en produksjonsvalidert boremal.

## Prosjektformat v3

`format: intransit-board`, `version: 3`. V1/v2 åpnes med eksplisitt migrering: eksisterende nettverksdata, stasjons-ID-er, millimeterkoordinater, hull, ruter, spor-ID-er, kontrollpunkter, lagvalg og eldre maler beholdes. Nye felt får standardverdier; en faktisk lagret v0.2-fil inngår i migreringstesten. Ukjente versjoner avvises.

- `library.templates[]` inneholder egen mal-ID, navn, kategori og versjonert utseende/etikettstil/relative ring- og hullposisjoner. Innebygde maler beregnes fra samme vektorparametere; plasserte stasjoner har egne snapshots.
- `ledLayout.profiles[]`: nominelle/faktiske mål, type, spenning, bredde, pitch, første offset, antall, full lengde, LED-husmål og kutt-/skjøtemetadata.
- `ledLayout.segments[]`: egen ID/nummer, profil, rett anker og vinkel, antall, faktisk segmentlengde, controllerId/chainId/startIndex/direction og monteringsside.
- Et fysisk LED-senter beregnes som `anker + (førsteOffset + lokalPosisjon × faktiskPitch) × enhetsretning`. LED-ID er `segmentId:led:lokalPosisjon`; indeksrekkefølge er uavhengig av dette. En kontroller-/kjede-/indeks kan ikke forekomme to ganger.
- `ledLayout.bindings[]`: binding-ID, stasjon/pointIndex, segment/LED-ID, monteringsmåte og eksplisitt shared/sharedGroup. Nummerert LED-indeks avledes fra segmentet og blir ikke en motstridende koordinatcache.
- `station.holes[]` har egne ID-er, X/Y og eventuell individuell diameter; ellers brukes stasjonens hulldiameter. `ringCenters[]` er egne grafiske koordinater ved fysisk binding/lysleder. Ringdiameter/-strek er fortsatt grafisk stil. Direkte bindinger sammenfører koordinatene først gjennom godkjent endring.

Lokal lagring bruker samme nøkkel som tidligere slik at eksisterende prosjekter finnes. Last ned JSON som sikker kopi. Lagre ikke v3 tilbake gjennom en eldre editor som ikke kjenner disse feltene.

## Lag og mekanisk kontroll

Traséer, ringer, kapsler, navn, striper, LED-sentre, bindinger, hull, kontur og hjelpelinjer har uavhengig visning/låsing/eksportvalg. Skjuling sletter ingen data. Låste berørte lag hindrer fysiske endringer. Ringdiameter endrer ikke hullstørrelse, pitch eller bindinger.

Grunnkontrollen finner LED-/stripedeler/hull utenfor platen, overlappende eller for nære hull (1 mm generell kantavstand), manglende LED-referanser, direkte senteravvik og inkompatible ring-/hull-/stripemål. Ugyldige eller dupliserte indeksidentiteter avvises med konkret feilmelding. Manglende bindinger i en skadet import vises som konkrete funn og korrigeres ikke automatisk. Hvert funn identifiserer objektet. Direkte binding, hullforskyvning og full profil-/segmentgeometri beregnes fra samme millimeterdata som skjermen/SVG.

## Tester og begrensninger

[Dokumentert v0.3-testmatrise](v03-validation.md). Trinn A ble testet og lagret før B (`4bea91b`); B ble testet før C (`39f0057`). Alle tidligere modell-/Chromium-suiter samt de nye v0.3-suitene inngår i sluttkontrollen og CI-oppsettet.

- Bare rette fysiske segmenter. Ingen strømforsyningsstyring, fysisk kontrollerkonfigurasjon, sanntidssporing eller automatisk elektrisk skjøting.
- Kontrollene er generell geometrisk grunnkontroll, ikke validering av diffusor, lyslederens optikk, lasertoleranser eller materiale. PDF-/SVG-boremal og grafikk-SVG finnes i v0.4; strømstyring, maskin-/materialtoleranser og fysisk produksjon er fortsatt ikke validert.
- Én til åtte ringer per symbol. Overgangssymboler kan ha flere fysiske punkter; v0.2-rutemotoren bruker fortsatt de to ytterste grafiske portene. Avansert per-rutevalg av alle mellomporter/nettverksimport er ikke del av v0.3.
- Opptil 10 000 fysiske LED-er per prosjekt. Store, svært tettpakkede tavler er ikke ytelsesvalidert. Tabelldesimaler er visning; JSON beholder tallpresisjonen.
- Bibliotek og LED-panel bruker den samme arbeidsflaten som tidligere; zoom inn for små fysiske LED-punkter. Baksideflagget speiler ikke automatisk frontkoordinatene.

[Historisk v0.2-guide](v02-guide.md) beskriver de videreførte tegne-/kurve-/parallellverktøyene. Dens tidligere avgrensning mot fase C gjelder ikke lenger denne v0.3-versjonen.
