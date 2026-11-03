# Map Studio v0.12

Draft PR #323. No merge or production deployment.

## Phase A: station style and endpoint direction

The last visually edited/placed stop supplies the next stop style. Only symbol, size/span/angle, name side/angle/offset and supported font properties are stored in the project's optional stationStyle. Names, identities, line references, anchors, LEDs and source bindings are never copied. Bruk utseendet som mal captures an explicitly selected stop; Bruk standardstasjon resets defaults for subsequent stops. Undo/project recovery retains the style preference, while blank/imported projects use their own defaults.

Endpoint dragging defaults to the existing segment's infinite direction, with positive segment length enforced. Shift uses 45-degree directions; Alt or Fri vinkel overrides the lock. A dashed guide previews the result. Completed endpoint edits preserve existing station cross-sections and source identities, and remain one undo transaction. The endpoint mode is editor state, not project metadata.

Model/Chromium tests cover five style-matched uniquely identified unbound stops, template/reset/recovery and endpoint direction/free/45-degree behavior, guide, history and camera stability.

## Phase B: shared-spine endpoint geometry

Dragging any member endpoint updates the authoritative group spine, then recomputes all offset paths. The locked direction is the spine direction, rather than an independently moved colored endpoint. Right/left/center configurations preserve normal spacing and mitered corners; collapsed short segments are rejected atomically with the preceding document intact. Free/45-degree overrides still regenerate the whole group. Existing stations retain their explicit cross-section coordinates, label/symbol fit, LED identities and source choices through trims and extensions.

Model tests repeat both-end trims from all three lanes for right/left/center placement and reject too-short segments. Chromium repeats the real handle drags, continuation, history, camera, JSON/reload and SVG checks with a shared source-linked LED station. Earlier editing suites remain enabled.
