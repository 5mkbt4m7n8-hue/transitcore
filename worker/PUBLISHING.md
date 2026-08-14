# Sikker GitHub-publisering

TransitCore kan opprette en draft-PR fra en godkjent prosjektpakke. GitHub-tokenet lagres kun som en kryptert Cloudflare Worker-hemmelighet og sendes aldri til nettleseren.

## Engangsoppsett

Opprett et begrenset GitHub-token for kun repositoryet `5mkbt4m7n8-hue/transitcore` med:

- Contents: Read and write
- Pull requests: Read and write
- Metadata: Read-only

Legg deretter inn disse Worker-hemmelighetene i Cloudflare:

- `GITHUB_PUBLISH_TOKEN`: det begrensede GitHub-tokenet
- `PUBLISH_ADMIN_TOKEN`: en separat, lang og tilfeldig administratornøkkel

Valgfri Worker-variabel:

- `GITHUB_REPOSITORY=5mkbt4m7n8-hue/transitcore`

Ikke legg noen av nøklene i Git, HTML, prosjektpakken eller `wrangler.toml`.

## Bruk

1. Åpne `web/publish/`.
2. Last inn prosjektpakken og vent til alle kontroller er grønne.
3. Skriv inn administratornøkkelen.
4. Velg **Opprett GitHub draft-PR**.
5. Kontroller PR-en manuelt før den eventuelt merges.

Worker kontrollerer profilene på nytt før den oppretter en branch. Endepunktet kan ikke merge PR-er eller skrive direkte til `main`.

## Tilbakekalling

Ved mistanke om lekkasje:

1. Tilbakekall GitHub-tokenet umiddelbart.
2. Bytt `PUBLISH_ADMIN_TOKEN`.
3. Kontroller nylig opprettede branches og PR-er.
