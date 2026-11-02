# InTransit Map Studio v0.1

Map Studio videreutvikler den eksisterende Linear-karteditoren. Alle originale SVG-koordinater, holdeplass-ID-er og linjebindinger beholdes. Ingen ny kartmodell, worker-endring eller produksjonsdeploy.

## Bruk

1. Åpne **Trondheim Buss → Hele kartet** i Linear.
2. Velg **Rediger kart**. Øverst i editoren ligger **Map Studio · tegnehjelp**.
3. Velg eventuelt **Vis rutenett**, **Fest til rutenett**, **Lås til 45°** og rutenettavstand på 5, 10 eller 20 kartenheter. Ved tegning av ny linje og forlengelse gjelder vinkelen fra forrige punkt. Når et eksisterende linjepunkt dras, brukes punktet før som vinkelreferanse.
4. Bruk **+ Ny kartlinje**, eller marker en eksisterende linje og velg **Fortsett å tegne fra siste punkt**.
5. Bruk **Eksporter SVG-tegning** for en visuell, skalerbar kopi som kan åpnes i Inkscape.

**Viktig:** JSON-eksport og editorens arbeidskopi er prosjektfilen for InTransit. SVG er en visuell eksport, uten Entur-koblinger, manuelle rutegodkjenninger eller sanntidsdata. SVG-filer importeres ikke tilbake til rutemodellen. Dersom et eksisterende punkt flyttes, gjelder samme regler som før for å fjerne manuell godkjenning av berørte delstrekninger.

## Kompatibilitet og testing

- Visuelt rutenett tegnes kun når redigering er aktiv.
- Valg av visning/magnetfunksjoner runder aldri av eksisterende kartdata.
- Kun nye punkt og punkt som brukeren faktisk flytter blir justert.
- Nye stopp og flyttede stopp kan festes til rutenettet. Navnetiketter beholder fri plassering.
- Andre Linear-visninger og live-LED-framer er uberørt.

Kjør:
```bash
node scripts/test-map-studio.mjs
node scripts/test-intransit-map.mjs
```

Det finnes også valgfrie nettlesertester med Playwright (`scripts/browser-intransit-map.mjs`) for interaktiv testing før sammenslåing.
