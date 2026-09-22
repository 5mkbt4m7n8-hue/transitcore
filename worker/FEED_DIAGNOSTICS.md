# Feed timing

The board-frame pipeline has a 5.5-second total budget for configuration,
live data and motion state. JSON fetches have a 3.5-second deadline including
body reading, with AbortController cancellation. Monitor writes get at most
another 0.5 seconds and cannot turn a valid frame into an error.

Cloudflare events `feed_step_slow` (at least 1 second), `feed_step_failed`
and `feed_request_failed` include the stage and elapsed milliseconds.
Pipeline events include boardId and source (`request` or `scheduled`);
upstream JSON events include the provider hostname only. Credentials,
request bodies and query strings are not logged by these events.

A timed-out frame returns HTTP 503 with a stage. It does not renew the TTL
of old data or synthesize vehicle movement. Existing ESP expiry behavior
still applies during longer outages.

Scheduled checks call the same frame pipeline directly and save their result
to board monitoring. They do not fetch the Worker's own workers.dev address.

Deployment requires only the Worker update; ESP 1.2.13 does not need reflashing.
Check Cloudflare after deployment for remaining slow stages. The September 22
client cancellations identify missed response deadlines but do not establish
which upstream service was responsible; the new stage logs help locate it.
