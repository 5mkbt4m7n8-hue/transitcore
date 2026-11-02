# InTransit Map Studio v0.3 — datamodell for ekte LED-tavlepreview

**Status:** Delvis implementert i utkast-PR #323, **ikke publisert**. Første prototype kan eksplisitt gruppere to bekreftede Entur Quay-er som allerede er knyttet til **samme skjematiske kartpunkt**, og tegne to separat kildekoblede LED-rundinger. Stasjonsstil (ring/kapsel/separate rundinger), ringmargin og avstand kan endres. Felles ring får aldri LED-status. Eksisterende tavle-/GPS-kilde, originalkart og hardwareprofil endres ikke.

**Gjenstår:** gruppering på tvers av to ulike `stops[]`-markører (selv om de ligger tett), full valgbar fysisk/64×64-preview, komplett visuell plassering/flerstoppseditor og egne nettleserregresjonstester for alle symbolvarianter. De øvrige seksjonene i dette dokumentet beskriver den langsiktige v0.3-modellen, ikke nødvendigvis funksjoner som er ferdig implementert.

## 1. Prinsipp og eksisterende data

En runding som lyser i en ekte tavlepreview skal være koblet til en **identifisert Entur Quay** — ikke bare en tegnet sirkel. To eller flere reelle Quay-er kan vises innenfor én felles stasjonsring, men beholder hver sin sanntidsstatus og hver sin unike identitet.

Dagens `web/linear/network/trondheim-layout.json` har 100 **skjematiske kartpunkter**: 68 `confirmed` og 32 `unresolved` (kontrollert 2026-11-02). Dette er *ikke* 100 unike Quay-er. Én `stops[]`-oppføring kan ha flere forskjellige Quay-er i `bindings[]`. Et `NSR:StopPlace` er et stoppanlegg med én eller flere `NSR:Quay`-plattformer. De uavklarte punktene skal ikke få ekte LED-status før identiteten er verifisert.

**Eksisterende felt beholdes:** `schemaVersion:1`, `stops[]`, `paths[]`, `bindings[]`, `diodeMode`, `platformSides`, `reviewedSegments` og alle originale ID-er/koordinater. Den nye modellen er kun et *valgfritt tillegg*:

```json
{
  "displayStationsVersion": 1,
  "displayStations": []
}
```

Når dette feltet mangler, skal programmet vise nøyaktig den eksisterende Linear-visningen.

## 2. Struktur: displayStations[] og medlemmer

| Felt | Type | Formål |
|---|---|---|
| `displayStations[].id` | unik streng | Stabil ID for grafisk stasjon |
| `anchor` | `{x,y}` | Plassering på eksisterende 913×1280-kart |
| `trackAnchor` | `{pathId,segmentIndex,orientation}` | Stasjonsretning langs geometrisk trasé, valgfritt |
| `style` | objekt | Stasjonsstil, ring/kapsel, radius og avstand |
| `label` | objekt | Felles eller separat navn, med referanse til eksisterende navnekilde |
| `reviewStatus` | enum | `unreviewed` / `user-reviewed` — kun manuell grafisk vurdering |
| `members[]` | array | Hver indre runding som har sin egen reelle Quay |
| `members[].id` | streng | Stabil intern runding-ID |
| `members[].mapStopId` | streng | ID til eksisterende `stops[]`-oppføring |
| `members[].quayId` | streng | Nøyaktig `NSR:Quay:...` fra stoppets `bindings[]` |
| `members[].slot` | enum | `a`, `b`, `center` eller `custom`; **ikke** kjøreretning |
| `members[].offset` | `{along,across}` | Forskyvning langs/normalt på tegnet spor |
| `members[].placementReview` | enum | `unreviewed` / `user-reviewed` for visuell plattformplassering |

Stasjonens ytre ring er kun dekorasjon — den får **aldri** en egen LED eller bussstatus. Hver indre runding har maksimalt én Quay-ID. Verken retning 0/1, navnelikhet eller geografisk avstand må avgjøre automatisk hvilken side en Quay skal tegnes på.

### Faktisk eksempel fra dagens kart: Pirbadet

Eksemplet bruker eksisterende `original-000`, `NSR:StopPlace:41586`, `NSR:Quay:71132`, `NSR:Quay:71134` og `trace-01`. **Tegneside og avstand er forslag, ikke bekreftet fysisk plattformside.**

```json
{
  "displayStationsVersion": 1,
  "displayStations": [
    {
      "id": "ds-pirbadet",
      "anchor": {"x": 478.76, "y": 174.49},
      "trackAnchor": {
        "pathId": "trace-01",
        "segmentIndex": 0,
        "orientation": "follow-tangent"
      },
      "style": {
        "type": "double_outer_ring",
        "outerShape": "capsule",
        "markerRadius": 3,
        "ringPadding": 4,
        "ringWidth": 1.2
      },
      "label": {"mode": "shared", "sourceMapStopId": "original-000"},
      "reviewStatus": "unreviewed",
      "members": [
        {
          "id": "ds-pirbadet-a",
          "mapStopId": "original-000",
          "quayId": "NSR:Quay:71132",
          "slot": "a",
          "offset": {"along": 0, "across": -8},
          "placementReview": "unreviewed"
        },
        {
          "id": "ds-pirbadet-b",
          "mapStopId": "original-000",
          "quayId": "NSR:Quay:71134",
          "slot": "b",
          "offset": {"along": 0, "across": 8},
          "placementReview": "unreviewed"
        }
      ]
    }
  ]
}
```

Eksemplet er et **tillegg** til den eksisterende `trondheim-layout.json`, ikke en ny fullstendig kartfil. Det må slås sammen med uendrede `stops[]` og `paths[]`.

### Symbolene

Støtt `single`, `single_ring`, `double`, `double_outer_ring`, `double_capsule`, `interchange` og `terminus`. For dobbeltstasjon: to individuelle indre LED-rundinger, én på hver side av det tegnede sporet; valgfri felles ytre ring eller kapsel. Juster radius, avstand, ytterring og etikett. Symboltype styrer ikke faktisk fysisk antall Quay-er; hvis flere Quay-er finnes, må alle ha en eksplisitt visningsslot.

## 3. LED-preview: kilde og status

**LED-preview er en avledet runtime-visning, ikke en kopi av live-data lagret i layouten.** Lagre ingen buss-ID-er, sanntidsobservasjoner, fiktive LED-nummer eller konstruerte Quay-identiteter i `displayStations`.

Foreslått *session-konfigurasjon*:

```json
{
  "previewConfig": {
    "boardProfileId": "trondheim-city-lines-catalog",
    "sourceMode": "live",
    "ledNumbering": "logical",
    "requireVerifiedQuay": true,
    "requireReviewedPlacementForDirectionalPreview": true
  },
  "calculatedSlot": {
    "displayStationId": "ds-pirbadet",
    "memberId": "ds-pirbadet-a",
    "quayId": "NSR:Quay:71132",
    "boardNodeId": null,
    "logicalLed": null,
    "physicalLed": null,
    "mappingStatus": "awaiting-resolution",
    "sourceStatus": "NO_FRAME",
    "signalState": null,
    "isSimulated": false
  }
}
```

`null` betyr her **ikke oppslått i dette dokumenteksemplet**, ikke at Pirbadet mangler tavlenode. Ved implementasjon må node-/LED-nummer løses opp fra aktuell profil. Den eksisterende katalogens logiske LED-indekser er ikke nødvendigvis riktig fysisk kabling.

### Oppslag for én runding

1. Slå opp `mapStopId`; krever eksisterende `verification='confirmed'`.
2. Bekreft eksakt `quayId` i det aktuelle stoppets `bindings[]`.
3. Finn matching `boardId`, `nodeId`, `stationId`, `stopId` i den valgte tavleprofilen; utled logisk LED fra noden.
4. Finn fysisk LED **bare** hvis hardwareprofil har verifisert `logicalLed → physicalLed`-mapping. Den grafiske sirkelen er ikke et bevis for fysisk plassering.
5. Bruk bare validerte signaler fra eksisterende `InTransitMapModel.resolve`, `signals` og gyldig frame, med korrekt valgt linjefilter og kildestatus. Ingen ny GPS- eller rutebestemmelse.
6. Hvis begge Quay-er peker til én fysisk LED: flagg **AMBIGUOUS_SHARED_LED**. Ikke tenn én runding ut fra den andres signal.
7. Uten gyldig frame vises `NO_FRAME` eller `STALE`, ikke falsk sikker «ingen buss». `OFF` betyr kun ingen gyldig aktiv observasjon i en **gyldig** brukt frame; ved `NO_FRAME`/`STALE` skal `signalState` være `null`. Bruk eksisterende tilstander som `AT_STOP`, `APPROACHING`, `PARKED` og `PASSED` der kildemodellen støtter dem.

**Tre preview-typer:** logiske LED-er i tavleprofil; fysiske LED-er bare ved bekreftet kabling; og en egen 64×64 RGB-matriseprofil som projiserer tegning til piksler. Én grafisk markør kan bruke flere RGB-matrisepiksler — den er ikke nødvendigvis én fysisk diode. Demo-data må merkes `SIMULERT` og aldri framstå som LIVE.

## 4. To modi i Map Studio

**Datamodus:** velg faktisk kartstopp/Quay, se kildeidentitet og tilkoblet tavlenode, eventuelle konflikter, retning og verifiseringsstatus. Uavklarte stopp vises for oppfølging, men kan ikke aktivere reelle preview-LED-er.

**Displaymodus:** velg en eller flere allerede identifiserte Quay-er → «Grupper til stasjon» → velg symboltype → plasser indre rundinger og ytre ring → lagre. Du kan splitte gruppen igjen, endre avstand/ring/etikett, flytte eller strekke kartgeometri, uten å endre Quay-bindingene. Automatisk forslag kan vises, men må godkjennes manuelt.

**Tavlemodus:** visualiser hele tavlen, bytt mellom LIVE, HISTORIKK og tydelig markert DEMO. Trykk på én lysende runding for Quay, node, logisk/fysisk LED (når tilgjengelig), datakilde, frame-alder, observasjon og årsak til lyset.

## 5. Dataintegritet og tester

- Hvert aktivt preview-medlem må kunne spores fra `displayStations[].members[].quayId` via den eksisterende `stops[].bindings[]` til en verifisert tavlenode.
- Unik Quay per aktiv visning; ingen doble lysende rundinger for samme fysiske plattform uten eksplisitt håndtert konflikt.
- **Aldri autogruppér** på grunnlag av navn, `StopPlace`, kort avstand eller retningskode 0/1. *Samfundet* har to bevisst separate kartpunkter med ulike Quay-er innen samme `StopPlace`.
- Avgruppering eller stilendring må ikke slette/smutte sammen faktiske stopp eller endre `NSR:Quay`, `NSR:StopPlace`, fysisk LED-nummer eller routing.
- Hvis bare Quay A har gyldig aktivitet, lyser bare runding A; B forblir av/ukjent iht. kildestatus. En felles ring lyser aldri av seg selv.
- Endringer skal lagres som én transaksjon med Angre; eksport av JSON bevarer identiteter. SVG er en grafisk eksport, ikke autoritativt datagrunnlag.
- Manglende `displayStations` eller ugyldig v0.3-tillegg skal aldri ødelegge eksisterende Linear-rendering.

## 6. Foreslått implementeringsrekkefølge

1. **Lesemodus og validering:** bygg først støtte for frivillig `displayStations`; katalogiser bekreftede Quay-er. La de 32 uavklarte kartpunktene stå som uavklarte oppgaver.
2. **Tegnemodus og symboler:** ekte medlemsbindinger, double_outer_ring, capsules, justerbare offsets og eksplisitt gruppering/avgruppering.
3. **Live-/replay-preview:** koble slottene mot eksisterende tavleprofil og frame uten å endre kilde-/GPS-logikk. Vis feilårsak og delte LED-konflikter.
4. **Hardware-mapping og tavleskala:** arbeid med virkelig fysisk LED-profil eller 64×64-matrise når tavletypen er valgt.
5. **Aksepttest:** to Quay-er i samme dobbeltstasjon, hvor bare én Quay har aktivitet → bare riktig indre runding aktiveres.

**Grense for v0.3:** Dette dokumentet og JSON Schema er kun forslag. Ikke slå PR #323 sammen eller kall tavlepreview ferdig før de faktiske modellendringene er implementert og regresjons-/nettlesertester består.
