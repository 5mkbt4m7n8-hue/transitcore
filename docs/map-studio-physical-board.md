# InTransit Map Studio – målsatt fysisk tavlepreview (v0.5-utkast)

**Status:** Implementert i [utkast-PR #323](https://github.com/5mkbt4m7n8-hue/transitcore/pull/323). Ingen merge, Worker-/GPS-endringer eller fysisk tavle koblet til.

## Prinsipp: centimetermål, ikke en fast pixelmatrise

En InTransit-tavle kan tegnes med **valgfri fysisk bredde og høyde**. Grunnmodellen er den samme 913 × 1280 skjematiske Trondheim-tegningen, som forblir autoritativ i JSON. SVG/forhåndsvisning beregnes fra den enkelte tavlens ytre mål. Tavlen må ikke være en 64 × 64 RGB-matrise. 64 × 64 er senere en mulig *spesifikk maskinvareprofil*, ikke designbegrensning.

**Første forhåndsinnstillinger:** 30 × 40 cm, 50 × 70 cm, 40 × 40 cm. **Egne mål:** bredde/høyde hver for seg, fra 10 til 200 cm. Tavlens bredde og høyde er uavhengige, så 35 × 52 cm, 70 × 40 cm og andre formater kan velges uten ny kartmodell.

**Ekstra valg:** fysisk LED-diameter (2–20 mm, standard 5 mm), yttermarg (3–50 mm, standard 12 mm), navnestørrelse (1,5–8 mm, standard 2,4 mm) og vis/skjul navn. Dette er kun **tavleparametere**, ikke koordinatendringer i det opprinnelige kartet.

## Hva beregningen gjør

- Fysisk bredde og høyde konverteres til mm, f.eks. 30 × 40 cm → 300 × 400 mm.
- Kartet plasseres med **én uniform skaleringsfaktor** og midtstilles etter en faktisk yttermarg. Skaleringsberegningen reserverer i tillegg LED-radius, slik at sirkler nær ytterkanten ikke spiser av den valgte margbredden. Det er ingen uavhengig horisontal/vertikal strekking av geografien.
- På et kvadratisk format, f.eks. 40 × 40 cm, vises derfor blanke sider fremfor å deformere stasjonsavstander eller rutegeometri.
- Parallelle fargestriper og tegnede dobbeltspor følger den eksisterende \`visualTracks\`-visningen. Visningsfarger er grafikk, ikke dokumenterte rutebevis.
- LED-rundinger har en **fast valgt diameter i millimeter**, uavhengig av om tavlen er 30 × 40 eller 50 × 70 cm. De blir ikke automatisk fysisk større ved oppskalering av selve tavleformatet.
- En eksplisitt dobbeltstasjon viser de **virkelige Quay-medlemmene** i én dekorativ ring/kapsel. Rundinger på et lite format flyttes litt fra hverandre *i eksporten* hvis avstanden ellers blir mindre enn LED-diameter + 1,5 mm. Originale koordinater og Quay-bindinger endres ikke.
- En stoppmarkør med flere Quay-bindinger som **ikke** er eksplicit gruppert, forblir **skjematisk**, ikke én «verifisert fysisk LED». Renderer viser et eget varsel \`MULTI_QUAY_STOP\` for dette.
- LED-kollisjon detekteres når avstanden mellom to ulike markører blir mindre enn LED-diameter + 0,7 mm. Konflikter tegnes med **oransje kontur** i den fysiske SVG-eksporten og telles i preview-panelet. Denne grensen er en **foreløpig visuell inspeksjon**, ikke et garantert produksjonskrav for hullboring, lodding, diffusorer eller ledningsføring.
- Navn utenfor formatet og navn nær høyre kant rapporteres som visuelle kontrollpunkter. Full automatisk typografi-/etikettkollisjon er ikke implementert.

## Eksport og verifikasjon

**«Eksporter SVG i fysisk størrelse»** skriver f.eks. \`intransit-board-30x40cm.svg\` med \`width="300mm" height="400mm" viewBox="0 0 300 400"\`. Den eksporterte tegningen kan åpnes i et vektorverktøy, endres og brukes som utgangspunkt for en fysisk mal. Kontroller alltid at utskrift ikke skaleres via **«Tilpass side»**; et 50 × 70 cm format krever tilsvarende utskriftsflate eller oppdeling på ark.

Etter import/eksport av SVG er **ikke** SVG autoritativ kart-JSON. Gruppering, stopp-ID-er og sanntidsbindinger lagres bare i den eksisterende \`stops[]\` / \`displayStations[]\`-datamodellen. SVG er en avledet visuell/printbar fil.

Hvis Map Studios **SIMULERT**-testmodus er aktiv, vises de valgte simulerte Quay-rundingene også i den fysiske forhåndsvisningen, og eksportert SVG merkes SIMULERT. Uten simulering vises alle LED-rundinger i neutral/av visning. Dette er **ikke** en arbeidskopi av siste live-feed, og ingen fysisk LED-adressering påstås verifisert.

## Neste konkrete forbedringer

1. En interaktiv **tavleramme-editor** som kan la brukeren flytte/skille stasjoner for å optimalisere ulike fysiske formater, uten å endre originalkartets reelle stopp.
2. Reell kollisjonskontroll mellom navnetekst og LED-rundinger basert på fysisk tekstmåling og valgte skrifttyper.
3. En egen **hardware-mapping** for konkrete LED-striper/individuelle LED-er, fysisk Ø, kabel-/hullspesifikasjon og monteringskontroll.
4. Maler for ramme, LED-montering og skrue-/marginplassering, først etter at fysisk byggeform er valgt.

**Viktig:** Dette er fremdeles et visningsverktøy. LED-diameter, merkingsfarger og «passer i formatet»-indikator er ikke i seg selv verifisert monteringsgrunnlag eller komplette produksjonsfiler.


## v0.6 – flytt stasjoner direkte på den fysiske tavlen

**Implementert i utkast-PR #323, ikke produksjon.**

Bruk **Rediger kart**, åpne panelet **Fysisk tavleforhåndsvisning (cm)**, og aktiver **Flytt stasjoner og navn**. Flytt markører med mus eller finger; du kan også fokusere en markør eller etikett med tastatur og bruke **piltastene** (1 mm, Shift + piltast 5 mm).

- Dra én enkelt skjematisk stoppmarkør for å flytte dens tavlesymbol.
- Dra en indre Quay-runding eller den dekorative ytre ringen i en *dobbelstasjon* for å flytte **begge Quay-rundingene som én stasjon**. Deres individuelle Quay-ID-er og LED-tilstander blir aldri slått sammen.
- Dra stasjonsnavnet for å plassere det **uavhengig** av LED-rundingen. Når stasjonen tilhører et flerplattformanlegg med andre LED-er, påvirkes ikke de andres kartmarkører.
- Plasseringen begrenses innenfor valgt tavlemål/marg og LED-radius.
- Én fullført dra-bevegelse gir én transaksjon i prosjektets **Angre**-historikk. **Angre siste endring** bruker den samme historikken som resten av Map Studio.
- **Tilbakestill dette formatet** fjerner bare tavleplasseringene for *nåværende størrelse*, og kan også angres.
- **Eksporter JSON** inkluderer den nye plasseringen som en valgfri \`physicalBoardLayouts\`-struktur. Eksportert SVG gjenspeiler valgte stasjons- og etikettposisjoner.

### Data og formatavhengighet

Tavleposisjoner lagres som et visningslag:
\`\`\`json
{
  "physicalBoardLayouts": {
    "version": 1,
    "profiles": {
      "30x40": {
        "positions": {
          "stop:original-000": {"x": 0.5, "y": 0.4}
        },
        "labels": {
          "original-000": {"x": 0.51, "y": 0.38}
        }
      }
    }
  }
}
\`\`\`

Dette er **et eksempel på en valgfri datastruktur**, ikke en instruksjon om å endre eksisterende Trondheim-layout. Koordinatene er normalisert fra 0 til 1 innenfor tavlens eget fysiske format, ikke kartets \`stops[].x/y\`. Når en runding inngår i en gruppert stasjon, har den i stedet nøkkel \`quay:NSR:Quay:...\`. Profilnøkkelen \`30x40\` gjelder bare en 30 × 40 cm-tavle. **50 × 70 cm kan ha en helt annen plassering** uten å overskrive 30 × 40-oppsettet.

Originalens \`stops[]\`, \`paths[]\`, Quay-/StopPlace-ID-er og faktiske sanntids-/GPS-bindinger beholdes alltid uendret. Når en gruppert stasjon oppheves, fjernes eventuelle foreldede \`quay:...\`-posisjoner i de relevante tavleprofilene.

### Bevisste begrensninger

**Stasjonssymboler og navn kan flyttes uten å endre originalkartet.** Fra v0.7 kan brukeren selv aktivere «Linjene følger flyttede stasjoner» per tavleformat. Bare grafiske knekkpunkter som **allerede sammenfaller med ett entydig originalt kartstopp**, følger. Ved tvetydige/partielt flyttede plattformer beholdes den opprinnelige linjegeometrien. Dette er fortsatt en **visuell prototype**, ikke dokumentert rutetilknytning eller en godkjent produksjons-/borefil.

Neste naturlige steg er å gjøre **grafiske traséer redigerbare per tavleformat**, med valgfri snapping mot flyttede LED-stasjoner. Dette må forbli adskilt fra det kanoniske Trondheim-kartet og rutekildene.


## v0.7 – valgbar grafisk linjetilpasning per tavlemål

Map Studio har nå et eget valg: **«Linjene følger flyttede stasjoner»**. Dette er i utgangspunktet **avslått**, og kan aktiveres separat på f.eks. 30 × 40 cm uten å påvirke 50 × 70 cm.

Når valget er aktivt:

1. SVG-rendereren sammenlikner originalens **skjematiske** stoppkoordinater med originalens tegnede linjeknekkpunkter. Bare eksakt sammenfall (toleranse 0,025 skjematiske enheter) vurderes.
2. Hvis **nøyaktig ett** kartstopp ligger på punktet, og **alle det kartstoppets visuelle LED-markører** har fått egne tavleposisjoner, flyttes det aktuelle grafiske linjeknekkpunktet til symbolets nye plassering.
3. For en eksplisitt dobbelstasjon med to Quay-er på samme kartstopp brukes **midtpunktet mellom begge LED-rundingene**. Et kartstopp med en delvis flyttet gruppering og andre, uflyttede Quay-er blir **ikke** automatisk koblet.
4. Tegnede parallelle spor/fargestriper genereres deretter fra tilpassede grafiske knekkpunkter og bevarer den eksisterende geometriberegningen.
5. Slås valget av, tegnes **originalens linjepunkter uendret** igjen. Endringen er lokal for det aktuelle tavleformatet. Eventuelle tvetydige eller manglende treff kan vises som visuelle varsler.

Den valgte tilstanden lagres som valgfritt \`physicalBoardLayouts.profiles["30x40"].followStations: true\`, i tillegg til allerede støttede \`positions\` og \`labels\`. \`stops[]\` og \`paths[]\` endres aldri, og det opprettes **ingen nye faktiske rute-/Quay-/GPS-bindinger**. Dette er en grafisk tilpasning basert på **eksisterende skjematisk sammenfall**, ikke informasjon om hvor en buss fysisk kjører.

For ekstreme flyttinger kan linjene bli skarpt bøyd. En framtidig rutekorridor-editor bør gi egne tavleknekkpunkter for å forme disse bøyene uten å forfalske originaltegningen.


## v0.8 – ekstra linjeknekkpunkter på en fysisk tavle

I Map Studio: åpne **Fysisk tavleforhåndsvisning**, aktiver **Rediger kart** og **Rediger linjeknekkpunkter**. Dette er en alternativ redigeringsmodus til **Flytt stasjoner og navn**.

- **Blå, runde håndtak** viser eksisterende skjematiske knekkpunkter. Dra dem med mus eller finger, eller bruk piltaster for flytting på 1 mm (Shift: 5 mm).
- Velg **Linje** og **Delstrekning**, klikk **+ Legg til knekkpunkt**. Et nytt, **gult** håndtak legges mellom de to eksisterende punktene. Dra det til ønsket vinkel/posisjon.
- Marker et ekstra knekkpunkt i nedtrekkslisten og velg **Fjern valgt knekkpunkt**.
- **Tilbakestill valgt trasé** fjerner alle manuelle knekkpunktjusteringer på valgt linje **bare for nåværende tavleformat**. **Angre** virker på hver handling.
- Det fysiske formatet er fortsatt valgfritt: 30 × 40, 50 × 70, 40 × 40 eller egne centimeter-mål. En knekkpunktflytting i 30 × 40 påvirker ikke et 50 × 70-design.
- Tidligere valg **Linjene følger flyttede stasjoner** kan fortsatt aktiveres. Manuelt redigerte knekkpunkter prioriteres ved tegning, uten at GPS-sporing eller rutedefinisjoner forandres.
- Den **målsatte SVG-eksporten** inkluderer de justerte grafiske linjene, men inneholder **ikke de blå/gule redigeringshåndtakene**.

Lagring skjer i den valgfrie \`physicalBoardLayouts.profiles[format].routes\`-strukturen:
\`\`\`json
{
  "routes": {
    "trace-01": {
      "vertices": {"0": {"x": 0.5, "y": 0.3}},
      "bends": [
        {"id": "bend-1", "afterIndex": 0, "x": 0.51, "y": 0.35}
      ]
    }
  }
}
\`\`\`
Dette er **normaliserte tavlekoordinater**, ikke koordinater på originalen. Eksisterende \`paths[]\` og \`stops[]\` i Trondheim-modellen endres **aldri** når denne funksjonen brukes. Ingen Quay-ID-er eller sanntidshendelser blir opprettet eller påvirket.

Det er fortsatt nødvendig å kontrollere linje-/stasjonsavstander visuelt. Verktøyet bekrefter **ikke** at en skjematisk tegnet linje er en faktisk gjennomkjørbar rute, og SVG-filen er ikke automatisk godkjent som fysisk boremal.

## v0.9 – egen tavledesigner

Åpne `web/linear/index.html?view=designer`, eller velg **Tavledesigner** fra kartet.

1. Velg **Størrelse** (30 × 40, 50 × 70, 40 × 40 cm eller **Egne mål**).
2. **Flytt stasjon / navn** er aktivt fra start. Klikk på objektet og dra det. Navn kan flyttes separat. Gult omriss viser valgt objekt. Piltaster flytter 1 mm, Shift + piltast 5 mm.
3. Velg **Form linje** og klikk på linjen. Bare punktene til valgt linje vises. Dra blå punkter, eller velg en delstrekning og **Legg til punkt**. Ekstra punkter kan fjernes.
4. Bruk **Angre siste endring** ved behov. Endringer lagres automatisk i denne nettleseren. **Lagre prosjekt** lagrer arbeidskopi og laster ned JSON som kan åpnes med **Åpne prosjekt**. **Last ned tavlen (SVG)** gir en fysisk tegning med mm-mål.
5. **Se tavlen** skjuler håndtakene. **Forstørrelse** hjelper med små navn og presis flytting. På berøringsskjerm kan du bla i den forstørrede tegningen i **Se tavlen**, og deretter velge et redigeringsverktøy.

**Flere innstillinger** inneholder LED-diameter, marg, navnestørrelse, linjer som følger stasjoner og tilbakestilling. Linjefølging er fortsatt et eksplisitt valg per format. Den tekniske kildekarteditoren finnes fortsatt under **Sanntidskart → Rediger kart**.

Hvert cm-format beholder sine egne visuelle plasseringer og linjepunkter. Verktøybytte endrer ingen kartdata. Original Trondheim-geometri og reelle Quay-koblinger forblir autoritative. Oransje ringer varsler om tett LED-avstand; dette er en skisse, ikke en godkjent kablings- eller boreplan. Ingen produksjonsdeploy.

Nettleserregresjonene dekker direkte inngang, stasjonsflytting/markering, Angre, formatbytte, linjevalg i tegningen, linjeflytting, nye punkter, prosjektlastning etter oppdatering, eksport, zoom, mobilbredde, forhåndsvisning og retur til sanntidskart. Eksisterende tavle- og karttester beholdes.
