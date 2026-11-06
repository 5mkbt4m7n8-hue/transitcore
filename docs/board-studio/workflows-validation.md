# Board Studio v0.3.3 – arbeidsflyter og kontroll

Testet lokalt 6. november 2026 med Node 24.19.0 og ekte Chromium 154.0.8037.57 via Playwright over lokal HTTP. Begge nye suiter inngår også i GitHub CI; lokal bestått-status og CI-status rapporteres separat.

## Ny modelltest

`node scripts/test-workflows-board-studio.mjs` består:

- Linjeforhåndsvisning har nøyaktig samme stigeometri som den opprettede forbindelsen. Den endrer ikke originalprosjektet. Ugyldig valg returnerer forklaring uten ny forbindelse.
- Fire dobbeltstopp plasseres på en 45° stripe med start hver tredje LED-posisjon. Hvert hull og hver ring har eksakte, direktebundne LED-koordinater. Prosjekt-/stasjons-/hull-/bindingsidentiteter holdes adskilt.
- Alle 18 innebygde symbolvarianter kan brukes på en stripe med målt pitch og første-LED-offset. Visuelle ring-/hulldiametere beholdes.
- Omvendt indeksretning og egendefinerte faktiske indekser, opptatte posisjoner, utløpt stripe, ugyldige/dupliserte indeksvalg og låste lag.
- Ett stopp per Angre/Gjør om-operasjon. Angre gjenåpner den aktuelle LED-gruppen. JSON-rundtur bevarer full fysisk modell.
- Kontrollfunn har strukturerte mål for fysisk layout, linjegeometri og ubundne punkter. Stasjoner med samme navn identifiseres med hver sin ID. Hullkollisjoner peker til berørte stasjoner.

## Ny Chromium-test

`browser-workflows-board-studio.mjs` består med faktiske peker-, tastatur- og filhandlinger:

1. Hover over en ugyldig sluttport viser rødt og avvist klikk endrer ikke prosjektet. En gyldig sluttport viser grønt. De forhåndsviste SVG-stiene er identiske med den ferdige forbindelsen.
2. Velg dobbeltstopp, fysisk segment med omvendt indeksering, intervall tre og navneprefiks. Plasser gjentatte stopp med knapp, Enter og faktisk LED-klikk.
3. Kontroller neste LED-gruppe, unike bindinger, ingen gjenbruk, uttømming av segmentet og Angre/Gjør om.
4. Last ned faktisk prosjekt-JSON og åpne igjen; bindingene bevares.
5. Filtrer fysiske funn, klikk en bestemt stasjon blant to med samme navn og kontroller utvalg/markering. Prosjektet er identisk før og etter navigasjonen. Ubundet-filteret viser de manglende koblingene.

Kommando:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright CHROMIUM_PATH=/path/to/chromium node scripts/browser-workflows-board-studio.mjs
```

`CHROMIUM_PATH` kan utelates når Playwright har installert Chromium. `BOARD_WORKFLOWS_SCREENSHOT` lager skjermbilder av forhåndsvisning, hurtigplassering og kontrollnavigasjon. [Veiledningen](README.md) lenker de lokale testbildene.

## Regresjoner

Alle sju modell- og alle sju Chromium-suiter består lokalt: grunneditor, authoring, v0.3, v0.3.1, v0.3.2, stripe-snapping og nye arbeidsflyter. Den eksisterende uavhengige SVG-geometritesten for sju orienterings-/avstands-/radiuskombinasjoner før og etter gjenåpning beholder største målte avstandsavvik 0,003020 mm.

## Arkitektur og avgrensning

`workflows.mjs` bruker eksisterende port-, stasjonsmal-, LED- og bindingsmodeller. Ingen separat geometrimotor eller parallell fysisk identitetsmodell introduseres. Kontrollfunn fra `mechanicalCheck` får strukturerte mål; `boardChecks` legger til linjegeometri og ubundne punkter. Visningsnavigasjon og forhåndsvisning lagres ikke som dokumentendringer. Prosjektformatet er fortsatt v3.

Hurtigplassering lager ett stopp per handling og bruker påfølgende LED-er innen et flerpunktsymbol. Den slår ikke sammen kjeder, deler ikke opptatte LED-er og oppretter ikke Entur-/Quay-bindinger. Malen er et snapshot for den aktive plasseringsøkten. Endring av intervall eller symbol gjøres ved å avslutte og starte igjen; egne indekslister kan gi varierende intervaller i samme økt. Kontrollfunn gjør ingen automatiske korrigeringer, og en tom liste er ikke en produksjonssertifisering. Boremal/PDF og fysisk produksjon inngår ikke her.
