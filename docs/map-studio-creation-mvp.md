# Map Studio · focused creation MVP

Open `web/linear/studio.html` (also `index.html?view=studio`). The older physical board editor remains available at `index.html?view=designer`, including its format-specific layouts and physical SVG export.

## The workflow

Start with **Nytt kart**, or **Kopier Trondheim** to create an independent artwork document. Use **Ny linje** to click successive vertices; **Enter / Fullfør linjen** commits, **Esc / Avbryt** cancels, and Backspace removes the latest draft vertex. Name and color the line in **Egenskaper**. **Stopp** places a freely named stop, snapping to a nearby visible line. Select and drag a stop, its label, a line, or a line vertex. Double-click a selected line to insert a vertex.

**Hånd**, or holding Space, pans. Wheel zoom anchors to the pointer. Plus/minus zoom around the workspace center. **Tilpass kart** is the explicit fit action. Selecting artwork or a layer, editing, and undo/redo never fit or recenter the document. Layer controls toggle visibility and locking. Delete removes the selected unlocked object. Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z undo/redo. Drawing defaults to a 20-unit grid and 45-degree directions; each can be disabled.

Changes recover from local storage. **Lagre prosjekt** downloads an artwork JSON file, **Åpne** validates and opens it, and **SVG** exports a visual drawing. New Map and Copy Trondheim replace the current document only through an explicit dialog. Download projects to retain multiple maps. The new artwork format is deliberately distinct from the legacy GPS/layout project format; neither importer silently converts the other.

## Architecture and scope

`studio-document.js` owns a validated `intransit-artwork` v1 document, artwork lines/stops, independent source bindings, bounded history and escaped SVG export. `studio.js` owns tool state, draft geometry, selection and camera. The outer SVG and its camera persist through artwork redraws; history contains document edits only. Resizing the workspace preserves the camera scale and origin. A new/opened document fits explicitly.

The Trondheim template copies geometry and retains original stop binding records in a separate dictionary. New artwork needs no Entur identity. The studio does not fetch GPS, publish layouts, alter Workers/hardware, or write the canonical Trondheim file. Kildekobling is a collapsed, read-only source section. New bindings, verified routing, physical LED assignment, and geographic snapping are future work. This MVP does not claim that a newly drawn line has live route coverage. Physical board formats remain in the existing designer; there is no automatic artwork-to-hardware conversion yet.

## Regression evidence

`browser-map-studio.mjs` reproduces the old designer jump with `STUDIO_BASELINE=1`: a click at 300% changes scroll (120,300) to (0,26). The fix restores scroll after SVG replacement and caches the fitted base width independently of selection and scrollbar changes. The same test verifies click, drag and arrow-key viewport stability on the fixed code. It also creates a new line and named stop through the UI, pans/zooms, selects via artwork/layers, drags stops/vertices, checks undo/redo, downloads/reopens JSON, rejects an invalid document without losing work, reloads, and copies Trondheim. Model tests verify atomic invalid-edit rejection, history branching, SVG escaping and canonical/binding isolation. Both run in the existing no-deploy Linear CI workflow alongside the full editor and feed suites.

PR #323 stays draft. No production deployment or merge is part of this preview.

## Workspace enhancements (November 3)

Space is a temporary pan override: it preserves the selected object, previous tool, pen draft, zoom and document history. Inputs, textareas, selects and contenteditable retain their keyboard input. Key release/window blur clears the override.

Press Esc or click empty space, then expand **Tegneområde** in Properties. Enter width/height (100–10000 drawing units), optionally swap for portrait/landscape, then **Endre tegneområde**. Existing geometry stays in place and the camera stays stable; **Tilpass kart** shows the new bounds. Invalid sizes and shrinking across existing points are rejected atomically. SVG viewBox and JSON/local recovery use these dimensions. Physical cm sizes and canonical Trondheim are separate and unchanged.

Selected stops offer **Navneside**, **Navnevinkel (0–360°)**, and a draggable label anchor. Exact offsets live in a collapsed section. **Foreslå navneplassering** tries alternate sides/offsets using conservative rotated text boxes; it preserves locked labels and angles. It is a best-effort suggestion, not a guarantee for dense maps or all fonts.

Select a line and expand **Parallelle linjekopier**. Set the number of extra lines (1–8) and lane spacing in map units (2–200). Copies use polyline offset intersections, distinct colors and independent selectable layers. Sharp reversals/duplicate vertices or out-of-bounds copies are rejected. Copies remain independent after creation: changing spacing later or editing the source does not update existing copies. Linked lane groups and per-route live identity remain future work.

A stop may use **Felles stopp**, with width and rotation, to draw one capsule spanning several lanes. It remains one stop object with one unchanged binding record, not several invented Quays. Phase 3 below adds explicit route association, station snapping and separate LED references. New lines receive no source binding. The filled-circle option offers a second simple symbol style.

The layer list is collapsed by default; no tools were added. Model and browser regressions cover dimension history/export, label rotation and side, Space pan during pen drafting and text entry, parallel spacing and selection, shared symbol, save/open/reload and original Trondheim counts.

## v0.10 · phase 1 (daily drawing)

Task: https://github.com/5mkbt4m7n8-hue/transitcore/pull/323#issuecomment-6600670090

Select one line, click either large endpoint, then **Fortsett linjen** in Properties. Click further vertices; Enter commits the entire extension to the same line, Esc cancels it. Backspace removes draft vertices but keeps the starting anchor. The line keeps its ID, name, color, width and bindings. Both ends support the existing 45° snap (including 90° turns). The draft preview uses the source style. No automatic endpoint merging occurs.

Ctrl-click (Cmd-click on macOS) in the canvas or layer list toggles objects in the selection. Selected objects have visible highlights. Two or more lines expose **Farger i bruk**, **Velg ny farge**, **Felles linjetykkelse** and collapsed **Felles avstand**. Each action is one history transaction. Felles avstand explicitly repositions selected lines along the first selected line's geometry in selection order, retaining separate identities/styles and bindings. It is an editable geometry operation, not a persistent linked route group. Locked selections cannot be batch edited or deleted. Dragging a multi-selection moves the whole unlocked selection together.

Delete removes selected unlocked objects in one transaction and cleans surviving stop line references. Ctrl+Z undoes; Ctrl+Y and Ctrl+Shift+Z redo. Esc cancels drafts or in-progress drags. Text inputs, textareas, selects, contenteditable and modified browser shortcuts retain native behavior. Selection and endpoint activation are transient UI state; they are not stored in project JSON or restored on reload. The editable geometry and logical references are persisted.

**Farger i bruk** is computed from the active project's line colors, including hidden layers. **Navneretning** provides horizontal, −45° (315°), +45°, 90°, horizontal right and horizontal left. Angle presets do not change the stop or its label anchor. Horizontal side presets change the side and preserve the offset magnitude; the arbitrary 0–360° field remains available. Default and presets do not introduce upside-down text.

Existing artboard resizing is reused: growth or valid reduction does not stretch artwork or move the camera. Drawing coordinates, physical cm formats and zoom remain independent. Existing regression coverage includes the 30×40, 50×70 and 40×40 physical profiles. No canonical Trondheim, GPS, Entur, Worker or hardware files are changed.

Phase 1 remains covered by the existing regressions. Phases 2 and 3 are described below. The previous independent copies and visual capsule remain available.

The imported browser regression module `scripts/browser-studio-phase-one.mjs` runs as part of `browser-map-studio.mjs` in CI. It exercises a blank map, extensions at both ends, cancellation and draft Backspace, 45°/90° geometry, Space during continuation, pointer-anchored zoom, multi-selection in canvas/layers, batch color/width/spacing/delete history, project swatches, label presets and arbitrary angle, native text Delete, SVG, JSON import/reload, artboard growth/reduction and rejected cropping. Model tests additionally verify atomic errors, locked selections and original bindings/identity.

### Selection regression fix

Ctrl/Cmd-click only toggles selection membership, including with Shift held. It does not change the document or create an undo transaction; native modifier double-clicks cannot insert vertices. Overlapping route hit areas are resolved by distance to the actual route geometry. Exact shared-point ties follow paint order consistently; use the layer list to select a specific route where geometry coincides. Selection highlights render beneath all route strokes so neighboring route colors remain visible.

After selecting multiple routes, **Slå sammen**, **Bruk felles trasé** and **Grupper** are separately labeled actions. They are implemented in phase 2 as described below. The existing explicit **Bruk felles avstand** remains a one-time undoable geometry operation with independent identities; it is hidden for already linked routes.

`scripts/browser-studio-selection.mjs` runs in Chromium through the existing browser runner. It compares the full document and original SVG path attributes before/after Ctrl/Cmd/Shift selection, deselection and native double-click; tests overlapping hit areas and endpoint handles; checks an empty undo stack and preserved redo; and verifies explicit batch styling undo/redo. The overlapping-route case fails against preview commit `6c7cc61b291144b162b358d68418d3a1b823ddbf`.

## v0.10 · phase 2 (linked routes)

Select one independent line and expand **Koblede parallelle linjer**. **Opprett parallelle linjer** retains the original and creates separately colored routes along a common editable spine. Choose 2–9 total routes, spacing 2–200, and right/left/center. Right/left follow the first-to-last-point direction in drawing coordinates. On any member, **Koblet felles trasé** exposes total count, spacing and placement for later changes. Existing per-route name, color and thickness remain independent; multi-selection still supports batch styling. **Velg hele gruppen** selects members explicitly without editing or history.

Dragging a member translates its explicit group. Dragging a vertex, inserting a vertex or extending a member of a parallel/shared group reshapes the common spine and reflows every lane. Mitered offsets follow the same bends; reversals, collapsed/reversed short offset segments, invalid dimensions and out-of-bounds lanes are rejected atomically. Reduce spacing or simplify the bend in these cases. Individual style edits do not propagate. Locked members protect the entire group from geometry/count changes or detaching.

At multi-selection, choose one distinct operation:

- **Slå sammen** connects already meeting endpoints into one open continuous visual chain. It requires a connected, unbranched topology with no loops or ambiguous endpoint junctions. It does not invent a bridge or collapse the route objects: IDs, styles, source records and stop references stay separate. Moving a shared endpoint moves its counterpart. Extend only a free outer endpoint, or detach first.
- **Bruk felles trasé**, inside **Felles visuell trasé**, explicitly reshapes all selected routes along the first selected route's entire geometry, with chosen spacing and side/centering. It creates a persistent editable shared spine. It preserves each route's identity/style, all bindings and stop references. Unanchored stops stay in place; phase 3 anchors follow their referenced route geometry.
- **Grupper** stores a visual movement group without changing geometry. Drag a route to move the group, while point edits remain per-route. Groups contain routes; station grouping is not part of phase 2.

Each operation is one undo transaction. **Løsne linjene** removes the link from every member while preserving current geometry and identities. Undo restores the link; undoing the original operation restores the earlier shape. Routes belong to at most one group, so detach an existing group before combining it differently. Ctrl/Cmd-click always toggles individual selection membership even inside a group, including with Shift held; it never creates groups or changes geometry/history. Exact shared endpoints use stable paint-order ties under modifier selection; the layer list provides explicit per-route choice. Unmodified vertex handles have priority for point editing.

Increasing lane count creates new unbound artwork routes. Decreasing removes only trailing generated copies; original routes and copies with stop references or source bindings are protected. Explicit Delete removes only selected routes and detaches affected groups, leaving surviving route geometry unchanged; undo restores both. No Entur/Quay/GPS records are merged or synthesized.

The v1 document accepts optional `artwork.groups`. Parallel/shared groups persist ordered member IDs, a spine, spacing, placement and generated-copy IDs; visual groups persist member IDs; endpoint groups persist endpoint pairs. Import validates group membership, unique IDs, consistent derived geometry, valid references and continuous endpoint topology. Older v1 files without groups still open. JSON/local recovery retains editable group state; SVG exports the resulting separate colored vector paths. Selection and camera remain editor state.

`scripts/test-studio-phase-two.mjs` is imported by the existing document test. `scripts/browser-studio-phase-two.mjs` runs through the existing Chromium runner. They cover count/spacing/side through 45°/90° bends, editing an offset member, continuation and group translation, independent styling/selection, each explicit operation, invalid topology/locks/bounds, protected originals/references, detaching, undo/redo, JSON/import/reload, SVG, stable camera and source preservation. The phase 1 and selection-only regression suites continue to run. PR #323 remains draft; no merge or production deployment.

## v0.10 · phase 3 (stations on routes)

Drag a station near a visible route, or use **Stopp** to place a new station. Snapping projects the raw pointer position to the nearest geometric point on each candidate route, before grid snapping, with a **14 screen pixel** tolerance independent of zoom. Hidden routes are excluded. Locked routes remain eligible because attaching a station does not edit them; locked stations cannot move.

One candidate attaches directly. Two or more open **Velg hvor stoppet skal festes** in Properties, with visible candidate markers. No project, persistence or history change is made while this decision is pending. Choose **Fest til [linje]**, **Følg felles trasé** for an existing linked parallel/shared group, or check the desired routes and choose **Felles stasjon på valgte linjer**. The shared-route choice keeps the existing symbol; the shared-station choice defaults to a double symbol for two lines or a capsule for more. Linked group options may include other visible members beyond the pointer tolerance, clearly named in the explicit choice. Esc or **Avbryt plassering** cancels; a cancelled new station is never created. **Fest til linjer her** reopens the explicit choices at an existing station, including at higher zoom when only one lane is inside the tolerance.

**Plasser fritt** uses the grid, removes the positional anchor, and retains existing logical route/LED/source references. **Løsne fra linjene** explicitly clears active route membership and the anchor while preserving the stop, name, source binding and remembered LED/source assignments. Reattaching a remembered route reuses its LED identity. Numeric X/Y placement is free placement; dragging a multi-selection containing a station without its anchor route also frees that positional anchor. Label dragging remains independent and never snaps the station.

**Stoppsymbol** offers circle, filled circle/ring, **Dobbelt stopp**, capsule (**Felles stopp**) and **Felles LED-punkter**. Changing the symbol never drops names, line IDs, stop IDs, bindings, positional anchors or LED/source assignments. A shared station is one artwork stop with one name and several route references. It does not merge existing source stations or Quays. Width/rotation can be adjusted manually; **Tilpass symbolet til linjene** restores automatic fitting across the associated routes.

Anchors store a primary route and normalized distance along it. The station center is computed from the projected positions across its associated routes. Anchored stations follow route translations and geometry/spacing changes, retaining their route associations and LED IDs. A locked attached station blocks a route edit that would move or reshape that station. Unanchored original Trondheim stops are not moved. A shared-route anchor becomes a shared-station anchor when the route group is detached; its current geometry/references remain intact. All derived station geometry is validated on import. Each completed placement, symbol/source change or detachment is one undo transaction. Selection and pending choices remain transient.

The LED variant draws one separately identified point at each associated route, colored by that route. **Separate LED-punkter** offers an optional existing Quay source per point. Each assignment stores the source stop ID and one of that stop's existing Quay IDs; no identity, source binding or state is synthesized or combined. Sources are never assigned automatically. These are editable graphic LED placements and references: the studio does not fetch or display live GPS/LED state, change the real-time engine, publish hardware configuration or create physical LED addresses. Existing real Quay identities and states remain in their original system. Explicit deletion cleans references to removed artwork/source stops and remains undoable; copies with active or remembered station references are protected from lane-count reduction.

Older v1 files still open. Optional station `anchor`, `autoSymbol` and `leds` fields persist in JSON/local recovery. SVG uses the same symbol geometry as the canvas and exports separate LED IDs, route IDs and explicitly assigned Quay references, with one station label. Import rejects missing/duplicate routes or LED IDs, invalid progress, inconsistent anchor geometry and invented Quay references.

`scripts/test-studio-phase-three.mjs` runs through the document suite. `scripts/browser-studio-phase-three.mjs` runs through the existing Chromium runner. Coverage includes tolerance just inside/outside 14 pixels at several zooms, segment projection, hidden/locked layers, ambiguous drag and creation without undo/persistence, Escape from chooser controls, explicit single/shared-route/shared-station choices, one label, symbol switching with stable LED identities and distinct Quay assignments, route following, detachment/history, malformed imports, JSON/reload, matching SVG symbols and unchanged camera/source records. Phase 1–2 and the original selection regression continue to run. Trondheim remains 100 stops/18 original routes with untouched source bindings; PR #323 stays draft with no production deployment or merge.
