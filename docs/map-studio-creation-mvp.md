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

A stop may use **Felles stopp**, with width and rotation, to draw one capsule spanning several lanes. It remains one stop object with one unchanged binding record, not several invented Quays. This is a visual symbol; automatic association to parallel routes, per-lane stop snapping and data merging are not implemented. New lines receive no source binding. The filled-circle option offers a second simple symbol style.

The layer list is collapsed by default; no tools were added. Model and browser regressions cover dimension history/export, label rotation and side, Space pan during pen drafting and text entry, parallel spacing and selection, shared symbol, save/open/reload and original Trondheim counts.

## v0.10 · phase 1 (daily drawing)

Task: https://github.com/5mkbt4m7n8-hue/transitcore/pull/323#issuecomment-6600670090

Select one line, click either large endpoint, then **Fortsett linjen** in Properties. Click further vertices; Enter commits the entire extension to the same line, Esc cancels it. Backspace removes draft vertices but keeps the starting anchor. The line keeps its ID, name, color, width and bindings. Both ends support the existing 45° snap (including 90° turns). The draft preview uses the source style. No automatic endpoint merging occurs.

Ctrl-click (Cmd-click on macOS) in the canvas or layer list toggles objects in the selection. Selected objects have visible highlights. Two or more lines expose **Farger i bruk**, **Velg ny farge**, **Felles linjetykkelse** and collapsed **Felles avstand**. Each action is one history transaction. Felles avstand explicitly repositions selected lines along the first selected line's geometry in selection order, retaining separate identities/styles and bindings. It is an editable geometry operation, not a persistent linked route group. Locked selections cannot be batch edited or deleted. Dragging a multi-selection moves the whole unlocked selection together.

Delete removes selected unlocked objects in one transaction and cleans surviving stop line references. Ctrl+Z undoes; Ctrl+Y and Ctrl+Shift+Z redo. Esc cancels drafts or in-progress drags. Text inputs, textareas, selects, contenteditable and modified browser shortcuts retain native behavior. Selection and endpoint activation are transient UI state; they are not stored in project JSON or restored on reload. The editable geometry and logical references are persisted.

**Farger i bruk** is computed from the active project's line colors, including hidden layers. **Navneretning** provides horizontal, −45° (315°), +45°, 90°, horizontal right and horizontal left. Angle presets do not change the stop or its label anchor. Horizontal side presets change the side and preserve the offset magnitude; the arbitrary 0–360° field remains available. Default and presets do not introduce upside-down text.

Existing artboard resizing is reused: growth or valid reduction does not stretch artwork or move the camera. Drawing coordinates, physical cm formats and zoom remain independent. Existing regression coverage includes the 30×40, 50×70 and 40×40 physical profiles. No canonical Trondheim, GPS, Entur, Worker or hardware files are changed.

Phase 1 is the current testable delivery. Remaining phase 2: persistent lane groups with side/center controls and adjustable count/spacing after creation; explicit endpoint joining, shared visual alignment and grouping/ungrouping. Remaining phase 3: zoom-aware station drag snapping with ambiguity choice, logical shared-station route associations and additional symbols/independent LED points. The previous independent copies and visual capsule remain available, with their existing limits.

The imported browser regression module `scripts/browser-studio-phase-one.mjs` runs as part of `browser-map-studio.mjs` in CI. It exercises a blank map, extensions at both ends, cancellation and draft Backspace, 45°/90° geometry, Space during continuation, pointer-anchored zoom, multi-selection in canvas/layers, batch color/width/spacing/delete history, project swatches, label presets and arbitrary angle, native text Delete, SVG, JSON import/reload, artboard growth/reduction and rejected cropping. Model tests additionally verify atomic errors, locked selections and original bindings/identity.
