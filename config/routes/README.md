# TransitCore route profiles

`routes.json` is the route registry used by Multi-Line Lab. The web interface
loads every enabled profile in registry order, so adding a line does not
require editing the HTML application.

To add a route:

1. Create a profile JSON file in this directory.
2. Add its file name to `routes.json` with `"enabled": true`.
3. Run `node tools/validate-route-profiles.mjs` from the repository root.
4. Test the profile in Multi-Line Lab before merging it.

Profiles must identify the Entur codespace and line, define both directions,
and use authoritative stop and shape geometry. Hardware-backed profiles must
also preserve a contiguous VLED map. Never place Wi-Fi credentials, API keys,
tokens or other secrets in a route profile.

