# Map Studio v0.12

Draft PR #323. No merge or production deployment.

## Phase A: station style and endpoint direction

The last visually edited/placed stop supplies the next stop style. Only symbol, size/span/angle, name side/angle/offset and supported font properties are stored in the project's optional stationStyle. Names, identities, line references, anchors, LEDs and source bindings are never copied. Bruk utseendet som mal captures an explicitly selected stop; Bruk standardstasjon resets defaults for subsequent stops. Undo/project recovery retains the style preference, while blank/imported projects use their own defaults.

Endpoint dragging defaults to the existing segment's infinite direction, with positive segment length enforced. Shift uses 45-degree directions; Alt or Fri vinkel overrides the lock. A dashed guide previews the result. Completed endpoint edits preserve existing station cross-sections and source identities, and remain one undo transaction. The endpoint mode is editor state, not project metadata.

Model/Chromium tests cover five style-matched uniquely identified unbound stops, template/reset/recovery and endpoint direction/free/45-degree behavior, guide, history and camera stability.

## Phase B: shared-spine endpoint geometry

Dragging any member endpoint updates the authoritative group spine, then recomputes all offset paths. The locked direction is the spine direction, rather than an independently moved colored endpoint. Right/left/center configurations preserve normal spacing and mitered corners; collapsed short segments are rejected atomically with the preceding document intact. Free/45-degree overrides still regenerate the whole group. Existing stations retain their explicit cross-section coordinates, label/symbol fit, LED identities and source choices through trims and extensions.

Model tests repeat both-end trims from all three lanes for right/left/center placement and reject too-short segments. Chromium repeats the real handle drags, continuation, history, camera, JSON/reload and SVG checks with a shared source-linked LED station. Earlier editing suites remain enabled.

## Phase C: create routes from reusable geometry

Choose Opprett rute fra traséer in contextual Properties, enter name/color, then click a master segment. Choose direction explicitly. Subsequent clicks choose the next segment/branch in order; a click partway along the last segment ends the draft there. Enter commits once. Backspace/Fjern siste del goes back; Escape cancels without document/history/storage changes. If several master segments are equally plausible at a junction, the panel asks which one to use.

The route is a separate artwork line with ordered routeRefs (source trace ID, stable edge ID and geometric endpoint anchors), name/color/style and a validated derived point cache. Master lines acquire traceEdges, with stable identities over vertex insertion and endpoint continuation. A selected branch in the middle of a straight master inserts a collinear graph node without changing the drawn path; this makes later rectangle deformation stable instead of treating the junction as a percentage of the entire edge. Endpoint anchors reference a local segment/node, and geometric source-junction edits propagate to their explicitly connected counterparts without merging line identities. Existing source records are never copied to new routes.

Routes using an edge reserve consistent parallel lanes in creation order; Ruteavstand updates them together in a transient preview and commits one undo. Corners use safe miters or short bevels. Existing parallel group occupancy is respected, including when the old group is detached. Master geometry edits regenerate every referencing route; derived routes are edited through Rediger ruteforløp or their master geometry, rather than independently dragging cached vertices. Rectangle selection targets master vertices and stations; derived routes follow those references. Selected station motion is respected. Unselected attached stations now reproject locally from their previous drawing position when their supporting geometry changes; remote endpoint continuation preserves the unchanged local cross-section. LED/source identities remain intact.

Rediger ruteforløp supports adding/removing parts, undoing draft selections, changing order and editing the start/end percentage of the boundary parts. The finished route must be connected; an invalid order or missing intermediate link is shown and cannot overwrite the project. Changes are one history transaction. JSON retains stable graph/ref data and derives the same route geometry on reload. SVG contains separate colored paths, artwork IDs and escaped graphical-route/reference metadata, never a fabricated verified AtB identity.

### Prototype limits

- New routes inherit their corridor spacing until Ruteavstand is explicitly set project-wide. Lanes are ordered consistently on the master's configured side; manual per-edge lane ordering/side changes are not provided yet.
- Routes must form one connected sequence. To replace an interior branch, remove the affected tail in the draft and select the replacement path. Disconnected route fragments cannot be saved as one route.
- A master section currently in use cannot be deleted/extracted until referencing routes are revised or removed. This explicit guard avoids dangling references; unused master lines still support v0.11 extraction, gaps and rubber-band editing.
- Very short/sharp legacy parallel offsets are rejected instead of crossing. Unsafe route corner miters use bevels. This is schematic artwork, not geographic routing or hardware/LED-address publication.
- Names such as AtB 12 are purely graphic. Verification/Entur/GPS connection is a separate feature, not assigned automatically here.

Model and Chromium tests create two independently colored/identified routes with partial starts/ends and different branches over shared edges, change global route spacing, edit the referenced master/junction, revise/remove/re-add route parts, reject disconnected selections, preserve a shared LED station, undo/redo, save/reload and export SVG with metadata. Additional model checks cover source vertex insertion/prepending, stable graph nodes under area editing, legacy-group detach/copy behavior, guarded master deletion, malformed caches and unchanged source bindings. All previous Studio tests remain enabled.


## Follow-up: smart stations, line movement and branches (4 November 2026)

Attached stations use automatic symbol fitting by default, including when their appearance was inherited from the last station. A vertical bundle gets a horizontal capsule, a horizontal bundle gets a vertical capsule, and diagonal bundles use the local segment normal. Cross-section points are intersections with that local normal, avoiding a stale stored angle or an oblique nearest-point marker at a bend. Width follows the actual attached lanes and spacing. Manual width/angle edits disable fitting; the existing fit action is replaced by the contextual checkbox **Tilpass symbolet automatisk** to restore it. Free-standing template stations retain their specified visual dimensions.

For line/vertex/rectangle movement, unselected attached stations reproject from their old drawing position to the changed local segment and adjacent segments. Ties preserve the previous tangent/segment, avoiding a switch to an unrelated remote loop. Thus a vertical line shifted sideways and lengthwise moves its unselected station sideways while keeping its drawing height. Selected stations follow the full selection delta, including labels. Preview commit explicitly retains selected station IDs so releasing the pointer cannot reinterpret that movement. Repeated small deformations do not accumulate whole-route percentage drift. Changes elsewhere on the route preserve the unchanged local section. Existing deformed parallel vertex offsets also survive endpoint continuation, rather than silently regenerating earlier geometry.

New graphic route branches reserve an outer lane beyond the existing routes sharing their corridor. The same lane index continues through the chosen branch instead of collapsing to the first lane on an unoccupied branch edge. Corridor spacing is inherited; an explicit project-wide spacing overrides it. Lane indices persist through save/reload and deletion, so remaining routes do not shuffle inward. Old v0.12 routes retain their existing 14-unit spacing and per-edge lanes when edited alongside new branches. Source geometry/IDs/colors and Quay/LED bindings are never merged or copied.

The five requested scenarios run in **test-studio-smart-stations.mjs** and **browser-studio-smart-stations.mjs**: three local directions, live spacing, smart unselected movement, full selected movement (rectangle and ordinary line dragging), and a new branch outside the existing bundle. Tests also cover repeated deformation, manual override/restoration, preview commit, legacy lanes, identity/source preservation, one-step undo/redo, stable camera, JSON/reopen and SVG. Earlier tests expecting frozen off-line unselected stations now assert reattachment; exact invariance remains required for unaffected segments and endpoint extensions.

Manual bundle reordering is still outside this prototype. At sharp or topologically crossing branches, the schematic uses safe miters/bevels and does not optimize all network crossings automatically.


## Follow-up: branches behind existing lines

New drawn lines, graphical routes and parallel copies receive a persisted paintOrder below the existing line layers. This controls which color covers another at a crossing; route offsets and geometry are unchanged. New-line and route previews use the same back layer. Continuing an existing line or adding new trace parts to an existing route sends that line behind the other lines as part of the same undo transaction; its identity and geometry remain editable. The layer list and SVG export share the editor's order. Existing projects without paintOrder retain their original relative order, and editing existing route parts retains their layer unless a new trace part is added.

Model and Chromium tests reproduce a new branch crossing existing green lines with the source trace drawn in either direction. They assert preview/committed DOM order, the topmost browser hit path, and green pixels at the crossing in a rasterized SVG (orange away from the crossing). Pen drawing, route creation, one-step undo/redo, JSON/reopen, SVG and camera stability are covered.
