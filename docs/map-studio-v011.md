# Map Studio v0.11

PR #323 remains draft. No merge or production deployment.

## Step A: stable stations and live spacing

Station anchors use a segment index and position on that segment, rather than a percentage of the entire route. Legacy percentage anchors still import; the first geometry edit resolves them against the original geometry before changing it. Extension preserves the exact station cross-section coordinates, symbol fit, label offsets, identities and LED/Quay references. Preserved cross-section references are stored explicitly so even changes in an offset endpoint miter cannot move an existing station. Later deliberate geometry/spacing edits rebase the anchor to the affected route geometry. JSON validates and retains both stable references and legacy anchors.

Traséavstand previews on input without a button. The preview is transient until Enter, blur or change finalizes it as one history transaction. Escape or an invalid completed value restores the previous document without a history entry. Camera, route order/style/IDs and station/source references are preserved. The existing apply button remains for combined count/placement changes.

Model and Chromium regressions cover exact station and LED coordinates through both-end extension of a three-route group, including an endpoint station; legacy files; undo/redo; immediate spacing preview before blur; one undo; invalid/Escape rollback; camera and source preservation. They run through the existing document and browser suites.

## Next steps, in order

B: explicit extraction/removal of a contiguous route portion, preserving real gaps and handling affected stations explicitly.
C: rectangle selection of vertices/stations and rubber-band movement with unchanged unselected vertices/stations.
