# Bus 1 profile-only candidate

Base: ced6f7cff9351965cac963ef1d464441576cd842 (same base as db06682).
Local only. No push, merge, deploy, registration or flashing authorized.

Adds TEST / DEVELOPMENT ONLY board trondheim-bus-1-visual-test and
hardware trondheim-bus-1-visual-test-hardware. Eight directional stop LEDs,
GPIO14, brightness cap 32, existing atb-bus-1-live route and canonical pipeline.
No production catalogue, UI, Worker, firmware or frame schema change.

The optional render.visual defaults are declarative:
1800 ms pulse, minimum 0, maximum 255, background 9.
The existing backend can load this profile and generate PixelFrame v1 without
understanding these visual settings. Runtime delivery/validation of visual
settings requires the separate visual-backend candidate and its Worker deploy.

The mapping test runs against the unmodified backend with mocked upstream data.
It checks eight mappings, route exclusion, stale/empty data, approach states,
the generic HTTP frame route and exclusion from the default board catalogue.

Cloudflare is configured for main, include paths *, and non-production builds.
Even a profile-only push/merge can trigger a Worker build/deploy. This candidate
is functionally independent, NOT deployment-free. Control deployment before
publishing. GitHub raw/main makes profiles available independently of Pages;
the existing Worker reads them dynamically, subject to configuration caching.

Local validation: all 34 test scripts passed, including 57 frozen frame
comparisons and the profile-only generic HTTP test. No hardware flash/compile
was performed; fixture generation and existing firmware source guards passed.
