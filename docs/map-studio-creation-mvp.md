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
