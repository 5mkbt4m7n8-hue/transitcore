# Fri stasjonsredigering i v0.7

Feilen ved 2 → 3 punkter skyldtes at punktantallet ble endret uten å oppdatere de eksplisitte ringsentrene og hullplassene fra plasseringen. Valideringen avviste dermed objektet. Redigeringen synkroniserer nå antall, sentre, stabile punkt-ID-er, individuelle stiler, hullplasser, bindinger og traséporter i én angrehandling. Ugyldige verdier gir en synlig feilmelding.

## Kort brukerveiledning

1. Marker en stasjon. Under **Stasjon** velger du 1–8 punkter, punktavstand og vinkel. Vannrett/loddrett roterer grafikken. Avstand skalerer også asymmetriske forskyvninger; jevn fordeling gjenoppretter en regelmessig rekke. X/Y flytter hele grafikken uten å flytte fysiske hull.
2. **Utseende** angir felles ytterdiameter, innerdiameter, ringstrek, farge og kapsel. **Individuelle punkter** velger A–H, med egen X/Y og diameter/strek. Tomme stilfelt arver fellesverdien. Arveknappen fjerner punktets overstyringer. Individuelle mål endres ikke av senere malvalg.
3. Slå på punktredigering med knappen eller dobbeltklikk en ring. Dra ringen/punkthåndtaket for å flytte bare dette punktet. Dra firkanthåndtaket for å endre ytterdiameter. Målet vises i mm under bevegelsen, og samme geometri lagres ved slipp. Hold Ctrl for fri plassering uten snapping. Bruk +/− for å legge til eller fjerne valgt punkt.
4. **Tilpass ringstørrelser** krymper ringene ut fra den faktiske minste punktavstanden, med individuelle forskjeller beholdt. Funksjonen antar ingen stripebredde. Du kan deretter overstyre alle mål manuelt, også tillate grafisk overlapp.
5. **Fysisk LED** inneholder hull og bindinger. Nye tilleggspunkter er grafikk uten aktivt borehull. Aktiver fysisk hull eksplisitt eller bind punktet til en LED. Eksisterende hull bevares. Fjerning av et aktivt hull/bundet punkt og fysiske diameterendringer viser konsekvensene og krever bekreftelse. Avbryt beholder prosjektet.
6. Lagre som mal, velg som standard eller kopier med Ctrl+C/V. Stil og innbyrdes plassering kopieres; stasjons-/punkt-ID-er blir nye, og LED-/Entur-identiteter følger ikke med. Lagre prosjekt-JSON for å bevare hele arbeidet. Angre/Gjør om omfatter punktredigeringen.

Grafisk punktflytting, størrelse, avstand og punktrekkevinkel flytter aldri fysisk LED eller hull. Ved direkte belysning kan grafikken derfor midlertidig avvike fra hullet; kontrollisten viser dette. Grafikk-SVG kan eksporteres under slikt designarbeid, mens borefiler fortsatt krever bestått fysisk kontroll. Eksisterende R-rotasjon beholder sin særskilte funksjon: ubundne fysiske hull roteres med bekreftelse, mens direktebundne punkter står fast og yttermarkeringen roteres. Bruk punktrekkevinkelen for fri grafisk rotasjon også med bindinger.

## Eksempel

[Prosjekt med asymmetriske punkter og kompakt tostripestasjon](examples/free-station-design-v07.json) · [Vektorforhåndsvisning](examples/free-station-design-v07.svg).

Eksemplet har fem grafiske punkter og bare to aktive fysiske hull. De tre grafikkpunktene har individuelle diametere 6/4/6 mm. To 5 mm brede striper ligger kant mot kant, med 5 mm mellom LED-rekkene og 10 mm pitch langs stripene. Den kompakte stasjonen har to separate LED-bindinger.

## Modell og kompatibilitet

Prosjektformatet er versjon **4** og åpner versjon 1–3 gjennom migrering. Eksisterende hull og identiteter bevares. Eldre editorer skal avvise det nye formatet fremfor å feiltolke inaktive hullplasser som borehull. Behold originalfilen dersom du trenger den gamle editoren.

`point-style.mjs` definerer stabile punkt-ID-er og arvede/individuelle stiler. `station-edit.mjs` gjør atomiske redigeringer. Logisk anker, grafiske sentre og fysiske hull/LED-referanser lagres separat. `holes[].enabled=false` markerer en inaktiv fysisk plass; slike plasser tegnes ikke som hull og er ikke med i borefiler eller hullklaringskontrollen. Maler lagrer stil og relative posisjoner uten unike punktidentiteter. Kopier får nye ID-er.

Når et punkt fjernes, beholdes ID-ene til de øvrige punktene og bindingene deres. Tilknyttede traséporter remappes etter retning når mulig. Fjernet port gir en konkret kontrollmelding og automatisk trasétilkobling. Grafisk parallellredigering flytter grafikken, uten å flytte fysiske hull.

## Automatisert kontroll

Modellsuiten `scripts/test-point-edit-board-studio.mjs` og den ekte Chromium-suiten `scripts/browser-point-edit-board-studio.mjs` dekker:

- A: uten striper, 2 → 3, avstand, individuell diameter og faktisk JSON-lagring/gjenåpning.
- B: kant-i-kant-striper, tilsiktet ringoverlapp, automatisk/manuell komprimering og intakte bindinger/hullsentre. Grafikk-SVG lastes ned også med fysiske advarsler.
- C: eksisterende v0.6-prosjekt, løsne bindinger, 2 → 3, Angre/Gjør om og lagring.
- D: forskjellige punktdiametere, bare midtpunktet flyttes, mal og ny plassering med nye identiteter.
- Direkte dra-/størrelseshåndtak med samsvar mellom forhåndsvisning og lagret mm-geometri, arving, kontrollert sletting, stabil bindingsreindeksering, fysisk bekreftelse og synlig ugyldig verdi.
- Faktisk nedlastet bore-SVG fra eksemplet inneholder nøyaktig de to aktive hullene. Eksporten endrer ikke prosjektet.

Samlet kontroll omfatter 11 modell- og 11 Chromium-suiter, inklusive tidligere geometri, snapping, plassering, bindinger, montering og produksjon. De eksisterende 18- og 22-hullsproduksjonstestene kontrolleres også uavhengig med pypdf/XML/CSV på totalt 30 PDF-sider. CI kjører Chromium fra Playwright; lokal kontroll bruker systemets Chromium.

## Begrensninger

Modellen støtter 1–8 punkter og endelige, positive mål innen feltgrensene. Låste grafikklag må låses opp før redigering. Indre ring større enn ytre ring er tillatt, men forklares i punktpanelet. Tilsiktet grafisk overlapp tillates; mekaniske konflikter og reelle sporfeil kontrolleres fortsatt. Automatisk tilpasning krymper bare og kan ikke løse sammenfallende sentre fysisk. Ingen automatisk flytting av hull, ny firmware eller produksjonsdeploy inngår.
