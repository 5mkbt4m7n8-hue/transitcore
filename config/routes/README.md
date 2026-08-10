# TransitCore route profiles

`routes.json` is the route registry used by Multi-Line Lab. The web interface
loads every enabled profile in registry order, so adding a line does not
require editing the HTML application.

To add a route:

1. Create a profile JSON file in this directory.
2. Add its file name to `routes.json` with `"enabled": true`.
3. Run `node tools/validate-route-profiles.mjs` from the repository root.
4. Test the profile in Multi-Line Lab before merging it.

For AtB lines, the generator can perform the first three steps automatically:

```text
python tools/generate-atb-route-profile.py --line 1 --date 2026-08-10 --register
node tools/validate-route-profiles.mjs
```

By default it downloads and caches Entur's current AtB GTFS dataset. Use
`--refresh` to replace the cache, or `--gtfs-dir PATH` / `--gtfs-zip PATH` for
an already downloaded dataset. Existing profile files are never overwritten
unless `--force` is supplied. The generator selects the longest active pattern
as the canonical route and records shorter contiguous patterns as supported
short turns.

Profiles must identify the Entur codespace and line, define both directions,
and use authoritative stop and shape geometry. Hardware-backed profiles must
also preserve a contiguous VLED map. Never place Wi-Fi credentials, API keys,
tokens or other secrets in a route profile.

