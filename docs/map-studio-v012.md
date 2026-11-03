# Map Studio v0.12

Draft PR #323. No merge or production deployment.

## Phase A: station style and endpoint direction

The last visually edited/placed stop supplies the next stop style. Only symbol, size/span/angle, name side/angle/offset and supported font properties are stored in the project's optional stationStyle. Names, identities, line references, anchors, LEDs and source bindings are never copied. Bruk utseendet som mal captures an explicitly selected stop; Bruk standardstasjon resets defaults for subsequent stops. Undo/project recovery retains the style preference, while blank/imported projects use their own defaults.

Endpoint dragging defaults to the existing segment's infinite direction, with positive segment length enforced. Shift uses 45-degree directions; Alt or Fri vinkel overrides the lock. A dashed guide previews the result. Completed endpoint edits preserve existing station cross-sections and source identities, and remain one undo transaction. The endpoint mode is editor state, not project metadata.

Model/Chromium tests cover five style-matched uniquely identified unbound stops, template/reset/recovery and endpoint direction/free/45-degree behavior, guide, history and camera stability.
