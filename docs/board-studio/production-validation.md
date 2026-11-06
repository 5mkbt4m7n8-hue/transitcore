# Board Studio v0.4 – produksjonseksport og validering

Testet lokalt 6. november 2026 med Node 24.19.0, ekte Chromium 154.0.8037.57 via Playwright, pypdf 6.10.0 og PyMuPDF 1.26.6 for visuell gjengivelse. GitHub CI kjører de nye modell-/Chromium-testene og uavhengig pypdf/XML/CSV-kontroll i tillegg til de eksisterende suitene. Lokal bestått-status og CI-status rapporteres separat.

## Filene og geometrien

- Bore-PDF er vektorbasert med `72 / 25,4` PDF-punkter per millimeter, `/UserUnit 1` og `/PrintScaling /None`. Ingen rasterisering eller skjerm-/DPI-beregning brukes. Separate PDF-lag inneholder hull, senterkryss, nummer, tavlekontur, registrering og kontrollmål.
- Samlet format og A4 stående/liggende. Standard 15 mm marg og 10 mm overlapp. 300 × 400 mm gir henholdsvis ett 330 × 430 mm ark, fire stående A4 eller seks liggende A4. Maksimalt 100 fliser hindrer utilsiktet store dokumenter; større tavler kan eksporteres i samlet format.
- Hullsentrene og diameterne kommer fra `station.holes`, inkludert individuelle diametere og lyslederoffset. Grafiske ringmål brukes ikke som boremål. Eksport leser også strukturerte monteringshull `{id, x, y, diameter, name?}` fra eksisterende `production.mountingHoles`.
- Baksiden har `x = tavlebredde − forsideX`, uendret Y og diameter. Ingen prosjektkoordinater eller LED-identiteter endres. Sidebetegnelse og TOPP-retning står i utskriftsmalen.
- Bore-SVG for utskrift har merknadsmarg. Egen Hull-SVG for maskinimport har bare hull, plateorigo og eksakte tavlemål. Dermed følger ikke utskriftsmargen med inn som en maskinforskyvning.
- Grafikk-SVG følger grafiske eksportvalg og har separate grupper for traséer, kapsler, ringer, navn og kontur. Den inneholder ingen fysiske hull eller LED-lag. Baksidevalg speiler hele grafikken, inkludert navn.
- CSV beholder hullnummer, permanente hull-/stasjons-ID-er og fysisk segment/LED-/kontroller-/kjedeidentitet. Valgt sides koordinater og originale forsidekoordinater er begge med. Eksplisitt delte hull tegnes én gang, med alle logiske referanser beholdt i CSV.

## Modelltest

`node scripts/test-production-board-studio.mjs` består:

1. Eksakte forside-/baksidehull, diametere og identiteter for 18 direktebundne punkter.
2. Riktig A4-sideantall, overlapp, globale flisforskyvninger og samlet sidestørrelse.
3. PDF-header, MediaBox, xref-offsets, separate innholdslag og 100 %-utskriftsinnstilling.
4. X- og Y-kontrollmål, printbare merknadsmarger, uavhengighet fra ringstørrelse og skjulte hullag.
5. Utskrifts-SVG mot ren Hull-SVG i plateorigo, speilvendt grafikk og grafiske eksportvalg.
6. CSV-identiteter og eksplisitt delte hull uten dobbeltboring.
7. Fysiske feil kan ikke overstyres med «tillat ubundne». Ubundne punkter krever et eksplisitt valg. Uforklarte ring-/hullavvik blokkeres.
8. Monteringshull og kollisjonskontroll, ikke-muterende eksport, lagrede eksportvalg, JSON og Angre/Gjør om.

## Ekte Chromium

`browser-production-board-studio.mjs` består med faktiske nedlastinger:

- PDF for forside/bakside A4, liggende A4 og samlet tavleformat.
- Bore-SVG, Hull-SVG, grafikk-SVG og CSV; faktiske SVG-sentre/diametere leses med DOMParser.
- Eksporten lar prosjektet være identisk. Eksplisitt lagring av eksportvalg er reversibel og følger JSON ved gjenåpning.
- Ubundet-aksept må velges på nytt når dialogen åpnes. Fysiske feil deaktiverer nedlasting.
- Forhåndsvisning og arkvelger, samt stor og mobil dialogvisning.

## Uavhengig kontroll av faktiske PDF-er

`python scripts/check-board-studio-pdf.py /path/to/downloads` bruker pypdf 6.10.0, XML- og CSV-lesere. Forventet hullgeometri regnes fra det lagrede kildedokumentet, ikke fra JavaScript-eksportørens sideplan.

Bestått for 15 faktiske PDF-sider: fire stående forside, fire stående bakside, seks liggende forside og én samlet forside. Leseren kontrollerer MediaBox i fysiske enheter, papirretning, PDF-lag, faktiske sirkelsentre og diametere, sirklenes Bézier-kontroller, klippeområder, hullnummer mot kilde-ID, flisforskyvninger, full dekning av kildens 18 hull, baksidespeiling, begge 100 mm-kontrollstrekene og trykte sidebetegnelser. Utskrifts-SVG, Hull-SVG med null marg og CSV kontrolleres mot samme kilde, inkludert identiteter.

PDF-ene er også åpnet med Poppler `pdfinfo` og gjengitt med PyMuPDF for visuell kontroll. Dette er filkontroll, ikke en måling av en fysisk skriver eller et boret materiale.

Eksempelkommandoer:

```sh
node scripts/test-production-board-studio.mjs
PLAYWRIGHT_MODULE=/path/to/playwright CHROMIUM_PATH=/path/to/chromium BOARD_PRODUCTION_OUTPUT=/tmp/board-production node scripts/browser-production-board-studio.mjs
python scripts/check-board-studio-pdf.py /tmp/board-production
node scripts/generate-production-board-studio.mjs
```

CI installerer pypdf i en isolert midlertidig katalog og lagrer de faktisk nedlastede filene sammen med skjermbildeartefaktene. Bruk `PYTHONPATH` ved en slik isolert installasjon.

## Regresjoner

CI bruker Playwrights Chromium 158. En asynkron `details.toggle`-hendelse kunne la avansertpanelet lukke seg ved første feltendring i denne nettleseren. Panelets faktiske åpningstilstand leses nå før egenskapspanelet bygges på nytt. Chromium-testen åpner panelet, endrer et felt umiddelbart og kontrollerer at både panelet og håndtakene forblir åpne.

Åtte modell- og åtte Chromium-suiter består lokalt: grunneditor, authoring, v0.3, v0.3.1, v0.3.2, stripe-snapping, v0.3.3-arbeidsflyter og produksjon. Den eksisterende uavhengige SVG-geometritesten beholder største sporavstandsavvik 0,003020 mm. Også bestått: plattformmodellene (102 kontroller, 13 tavlefiler), tavlesiden, Gråkallbanen-editoren og retningsmapping.

## Arkitektur og avgrensning

`production.mjs` bygger boregeometri og en felles millimeterscene for SVG, forhåndsvisning og PDF. `pdf-vector.mjs` skriver en frakoblet PDF med standardfont og valgfrie innholdslag; borehull og kryss er vektorer. PDF-en er en boremal, mens grafikken leveres som SVG. Hull-SVG inneholder ingen tekst eller støttegrafikk. PDF-standardfonten støtter norske bokstaver; uvanlige tegn i prosjekttittel kan erstattes i den trykte toppteksten, mens PDF-metadata og CSV/SVG beholder tekstdata.

`production-settings.mjs` definerer versjon 1 av valgfrie `production.exportSettings` i prosjektformat v3. Eksisterende prosjekter migreres som før. Kun et eksplisitt Lagre-valg skriver preferanser. Aksept av ubundne punkter lagres ikke som en varig godkjenning.

Boremalen gjør ingen korrigering av hull, ingen verktøy-/kerfkompensasjon og ingen tilpasning til faktisk skriver, materiale, optikk eller strømoppsett. Mål utskriftens kontrollstreker og stripens pitch/offset før bruk. Det finnes ikke en egen visuell redigerer for monteringshull i denne fasen. Ingen merge, produksjonsdeploy eller fysisk maskinkjøring er utført.
