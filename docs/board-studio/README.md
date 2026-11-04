# InTransit Board Studio v0.3

Vektoreditor og fysisk LED-layout i millimeter: `web/board-studio/index.html`. Arbeidet er beholdt i draft-PR #324. Ingen merge, produksjonsdeploy eller endringer i Map Studio/PR #323, GPS, Entur eller firmware.

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
- Kontrollene er generell geometrisk grunnkontroll, ikke validering av diffusor, lyslederens optikk, lasertoleranser eller materiale. PDF-boremal/produksjonseksport kommer senere.
- Én til åtte ringer per symbol. Overgangssymboler kan ha flere fysiske punkter; v0.2-rutemotoren bruker fortsatt de to ytterste grafiske portene. Avansert per-rutevalg av alle mellomporter/nettverksimport er ikke del av v0.3.
- Opptil 10 000 fysiske LED-er per prosjekt. Store, svært tettpakkede tavler er ikke ytelsesvalidert. Tabelldesimaler er visning; JSON beholder tallpresisjonen.
- Bibliotek og LED-panel bruker den samme arbeidsflaten som tidligere; zoom inn for små fysiske LED-punkter. Baksideflagget speiler ikke automatisk frontkoordinatene.

[Historisk v0.2-guide](v02-guide.md) beskriver de videreførte tegne-/kurve-/parallellverktøyene. Dens tidligere avgrensning mot fase C gjelder ikke lenger denne v0.3-versjonen.
