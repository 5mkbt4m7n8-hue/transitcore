# FB73 GPS availability investigation — 2026-10-21

## Result

**Live GPS for UNI:Line:FB73 was not observed. Do not activate a GPS staging profile on this evidence.**

GitHub main and the local checkout were confirmed at 173e5f9cd9822a4861dcb95be01151a9841035d5 before changes (merged PR #224).

Read-only POST requests used https://api.entur.io/realtime/v2/vehicles/graphql, Content-Type application/json and ET-Client-Name: transitcore-fb73-investigation. No Worker, device, secrets or bindings were accessed.

## Evidence

Full UNI sample at 2026-10-21T13:22:47.6554464Z (15:22:47 Europe/Oslo):
HTTP 200, no GraphQL errors, response:
```json
{"data":{"vehicles":[]}}
```

Query:
```graphql
{
  vehicles(codespaceId: "UNI") {
    vehicleId
    lastUpdated
    destinationName
    line { lineRef publicCode }
    serviceJourney { serviceJourneyId }
    location { latitude longitude }
  }
}
```

Repeat at 2026-10-21T13:23:03.9997064Z (15:23:03 Europe/Oslo), using the same fields except serviceJourney: HTTP 200, no errors, the same empty vehicles array. An earlier minimal UNI query also returned an empty array.

Control query: same full query with codespaceId ATB returned 721 vehicles and no GraphQL errors. One returned record was:
```json
{
  "vehicleId": "8752",
  "lastUpdated": "2026-10-21T13:03:48.747Z",
  "destinationName": "Hommelvik stasjon",
  "line": {"lineRef": "ATB:Line:2_205", "publicCode": "205"},
  "serviceJourney": {"serviceJourneyId": "ATB:ServiceJourney:205_251215112549864_7"},
  "location": {"latitude": 63.4114578, "longitude": 10.7948607}
}
```

The control confirms the query can return the requested fields; it does not prove freshness (this particular control record is old). Because the complete UNI list was empty, it contained zero exact UNI:Line:FB73 matches. There is no FB73 observation timestamp, vehicle ID, coordinate or destination to report, and no source age to calculate. These snapshots establish absence during this short observation window, **not permanent absence or absence throughout operating hours**.

## Existing fallback

config/routes/flybuss-trondheim-fb73-live.json uses estimated-station-calls from Journey Planner. The mobile scope note already says "Flybussen bruker estimerte ankomsttider." The existing board has 46 logical LEDs and the hardware profile has no provisioned GPIO. Neither the route mapping nor the existence of real-time ETA establishes vehicle GPS.

For Solsiden–Værnes, use the existing ETA view only as an estimated arrival comparison. It cannot validate physical bus position or stop proximity. Do not derive GPS coordinates from ETA or light a guessed GPS position.

## Realistic next steps

1. Repeat the query over a representative operating window, preferably during a known FB73 departure. Record request time and the raw response. Distinguish transport/GraphQL errors from a successful empty response.
2. If still empty, ask Entur/operator whether UNI FB73 vehicle monitoring is published and under which exact line/codespace. An operator-provided licensed vehicle feed is a realistic alternative. A passenger phone location would track the phone, require explicit consent and a separate source label, and must not be represented as Entur bus GPS.
3. Only after fresh exact-line observations exist, implement an isolated Flybuss GPS staging profile using the mature GPS Proximity engine. Validate all 46 directional LED assignments and Solsiden–Værnes quay matching, destination/direction ambiguity, observation age, invalid/future timestamps, duplicates, off-route points, missing samples and stale-data expiry. Missing or rejected GPS must produce no GPS position; any ETA fallback must remain explicitly labelled ETA.
4. Add an explicit mobile staging selection and source-age diagnostics after the data gate passes. Validate locally and in a PR. Any staging deployment needs explicit user approval of the concrete candidate. Production Worker/feed, ESP32, secrets and production bindings remain outside scope.

No GPS implementation or staging deployment is included in this evidence-only change.

Sources: [Entur Vehicle Positions](https://developer.entur.no/apis/graphql/vehicle-positions), [live API endpoint](https://api.entur.io/realtime/v2/vehicles/graphql). API evidence above was captured directly, not inferred from documentation.

## Validation

Passed locally with Node 24.19.0: test-linear-platform-coverage.mjs, test-entur-provider.mjs, test-linear-mobile-integration.mjs, test-stop-accuracy.mjs (22 checks). These are existing regression tests, not evidence of live FB73 GPS.
