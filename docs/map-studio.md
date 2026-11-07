# InTransit Map Studio v0.2 (utkast – PR #323)

Map Studio er et tillegg til den eksisterende karteditoren i Linear. Ingen opprinnelige kartpunkt, linjer, Entur-identiteter eller LED-koblinger blir skrevet om ved oppgraderingen. JSON er fortsatt prosjektets autoritative format.

## Tegne og redigere

1. Åpne **Trondheim Buss → Hele kartet → Rediger kart**.
2. Slå på valgfritt **Vis rutenett** eller **Fest til rutenett**, med intervaller på 5, 10 og 20 kartenheter.
3. Velg **Vinkellås: Fri / 15° / 45°**. Låsen virker ved tegning og flytting av et linjepunkt i forhold til forrige punkt. Når vinkellås og rutenett er aktivert samtidig, justeres avstanden langs valgt vinkel; x og y må ikke begge lande på rutenett.
4. Marker en linje. I «Spor og parallelle rutefarger» kan du velge **ett spor / dobbeltspor**, **1–4 parallelle fargelinjer per spor**, linjeavstand og **hver enkelt farge**. Det gir opptil åtte tegnede linjer på én geometrisk trase. Utgangskoordinatene endres ikke.
5. Marker en holdeplass. **Dobbel stasjon (kun grafikk)** viser to plattformmarkeringer ved stasjonen, men oppretter ikke nye Entur-plattformer eller uverifiserte live-indikatorer. De eksisterende valgene for «To dioder» og manuell Quay-sidekontroll er separate og beholdes.
6. Trykk **Marker område** og dra et rektangel rundt en eller flere linjepunkter/holdeplasser. Bare markører og linjepunkter inni markeringen blir valgt. Dra **innenfor rektangelet** for å flytte området, eller dra **det gule håndtaket øverst eller nederst** for å strekke tegningen vertikalt fra motsatt kant. Tilhørende stasjonsnavn følger stasjonens markør. Bruk «Fjern markering» eller Escape for å gå ut. Endringen lagres først ved fullført dra-bevegelse, slik at **Angre** fungerer som én operasjon.
7. Bruk **Eksporter SVG-tegning** for visuell eksport til f.eks. Inkscape. **Eksporter JSON** for å beholde alle redigerbare kartdata.

## Begrensninger og avklaring

- Visuelle parallelle ruter er foreløpig **manuelt fargelagte streker**, ikke en automatisk kobling mellom farge, rutenummer eller GPS/Entur. Dokumenterte rutedeler tegnes fortsatt separat i kildelagene. Videre utvikling kan knytte hver grafisk linje til en valgt offentlig bussrute.
- Dobbel stasjon er foreløpig en *visuell plattformmarkering*. Virkelig Quay-plassering/retning må fortsatt bekreftes manuelt.
- Områdestrekking er **vertikal** og flytter/skalerer bare valgte punkter. Segmenter inn og ut av valgområdet forlenges/forkortes naturlig. Verktøyet flytter ikke uvalgte stasjoner. Alle punkter og etiketter må forbli innenfor 913×1280-kartflaten.
- Når en manuell godkjenning for en rutestrekning berøres av endret geometri, blir denne godkjenningen fjernet for den aktuelle delstrekningen. Kildebevis fra Entur blir ikke forfalsket.
- SVG-eksporten er en separat tegnefil. Den kan åpnes og redigeres i eksterne vektorprogrammer, men **SVG-import tilbake i InTransit er ennå ikke implementert**.

## Verifisering

```bash
node scripts/test-map-studio.mjs
node scripts/test-intransit-map.mjs
```

Det nye Map Studio-testsnittet er også koblet inn i eksisterende `linear-mobile.yml` CI. Testingen av faktisk berøring, markering og strekk i Playwright/Chromium må godkjennes før PR #323 kan slås sammen med `main`.
