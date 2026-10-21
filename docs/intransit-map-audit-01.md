# InTransit Trondheim – kartrevisjon 01 (2026-10-21)

Status: **sju punkter bekreftet som faktiske holdeplasser av brukeren; navn og data-ID-er fortsatt uavklart**. Ingen ny bekreftet datakobling. Denne revisjonen endrer ikke
`web/linear/network/trondheim-layout.json`, sanntidsmapping, produksjonsfeed eller ESP32.

## Utgangspunkt

- `trondheim-layout.json`: 100 eksisterende kartmarkører, 68 med eksplisitte
  ID-koblinger og 32 uten kobling. 23 av de 32 mangler bekreftet navn.
- Alle koordinater er fra brukerens opprinnelige hvite tegning. Ikke utled
  holdeplass-ID-er fra nærhet, rutelinje eller kartnavn alene.
- De to Samfundet-markørene er allerede godkjent som ulike grupper med
  to Quay-ID-er hver; disse skal ikke slås sammen i denne revisjonen.
- 18 rutenett-polylinjer mangler verifisert rutetilhørighet.
- 1226 `feedStopsMissing`-oppføringer er ikke i seg selv 1226 feil:
  store katalog-/baseboard dekker mer enn de 100 synlige punktene. Vurder
  faktisk rutetilhørighet før de telles som hull i kartet.

## Gruppering av alle 32 åpne punkter

| Kartområde | ID-er (`original-...`) | Antall | Hva gjenstår |
|---|---|---:|---|
| Lade–Strindheim–Ranheim, uten navn | 003, 007, 008, 009, 010, 011, 013 | 7 | **Brukerbekreftede faktiske holdeplasser.** Navn og Quay-ID-er avklares senere; skal ikke gjettes |
| Indre østlige nett, navn avlest | 021 Briansmith, 025 Persaunet leir, 027 Clara Holst, 034 Tyholt, 035 Cecilie Thoresen | 5 | Avklare dagens/offisielle navn og eksakte stopp-ID-er. Behold originaltekst og geometri inntil avklaring |
| Midtre nett, navn avlest | 055 Magnus Barføtts vei | 1 | Entur-/katalog-ID ukjent |
| Heimdal–Tiller, uten navn | 076, 077, 079, 080, 084, 085, 086, 089, 090, 091, 093, 094, 097, 098, 099, 100 | 16 | Samme stopp-/geometriavklaring, så ID-verifikasjon ved faktisk stopp |
| Heimdal–Tiller, navn avlest | 078 Flatåsen, 081 Vollmyra, 092 Peder Dorset | 3 | Bekrefte eksakt stoppidentitet/navn og eventuell historisk eller intern navnevariant |
| **Totalt** | | **32** | **Ingen autorisert binding ennå** |

## Første detaljgjennomgang: 7 prikker nordøst på tegningen

Punktene er allerede tegnet som svarte sirkler uten stopptekst, og i gjeldende
layout som `Uavklart NNN` med `bindings: []`.

**Brukerbekreftelse 2026-10-21:** Alle disse sju prikkene er **faktiske bussholdeplasser**, ikke ruteknekkpunkter. Navngiving og nøyaktig Entur-/Quay-kobling utsettes til en senere kartrevisjon. Kartkoordinater og rutelinjer skal beholdes. Punktene skal ikke få simulert eller feilaktig live-status i mellomtiden.

| ID | SVG-x | SVG-y | Visuelt delområde | Tilstand |
|---|---:|---:|---|---|
| original-003 | 749.14 | 228.20 | sørøst for Lade gård, på østlig skråstrek | Bekreftet holdeplass; navn og Quay-ID mangler |
| original-007 | 773.72 | 252.66 | neste punkt på samme gren | Bekreftet holdeplass; navn og Quay-ID mangler |
| original-009 | 688.23 | 258.07 | sørvest for Lade gård, på vestlig skråstrek | Bekreftet holdeplass; navn og Quay-ID mangler |
| original-008 | 850.70 | 257.30 | kort før Ranheim, på Ranheim-grenen | Bekreftet holdeplass; navn og Quay-ID mangler |
| original-010 | 821.64 | 285.79 | mellom Skovgård/østlig gren og Ranheim | Bekreftet holdeplass; navn og Quay-ID mangler |
| original-011 | 641.85 | 304.83 | mellom vestlig gren og Rønningsbakken | Bekreftet holdeplass; navn og Quay-ID mangler |
| original-013 | 788.71 | 319.23 | nær Skovgård på Ranheim-grenen | Bekreftet holdeplass; navn og Quay-ID mangler |

**Beslutning dokumentert:** De sju svarte prikkene er ekte holdeplasser. Det gjenstår kun å navngi dem og bekrefte nøyaktig stopp-/Quay-ID per punkt. Dette kan gjøres senere. Fram til det skal `bindings: []` beholdes, og punktene skal vises uten live-status. Ikke endre dem til rene geometri-/knekkpunkter.

## Beskyttelse under redigering

1. Behold `bindings: []` for alle 32 frem til verifisert entydig stopp-/Quay-ID.
2. Ikke endre bekreftede 68 eller Samfundet-grupper.
3. De sju bekreftede holdeplassene i denne revisjonen skal bevares som
   holdeplasser (ikke konverteres til `path vertex`). For andre uavklarte
   punkter må rollen fortsatt verifiseres før en eventuell omklassifisering.
4. Test rutefilter, `OFF` på ubundne punkter, én/to retninger og
   om sanntidsskifte fortsetter på de godkjente markørene.
5. Behold PR #226 som **draft** til navn, ID-er, polylinjer og
   faktisk dekning er godkjent.

Neste område etter nordøst (kan fortsette uten å vente på de sju navnene): de fem navngitte men uverifiserte punktene
i indre østlige nett (021, 025, 027, 034, 035).
