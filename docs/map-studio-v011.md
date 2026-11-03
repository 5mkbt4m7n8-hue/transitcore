# Map Studio v0.11

PR #323 remains draft. No merge or production deployment.

## Step A: stable stations and live spacing

Station anchors use a segment index and position on that segment, rather than a percentage of the entire route. Legacy percentage anchors still import; the first geometry edit resolves them against the original geometry before changing it. Extension preserves the exact station cross-section coordinates, symbol fit, label offsets, identities and LED/Quay references. Preserved cross-section references are stored explicitly so even changes in an offset endpoint miter cannot move an existing station. Later deliberate geometry/spacing edits rebase the anchor to the affected route geometry. JSON validates and retains both stable references and legacy anchors.

Traséavstand previews on input without a button. The preview is transient until Enter, blur or change finalizes it as one history transaction. Escape or an invalid completed value restores the previous document without a history entry. Camera, route order/style/IDs and station/source references are preserved. The existing apply button remains for combined count/placement changes.

Model and Chromium regressions cover exact station and LED coordinates through both-end extension of a three-route group, including an endpoint station; legacy files; undo/redo; immediate spacing preview before blur; one undo; invalid/Escape rollback; camera and source preservation. They run through the existing document and browser suites.

## Next steps, in order

B: explicit extraction/removal of a contiguous route portion, preserving real gaps and handling affected stations explicitly.
C: rectangle selection of vertices/stations and rubber-band movement with unchanged unselected vertices/stations.

## Step B: extract or remove a section

Select one line, then Velg strekning. Choose two projected points by clicking the line, or select Fra stopp / Til stopp using the existing artwork stop positions. The orange preview is transient. Skill ut strekning creates independent editable vector pieces; Fjern valgt strekning omits the selected path entirely. A middle cut creates two separate remaining polylines, never a bridging segment. The original artwork ID stays on the first remaining piece; new pieces have new unbound artwork IDs and a validated sectionOf descriptor (rootId, parentId, role). Names, colors and vertices remain independently editable. Existing source dictionaries are never copied to fabricate live routes.

Affected stops are listed before the operation. The user must choose to retain them in place and detach the selected route reference, or (for extraction) associate them to the extracted visual piece. Stop IDs, coordinates, labels and original Quay/StopPlace bindings remain intact. Surviving route portions retain/rebase their geometric station references without moving stations; LED identities and explicit sources are preserved. Cutting a grouped route explicitly detaches the group, preserving other members' geometry. Locked affected references are protected. A whole-line selection is rejected in favor of the normal whole-object Delete action.

Model and Chromium tests extract Ila–Kongens gate from the original visual trace incident to those stops in a Trondheim copy, without inferring an operational route from Entur bindings. The copy keeps all 100 stops and source records. Tests also remove a middle portion, inspect the real gap, edit the extracted color/vertices independently, undo/redo, save/reload JSON, export SVG and verify stable camera/source data.

Next: Step C, rectangle selection and rubber-band movement.
