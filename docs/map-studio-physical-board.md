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
