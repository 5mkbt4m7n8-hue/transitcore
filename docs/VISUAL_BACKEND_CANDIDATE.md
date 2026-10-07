# Optional visual backend candidate

Base: ced6f7cff9351965cac963ef1d464441576cd842 (same base as db06682).
Local only. No push, merge, deploy, device registration or flashing authorized.

No test profiles, firmware, UI, PixelFrame or transport algorithms are changed.
This candidate works independently of the Bus 1 profile-only candidate.

Optional BoardConfig render.visual and DeviceConfig visual support:

| Field | Legacy default | Provisional accepted range |
| --- | --- | --- |
| pulsePeriodMs | 1800 | integer 1000–5000 |
| pulseMinBrightness | 0 | integer 0–255 |
| pulseMaxBrightness | 255 | integer 0–255 |
| backgroundBrightness | 9 | integer 0–32 |

Precedence: legacy defaults → board defaults → device override.
Minimum must not exceed maximum, including after merging partial overrides.
Unknown fields, non-integers, invalid types and out-of-range values are rejected.
brightnessLimit remains separate and unchanged. No new client implementation
or firmware-side clamp is introduced by this backend-only candidate.

DeviceConfig responses include resolved visual settings only for clients sending
X-TransitCore-Visual-Version: 1. Legacy clients receive the existing projection.
Missing visual fields retain legacy defaults. The registry allowlist retains
visual settings when explicitly supplied; no existing device is provisioned.

Tests cover defaults, partial overrides, invalid values, API capability opt-in,
legacy projection, registry persistence and existing frame/transit regressions.
The Trondheim regression test is verification only, not a bus engine migration.

A Worker deployment is required for this code to take effect. The profile-only
candidate is needed only to address the new named Bus 1 bench, not for this
generic capability. Together the two candidates retain db06682 runtime files.

Cloudflare main deployments and non-production builds are enabled with include
paths *. Do not push either branch until deployment behavior is controlled.
No OTA, device identity or Gråkallbanen soak configuration is changed.

Local validation: all 35 test scripts passed, including 57 frozen frame
comparisons, 388 Trondheim comparisons and optional visual config tests.
No firmware compile/flash was performed; existing firmware guards passed.
