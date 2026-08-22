# transitcore

## Internasjonal prototype

- [NYC Subway linje 7](web/nyc/) bruker MTAs GTFS-Realtime-feed via Worker-endepunktet `/v1/international/nyc-subway-7`.
- Worker krever en kryptert secret med navnet `MTA_API_KEY`; nøkkelen sendes aldri til nettleseren.
- Prototypen er isolert fra eksisterende Entur-profiler og fysiske tavler.
