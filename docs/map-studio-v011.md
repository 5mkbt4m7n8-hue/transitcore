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

## Step C: rectangle selection and rubber-band movement

With Velg active, drag from empty workspace to draw a rectangle. The orange frame selects unlocked vertices, connecting selected segments and enclosed stations. Linked parallel vertices are expanded to corresponding group points and visibly marked together; a locked member protects its linked group. When a rectangle crosses a straight portion without enclosing existing vertices, boundary references are selected transiently and become editable boundary vertices only when moved. Selection alone changes neither the document nor history.

Drag inside the frame, or enter Flytt vannrett / Flytt loddrett in Properties. Only selected vertices/stations move; connections to untouched vertices stretch. Preview is transient until pointer-up, and one completed move is one undo transaction. Escape discards the preview. The grid snaps the movement delta rather than independently snapping each point, preserving relative positions and allowing an exact 100-unit shift. Unselected station geometry and LED cross-sections are pinned in place with stable geometric references; selected stations and their graphic points translate together, without changing names, identity or source assignments. Camera changes only on explicit pan/zoom.

Parallel groups persist validated per-vertex offsets after deformation, so selected counterparts receive the identical delta while every unselected vertex stays exactly fixed. Later spacing changes scale these retained offsets; a no-op spacing edit changes nothing. Explicit count/side changes recalculate normal parallel offsets. The deformation remains editable and survives JSON/reload and SVG export. Subsequent extension still preserves exact station coordinates.

Delete removes selected connecting portions, never an entire route merely because one vertex was selected. A middle removal produces real separate paths and keeps stations in place. When no route portion is selected, Delete applies only to explicitly selected station objects. Undo restores removed artwork and references. Click/Ctrl-click continue to select/toggle independent whole objects, while orange point/frame selection clearly distinguishes partial editing from whole-object movement. Space temporarily pans and restores the selection tool. Native text input retains its shortcuts.

Model and real Chromium tests cover 100-unit deformation of three parallel routes and a selected shared station, exact unchanged vertices/unselected stations, geometry crossing a frame with no enclosed old vertex, preview/escape/no persistence, gaps from Delete, locks/bounds and invalid metadata, Space/pointer zoom, one undo/redo, post-deformation extension, no-op spacing, JSON/reload/SVG and source/camera preservation. The complete preceding Studio suite still runs. The preview remains on draft PR #323 with no merge or production deployment.
