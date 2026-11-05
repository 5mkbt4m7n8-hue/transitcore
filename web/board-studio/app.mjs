import { stationPorts, stationPort } from "./ports.mjs";
import {
  nearestPhysicalLed,
  snapStationPoint,
  movePoint,
} from "./station-snap.mjs";
import {
  deleteConnection,
  splitConnection,
  connectPorts,
  routeStyle,
} from "./connections.mjs";
import { trondheimPrototype } from "./prototype.mjs";
import {
  bindPoint,
  unbindPoint,
  prepareBindings,
  physicalChanges,
  mechanicalCheck,
  setFrontPoint,
} from "./bindings.mjs";
import {
  newProfile,
  newSegment,
  ledPositions,
  validateLedLayout,
  ledFor,
} from "./led-layout.mjs";
import {
  CATEGORIES,
  builtInSymbols,
  symbolBundle,
  importSymbolBundle,
  applyVisualStyle,
} from "./symbols.mjs";
import { stationTemplate, fromTemplate } from "./stations.mjs";
import {
  parallelCandidate,
  applyParallel,
  enforceParallels,
  translateRoute,
  segmentPoints,
} from "./parallel.mjs";
import { gridSpec, snapPoint } from "./editing.mjs";
import { geometryFixture } from "./fixtures.mjs";
import {
  holeCenters,
  symbolCenters,
  symbolNormal,
  edgeGeometry,
  geometryReport,
} from "./geometry.mjs";
import {
  createProject,
  parseProject,
  serialize,
  History,
  copy,
  LAYERS,
  esc,
  layerMarkup,
  stationMarkup,
  svg,
  moveStations,
  PAINT_ORDER,
} from "./model.mjs";
const $ = (id) => document.getElementById(id),
  canvas = $("canvas");
let initial = createProject();
try {
  const saved = localStorage.getItem("intransit-board-v1");
  if (saved) initial = parseProject(saved);
} catch {}
const history = new History(initial);
let selected = [],
  tool = "select",
  zoom = 1,
  origin = { x: 0, y: 0 },
  gesture = null,
  space = false,
  measure = null,
  routeStart = null,
  reconnectTarget = null,
  lineAdvanced = false,
  portHover = null,
  selectedRoute = null,
  pendingPhysical = null,
  bindTarget = null,
  bindingPoint = 0,
  bindingStation = null,
  bindingCursor = null,
  stopInterval = 1,
  selectedProfile = null,
  selectedSegment = null,
  pendingStrip = null,
  clipboard = null,
  pendingStation = null,
  routeMoveEnabled = false,
  selectedEdge = 0,
  smartGuides = [],
  ledSnap = null;
const project = () => history.value;
const message = (t) => ($("status").textContent = t);
function persist() {
  try {
    localStorage.setItem("intransit-board-v1", serialize(project()));
    message("Lagret lokalt · last ned JSON for sikker kopi");
  } catch {
    message("Lokal lagring utilgjengelig. Last ned JSON.");
  }
}
function commit(p, options = {}) {
  const candidate = parseProject(enforceParallels(copy(p))),
    q = options.load
      ? candidate
      : parseProject(prepareBindings(project(), candidate));
  const changes = options.load ? [] : physicalChanges(project(), q);
  if (changes.length && !options.approved) {
    pendingPhysical = { project: q, changes };
    const coord = (c) => (c ? `${c.x.toFixed(4)}, ${c.y.toFixed(4)} mm` : "—");
    $("physical-changes").innerHTML = changes
      .map(
        (c) =>
          `<tr><td>${esc(c.name)} · ${c.pointIndex + 1}</td><td>${coord(c.holeBefore)} → ${coord(c.holeAfter)}</td><td>${coord(c.ledBefore)} → ${coord(c.ledAfter)}</td></tr>`,
      )
      .join("");
    draw(q);
    $("physical-dialog").showModal();
    return;
  }
  history.commit(q);
  persist();
  render();
}
function mutate(fn) {
  const p = copy(project());
  fn(p);
  commit(p);
}
function xy(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left - origin.x) / zoom,
    y: (e.clientY - r.top - origin.y) / zoom,
  };
}
function snapped(pt, p = project(), anchor = null) {
  const result = snapPoint(p, pt, {
    enabled: $("snap").checked,
    gridEnabled: $("snap").checked,
    guidesEnabled: $("snap-guides").checked,
    gridStep: +$("grid-step").value,
    zoom,
    excludeIds: selected,
    anchor,
  });
  smartGuides = result.guides;
  return result.point;
}
function stationDrag(g, pt) {
  const s = g.base.layout.stations.find((s) => s.id === g.id),
    index = g.pointIndex ?? 0,
    delta = { x: pt.x - g.start.x, y: pt.y - g.start.y },
    origin = symbolCenters(g.base, s)[index],
    rawPoint = { x: origin.x + delta.x, y: origin.y + delta.y },
    target = nearestPhysicalLed(g.base, rawPoint, zoom, {
      enabled: $("snap-led").checked,
    });
  ledSnap = target;
  const constrained = g.base.ledLayout.bindings.some(
      (b) => b.stationId === s.id,
    ),
    anchor = snapped({ x: s.x + delta.x, y: s.y + delta.y }, g.base, {
      x: s.x,
      y: s.y,
    });
  let q;
  if (constrained && $("snap-led").checked) q = copy(g.base);
  else q = moveStations(g.base, selected, anchor.x - s.x, anchor.y - s.y);
  if (target)
    q = snapStationPoint(q, g.id, index, target, {
      bind: $("snap-led-bind").checked,
      share: g.share,
    });
  else if (constrained && $("snap-led").checked)
    q = movePoint(q, g.id, index, {
      x: origin.x + anchor.x - s.x,
      y: origin.y + anchor.y - s.y,
    });
  return enforceParallels(q);
}
function newStationIndicator(pt) {
  const p = project(),
    template =
      pendingStation?.template ?? p.stationTemplate ?? defaultTemplate(),
    s = fromTemplate(template, pt, "snap-preview"),
    index = Math.min(+$("snap-led-point").value, s.points - 1);
  ledSnap = nearestPhysicalLed(
    p,
    symbolCenters(
      { ...p, layout: { ...p.layout, stations: [s], routes: [] } },
      s,
    )[index],
    zoom,
    { enabled: $("snap-led").checked },
  );
}
function fit() {
  const r = canvas.getBoundingClientRect(),
    b = project().board;
  zoom = Math.min((r.width - 100) / b.width, (r.height - 80) / b.height);
  zoom = Math.max(0.05, zoom);
  origin = {
    x: (r.width - b.width * zoom) / 2,
    y: (r.height - b.height * zoom) / 2,
  };
  draw();
}
function zoomAt(
  factor,
  cx = canvas.clientWidth / 2,
  cy = canvas.clientHeight / 2,
) {
  const next = Math.max(0.05, Math.min(30, zoom * factor));
  origin = {
    x: cx - ((cx - origin.x) * next) / zoom,
    y: cy - ((cy - origin.y) * next) / zoom,
  };
  zoom = next;
  draw();
}
function draw(p = project()) {
  const b = p.board,
    w = canvas.clientWidth,
    h = canvas.clientHeight;
  canvas.setAttribute("viewBox", `0 0 ${w} ${h}`);
  const guides = p.layers.guides.visible,
    spec = gridSpec(
      +$("grid-step").value,
      +$("grid-major").value,
      $("grid-contrast").value,
      zoom,
    );
  const gridMarkup =
    $("grid").checked && guides
      ? `<defs>${[
          ["minor", spec.minor, spec.minorOpacity],
          ["major", spec.major, spec.majorOpacity],
        ]
          .map(
            ([kind, step, opacity]) =>
              `<pattern id="background-grid-${kind}" data-grid="${kind}" data-spacing="${step}" width="${step}" height="${step}" patternUnits="userSpaceOnUse"><path d="M ${step} 0 H 0 V ${step}" fill="none" stroke="#667e6b" stroke-width="${(kind === "major" ? 0.9 : 0.6) / zoom}" opacity="${opacity}"/></pattern>`,
          )
          .join(
            "",
          )}</defs><rect width="${b.width}" height="${b.height}" fill="url(#background-grid-minor)" pointer-events="none"/><rect width="${b.width}" height="${b.height}" fill="url(#background-grid-major)" pointer-events="none"/>`
      : "";
  const route = p.layout.routes.find((r) => r.id === selectedRoute);
  let controls = "";
  if (route && p.layers.routes.visible && !routeMoveEnabled) {
    selectedEdge = Math.min(selectedEdge, route.stationIds.length - 2);
    const g = edgeGeometry(p, route, selectedEdge);
    if (g.curves?.length) {
      const c = g.curves[0],
        last = g.curves.at(-1),
        bend =
          route.bends[selectedEdge] ??
          g.center[Math.floor(g.center.length / 2)];
      const shape = route.controls[selectedEdge]?.shape;
      controls = `<g class="selected-connection" pointer-events="none">${g.paths.map((path) => `<path d="${path.d}" fill="none" stroke="#3c9c74" stroke-opacity=".28" stroke-width="${5 / zoom}"/>`).join("")}</g><g class="curve-controls"><path d="${g.center.map((pt, i) => `${i ? "L" : "M"} ${pt.x} ${pt.y}`).join(" ")}" fill="none" stroke="${g.adjusted ? "#c28427" : "#537f91"}" stroke-width="${1 / zoom}" stroke-dasharray="${4 / zoom} ${3 / zoom}"/><path d="M ${c.start.x} ${c.start.y} L ${c.c1.x} ${c.c1.y} M ${last.end.x} ${last.end.y} L ${last.c2.x} ${last.c2.y}" stroke="#6896a1" stroke-width="${1 / zoom}"/>${shape ? `<path d="M ${c.c2.x} ${c.c2.y} L ${g.curves[1].c1.x} ${g.curves[1].c1.y}" stroke="#9664a5" stroke-width="${1 / zoom}"/>` : ""}${[
        ["start", c.c1],
        ["end", last.c2],
        ...(shape
          ? [
              ["form", shape],
              ["shape-tangent", g.curves[1].c1],
            ]
          : [["bend", bend]]),
      ]
        .map(
          ([kind, pt]) =>
            `<circle data-handle="${kind}" data-control-route="${esc(route.id)}" cx="${pt.x}" cy="${pt.y}" r="${5 / zoom}" fill="${kind === "bend" ? "#f9e2a3" : kind === "form" ? "#d8c2e7" : "white"}" stroke="#386b7a" stroke-width="${1.5 / zoom}"/>`,
        )
        .join(
          "",
        )}<text x="${bend.x + 6 / zoom}" y="${bend.y - 9 / zoom}" font-size="${10 / zoom}" fill="#446f7a">R min ${Number.isFinite(g.minRadius) ? g.minRadius.toFixed(1) : "∞"} mm · ${route.transitionLength} mm overgang</text></g>`;
    }
  }
  if (!lineAdvanced) controls = controls.split('<g class="curve-controls">')[0];
  const issues = geometryReport(p).filter((g) => !g.valid || g.adjusted);
  $("geometry-status").textContent = issues.length
    ? issues.map((g) => g.warnings.join(" ")).join(" ")
    : "";
  $("geometry-status").hidden = !issues.length;
  const marks = selected
    .map((id) => p.layout.stations.find((s) => s.id === id))
    .filter(Boolean)
    .map(
      (s) =>
        `<circle class="selected-mark" cx="${s.x}" cy="${s.y}" r="${s.ringOuter / 2 + 2}" fill="none" stroke="#4b9471" stroke-width="${1.2 / zoom}" stroke-dasharray="${3 / zoom} ${2 / zoom}"/>`,
    )
    .join("");
  let overlay = "";
  if (gesture?.kind === "box") {
    const a = gesture.start,
      c = gesture.last;
    overlay = `<rect x="${Math.min(a.x, c.x)}" y="${Math.min(a.y, c.y)}" width="${Math.abs(a.x - c.x)}" height="${Math.abs(a.y - c.y)}" fill="#629b7a22" stroke="#4b9471" stroke-width="${1 / zoom}"/>`;
  }
  if (ledSnap) {
    overlay += `<g id="led-snap-indicator" pointer-events="none" data-led-id="${esc(ledSnap.id)}" data-snap-index="${ledSnap.index}"><circle cx="${ledSnap.x}" cy="${ledSnap.y}" r="${8 / zoom}" fill="${ledSnap.occupied.length ? "#e8bd6733" : "#4baf9033"}" stroke="#287b67" stroke-width="${2 / zoom}"/><text x="${ledSnap.x + 11 / zoom}" y="${ledSnap.y - 9 / zoom}" font-size="${11 / zoom}" fill="#236e5d">${esc(ledSnap.segmentName)} · LED ${ledSnap.index} · ${$("snap-led-bind").checked ? "fest og bind" : "kun sentrering"}${ledSnap.occupied.length ? " · i bruk" : ""}</text></g>`;
  }
  if (measure) {
    const { a, b: c } = measure;
    overlay += `<path d="M ${a.x} ${a.y} L ${c.x} ${c.y}" stroke="#b8893b" fill="none" stroke-width="${1.5 / zoom}"/><text x="${(a.x + c.x) / 2}" y="${(a.y + c.y) / 2 - 3 / zoom}" font-size="${12 / zoom}" fill="#946419">${Math.hypot(a.x - c.x, a.y - c.y).toFixed(2)} mm</text>`;
  }
  if (gesture && p.layers.guides.visible)
    overlay += `<g class="smart-guides" pointer-events="none">${smartGuides.map((g) => (g.axis ? `<path data-smart-kind="${g.kind}" d="${g.axis === "x" ? `M ${g.value} 0 V ${b.height}` : `M 0 ${g.value} H ${b.width}`}" stroke="#168eac" stroke-width="${1.2 / zoom}" stroke-dasharray="${5 / zoom} ${3 / zoom}"/>` : `<g data-smart-kind="${g.kind}"><path d="M ${g.a.x} ${g.a.y} L ${g.b.x} ${g.b.y}" stroke="${g.kind === "distance" ? "#ab813a" : "#168eac"}" stroke-width="${1 / zoom}" stroke-dasharray="${4 / zoom} ${2 / zoom}"/><text x="${(g.a.x + g.b.x) / 2}" y="${(g.a.y + g.b.y) / 2 - 3 / zoom}" font-size="${10 / zoom}" fill="#16809b">${g.label}</text></g>`)).join("")}</g>`;
  // Rulers are screen UI; their values are derived from canonical millimetres.
  let rulers =
    '<rect width="100%" height="19" fill="#f6f8f3"/><rect width="23" height="100%" fill="#f6f8f3"/>';
  let tick = 10;
  while (tick * zoom < 45) tick *= 2;
  while (tick * zoom > 150) tick /= 2;
  const x0 = Math.max(0, Math.ceil(-origin.x / zoom / tick) * tick),
    y0 = Math.max(0, Math.ceil(-origin.y / zoom / tick) * tick);
  for (let x = x0; x <= Math.min(b.width, (w - origin.x) / zoom); x += tick) {
    const px = origin.x + x * zoom;
    rulers += `<path d="M ${px} 14 V 19" stroke="#a7b3a1"/><text x="${px + 3}" y="11" font-size="9" fill="#819078">${x}</text>`;
  }
  for (let y = y0; y <= Math.min(b.height, (h - origin.y) / zoom); y += tick) {
    const py = origin.y + y * zoom;
    rulers += `<path d="M 18 ${py} H 23" stroke="#a7b3a1"/><text x="3" y="${py - 3}" font-size="8" fill="#819078">${y}</text>`;
  }
  canvas.innerHTML = `<g transform="translate(${origin.x} ${origin.y}) scale(${zoom})"><rect x="2" y="3" width="${b.width}" height="${b.height}" fill="#243522" opacity=".09"/><rect width="${b.width}" height="${b.height}" fill="white"/>${gridMarkup}${PAINT_ORDER.filter(
    (id) => p.layers[id].visible,
  )
    .map((id) => `<g data-layer="${id}">${layerMarkup(p, id)}</g>`)
    .join(
      "",
    )}${marks}${overlay}${controls}${pendingStation?.point ? `<g class="placement-preview" pointer-events="none" opacity=".6">${["capsules", "rings", "names", ...(p.layers.holes.visible ? ["holes"] : [])].map((layer) => stationMarkup(fromTemplate(pendingStation.template, pendingStation.point, pendingStation.id), layer, p)).join("")}</g>` : ""}${portMarkup(p)}</g><g pointer-events="none">${rulers}</g>`;
  for (const routeLayer of canvas.querySelectorAll(
    "[data-layer=routes],[data-layer=capsules]",
  ))
    for (const path of [...routeLayer.querySelectorAll("[data-route]")]) {
      const hit = path.cloneNode();
      hit.setAttribute("stroke", "transparent");
      hit.setAttribute("stroke-width", 6 / zoom);
      hit.setAttribute("pointer-events", "stroke");
      routeLayer.append(hit);
    }
  $("hint").textContent =
    p.id === "trondheim-buss-fysisk-v03"
      ? "Fysisk demonstrasjon · ikke en verifisert ruteplan"
      : "Velg stasjon · Ctrl+klikk for flervalg · Space for panorering";
  $("zoom").textContent = `${Math.round(zoom * 100)}%`;
}
const field = (id, label, value, type = "number", attrs = "") =>
  `<label>${label}<input id="${id}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
function defaultTemplate() {
  const p = createProject(),
    t = stationTemplate(p, p.layout.stations[0]);
  t.appearance.symbolAngle = null;
  t.label.dx = 9;
  t.label.dy = 0;
  t.label.anchor = "start";
  t.holeOffsets = [{ x: 0, y: 0 }];
  return t;
}
function stationLocks() {
  return ["rings", "holes", "capsules", "names", "routes"].some(
    (id) => project().layers[id].locked,
  );
}
function startDuplicate() {
  const s = project().layout.stations.find((s) => s.id === selected[0]);
  if (!s) return;
  clipboard = stationTemplate(project(), s);
  beginPaste();
}
function beginPaste(template = clipboard) {
  pendingStrip = null;
  bindTarget = null;
  if (!template) return;
  if (stationLocks()) {
    message("Lås opp berørte lag før plassering");
    return;
  }
  pendingStation = {
    template: copy(template),
    point: null,
    id: crypto.randomUUID(),
  };
  selectedRoute = null;
  setTool("select");
  canvas.focus();
  message("Plasser kopien med et klikk · Escape avbryter");
  draw();
}
function previewParallel(q, g) {
  const candidate = parallelCandidate(
    q,
    g.routeId,
    g.edge,
    +$("parallel-distance").value,
    zoom,
  );
  if (candidate) {
    smartGuides.push(candidate.guide, {
      kind: "parallel-offset-line",
      a: candidate.line.a,
      b: candidate.line.b,
      label: "Beregnet parallellplassering",
    });
    if ($("snap-guides").checked) {
      applyParallel(q, candidate);
      if ($("parallel-lock").checked) {
        q.layout.parallelConstraints = (
          q.layout.parallelConstraints ?? []
        ).filter((c) => c.follower.routeId !== g.routeId);
        q.layout.parallelConstraints.push({
          id: candidate.id,
          reference: candidate.reference,
          follower: candidate.follower,
          distance: candidate.distance,
        });
      }
    }
  }
  enforceParallels(q);
  return q;
}
function properties() {
  const p = project(),
    s = p.layout.stations.find((s) => s.id === selected[0]),
    panel = $("properties");
  if (selectedRoute) {
    routeProperties();
    return;
  }
  if (tool === "route") {
    creationProperties();
    return;
  }
  if (s && bindingStation !== s.id) {
    bindingStation = s.id;
    bindingPoint = 0;
  }
  if (!s) {
    panel.innerHTML =
      '<h2>Egenskaper <span>02</span></h2><p class="note">Velg en stasjon på tavlen for presis plassering. S legger til en stasjon, L kobler stasjoner.</p><button id="reset-template">Standard enkeltstasjon</button>';
    $("reset-template").onclick = () =>
      mutate((q) => (q.stationTemplate = null));
    return;
  }
  panel.innerHTML = `<h2>${selected.length > 1 ? selected.length + " stasjoner" : "Stasjon"} <span>02</span></h2><div class="station-actions"><button id="duplicate-station">Dupliser stasjon</button><button id="set-template">Bruk som standardstasjon</button><button id="reset-template">Standard enkeltstasjon</button></div><label class="inline-toggle"><input id="station-snap-led" type="checkbox" ${$("snap-led").checked ? "checked" : ""}>Fest til LED</label><label>Aktivt stasjonspunkt<select id="station-snap-point">${Array.from({ length: s.points }, (_, i) => `<option value="${i}">Punkt ${String.fromCharCode(65 + i)}</option>`).join("")}</select></label>${field("station-name", "Navn", s.name, "text")}<div class="pair">${field("station-x", "X, mm", s.x, "number", 'step="0.1"')}${field("station-y", "Y, mm", s.y, "number", 'step="0.1"')}</div><div class="pair">${field("ring-outer", "Ytterring Ø, mm", s.ringOuter, "number", 'min="0.1" step="0.1"')}${field("ring-inner", "Innerring Ø, mm", s.ringInner, "number", 'min="0.1" step="0.1"')}</div><div class="pair">${field("hole-diameter", "Hull Ø, mm", s.holeDiameter, "number", 'min="0.1" step="0.1"')}${field("ring-stroke", "Ringstrek, mm", s.stroke, "number", 'min="0.01" step="0.01"')}</div><h2>Symbol og kapsel</h2><label>Kapseltype<select id="capsule-type"><option value="none">Ingen kapsel</option><option value="stadium">Avrundet kapsel</option><option value="rounded-box">Avrundet ramme</option></select></label><div class="pair">${field("capsule-width", "Ekstra bredde, mm", s.capsuleExtraWidth ?? 0)}${field("capsule-height", "Ekstra høyde, mm", s.capsuleExtraHeight ?? 0)}</div>${field("station-transition", "Egen overgang, mm (tom = trasé)", s.transitionLength ?? "", "number", 'min="0.1" max="100"')}<div class="pair">${field("symbol-points", "Antall punkter", s.points, "number", 'min="1" max="8" step="1"')}${field("symbol-spacing", "Punktavstand, mm", s.pointSpacing, "number", 'min="0.1" step="0.1"')}</div><div class="pair">${field("symbol-padding", "Kapselmarg, mm", s.capsulePadding, "number", 'min="0" step="0.1"')}${field("symbol-stroke", "Kapselstrek, mm", s.capsuleStroke, "number", 'min="0.01" step="0.01"')}</div><div class="pair">${field("symbol-angle", "Vinkel, ° (tom = auto)", s.symbolAngle ?? "", "number", 'min="-360" max="360"')}${field("symbol-bias", "Asymmetri (−0,5–0,5)", s.splitBias, "number", 'min="-0.5" max="0.5" step="0.1"')}</div><div class="pair"><label>Ringer<select id="symbol-double"><option value="true">Dobbel ring</option><option value="false">Enkel ring</option></select></label>${field("symbol-color", "Ringfarge", s.ringColor, "color")}</div><button id="align-holes">Tilpass hull til symbolet</button><p class="note">Grafisk rotasjon flytter ikke fysiske hull. Tilpass hull eksplisitt ved behov.</p><h2>Stasjonsnavn</h2><div class="pair">${field("label-dx", "Forskyvning X, mm", s.label.dx)}${field("label-dy", "Forskyvning Y, mm", s.label.dy)}</div><div class="pair">${field("label-angle", "Rotasjon, °", s.label.angle)}${field("label-size", "Tekststørrelse, mm", s.label.size, "number", 'step="0.1" min="0.1"')}</div><div class="pair">${field("label-spacing", "Bokstavavstand, mm", s.label.spacing, "number", 'step="0.1"')}<label>Justering<select id="label-anchor"><option value="start">Venstre</option><option value="middle">Midtstilt</option><option value="end">Høyre</option></select></label></div><label>Skrift<select id="label-font"><option>Arial</option><option>Verdana</option><option>Georgia</option><option>monospace</option></select></label><label>Skriftvekt<select id="label-weight"><option>400</option><option>600</option><option>700</option></select></label><p class="note">${selected.length > 1 ? "X/Y flytter utvalget. Ring-/kapselstil gjelder alle; navn og punktantall gjelder første." : "Navn og ring er uavhengige av hulldiameteren."}</p>`;
  $("station-snap-led").onchange = (e) => {
    $("snap-led").checked = e.target.checked;
    draw();
  };
  $("station-snap-point").value = bindingPoint;
  $("station-snap-point").onchange = (e) => {
    bindingPoint = +e.target.value;
    renderBindings(p, s);
  };
  $("duplicate-station").onclick = startDuplicate;
  $("set-template").onclick = () =>
    mutate((q) => (q.stationTemplate = stationTemplate(q, s)));
  $("reset-template").onclick = () => mutate((q) => (q.stationTemplate = null));
  const physical = holeCenters(p, s),
    graphic = symbolCenters(p, s),
    mismatch =
      physical.length !== graphic.length ||
      physical.some(
        (h, i) =>
          !graphic[i] ||
          Math.hypot(h.x - graphic[i].x, h.y - graphic[i].y) > 0.01,
      );
  if (mismatch)
    panel.insertAdjacentHTML(
      "afterbegin",
      '<p class="warning">Grafikk og hull er forskjøvet. Hullsentrene er beholdt.</p>',
    );
  $("align-holes").disabled = p.layers.holes.locked;
  $("align-holes").onclick = () =>
    mutate((q) => {
      const target = q.layout.stations.find((t) => t.id === s.id);
      target.holes = symbolCenters(q, target).map((c, i) => ({
        ...target.holes[i],
        id: target.holes[i]?.id ?? `${target.id}:hole:${i}`,
        x: c.x,
        y: c.y,
      }));
    });
  for (const [id, key] of [
    ["capsule-type", "capsuleType"],
    ["capsule-width", "capsuleExtraWidth"],
    ["capsule-height", "capsuleExtraHeight"],
  ]) {
    $(id).value = s[key] ?? 0;
    $(id).disabled = p.layers.capsules.locked;
    $(id).onchange = (e) =>
      safe(() =>
        commit(
          applyVisualStyle(p, selected, {
            [key]: key === "capsuleType" ? e.target.value : +e.target.value,
          }),
        ),
      );
  }
  const symbolFields = {
    "symbol-points": "points",
    "symbol-spacing": "pointSpacing",
    "symbol-padding": "capsulePadding",
    "symbol-stroke": "capsuleStroke",
    "symbol-angle": "symbolAngle",
    "symbol-bias": "splitBias",
    "symbol-color": "ringColor",
    "symbol-double": "doubleRing",
  };
  $("symbol-double").value = String(s.doubleRing);
  for (const [id, key] of Object.entries(symbolFields)) {
    $(id).disabled = ["capsules", "rings", "holes", "routes"].some(
      (l) => p.layers[l].locked,
    );
    $(id).onchange = (e) =>
      safe(() =>
        mutate(
          (q) =>
            (q.layout.stations.find((t) => t.id === s.id)[key] =
              key === "symbolAngle" && e.target.value === ""
                ? null
                : key === "ringColor"
                  ? e.target.value
                  : key === "doubleRing"
                    ? e.target.value === "true"
                    : +e.target.value),
        ),
      );
  }
  for (const [id, key] of [
    ["symbol-color", "ringColor"],
    ["symbol-double", "doubleRing"],
    ["symbol-padding", "capsulePadding"],
    ["symbol-stroke", "capsuleStroke"],
  ])
    $(id).onchange = (e) =>
      safe(() =>
        commit(
          applyVisualStyle(p, selected, {
            [key]:
              key === "ringColor"
                ? e.target.value
                : key === "doubleRing"
                  ? e.target.value === "true"
                  : +e.target.value,
          }),
        ),
      );
  if (p.ledLayout.bindings.some((b) => b.stationId === s.id))
    for (const id of [
      "symbol-points",
      "symbol-spacing",
      "symbol-angle",
      "symbol-bias",
    ])
      $(id).disabled = true;
  $("station-transition").onchange = (e) =>
    safe(() =>
      mutate(
        (q) =>
          (q.layout.stations.find((t) => t.id === s.id).transitionLength =
            e.target.value === "" ? null : +e.target.value),
      ),
    );
  const angleHandler = $("symbol-angle").onchange;
  $("symbol-angle").onchange = (e) => {
    if (!s.ringCenters) {
      angleHandler(e);
      return;
    }
    safe(() =>
      mutate((q) => {
        if (e.target.value === "") {
          const st = q.layout.stations.find((t) => t.id === s.id);
          st.symbolAngle = null;
          delete st.ringCenters;
          return;
        }
        const st = q.layout.stations.find((t) => t.id === s.id),
          old = Math.atan2(symbolNormal(q, st).y, symbolNormal(q, st).x),
          angle = e.target.value === "" ? 0 : (+e.target.value * Math.PI) / 180,
          delta = angle - old;
        st.ringCenters = st.ringCenters.map((c) => ({
          x:
            st.x +
            (c.x - st.x) * Math.cos(delta) -
            (c.y - st.y) * Math.sin(delta),
          y:
            st.y +
            (c.x - st.x) * Math.sin(delta) +
            (c.y - st.y) * Math.cos(delta),
        }));
        st.symbolAngle = e.target.value === "" ? null : +e.target.value;
      }),
    );
  };
  const mappings = {
    "station-name": ["name", "names", true],
    "ring-outer": ["ringOuter", "rings"],
    "ring-inner": ["ringInner", "rings"],
    "hole-diameter": ["holeDiameter", "holes"],
    "ring-stroke": ["stroke", "rings"],
  };
  for (const [id, [key, layer, text]] of Object.entries(mappings)) {
    $(id).disabled = p.layers[layer].locked;
    $(id).onchange = (e) =>
      safe(() => {
        const value = text ? e.target.value : +e.target.value;
        if (["ringOuter", "ringInner", "stroke"].includes(key))
          commit(applyVisualStyle(p, selected, { [key]: value }));
        else
          mutate(
            (q) => (q.layout.stations.find((t) => t.id === s.id)[key] = value),
          );
      });
  }
  for (const axis of ["x", "y"]) {
    $("station-" + axis).disabled =
      p.layers.rings.locked ||
      p.layers.holes.locked ||
      p.layers.capsules.locked ||
      p.layers.routes.locked ||
      p.layers.names.locked;
    $("station-" + axis).onchange = (e) =>
      safe(() => {
        const delta = +e.target.value - s[axis];
        commit(
          moveStations(
            p,
            selected,
            axis === "x" ? delta : 0,
            axis === "y" ? delta : 0,
          ),
        );
      });
  }
  for (const key of [
    "dx",
    "dy",
    "angle",
    "size",
    "spacing",
    "anchor",
    "font",
    "weight",
  ]) {
    $("label-" + key).value = s.label[key];
    $("label-" + key).disabled = p.layers.names.locked;
    $("label-" + key).onchange = (e) =>
      safe(() =>
        mutate(
          (q) =>
            (q.layout.stations.find((t) => t.id === s.id).label[key] = [
              "anchor",
              "font",
            ].includes(key)
              ? e.target.value
              : +e.target.value),
        ),
      );
  }
  renderBindings(p, s);
}
function deleteSelectedConnection() {
  if (!selectedRoute) return;
  safe(() => {
    const next = deleteConnection(project(), selectedRoute, selectedEdge);
    selectedRoute = null;
    selectedEdge = 0;
    commit(next);
    message(
      "Valgt grafisk forbindelse slettet. Stasjoner og LED-bindinger beholdt.",
    );
  });
}
function creationProperties() {
  const d = routeStyle(project().routeDefaults ?? {}),
    panel = $("properties");
  panel.innerHTML = `<h2>Tegn forbindelse</h2><p class="note">Velg et konkret startpunkt og sluttpunkt. Runde punkter gjelder én ring; firkantede punkter gjelder ringparet. Pekeren viser hvilken ring og side du velger.</p><label>Grafisk sporantall<select id="new-route-tracks"><option value="1">Enkeltspor</option><option value="2">Dobbeltspor</option></select></label>${field("new-route-spacing", "Sporavstand, mm", d.trackSpacing)}<label>Kurvestil<select id="new-route-curve"><option value="rounded">Avrundet</option><option value="straight">Rett</option></select></label><p id="port-selection" class="note">${routeStart ? `Start: ${esc(project().layout.stations.find((s) => s.id === routeStart.stationId)?.name)} · ${esc(stationPort(project(), routeStart.stationId, routeStart.portId)?.label)}. Velg sluttport.` : "Velg startport."}</p><button id="cancel-connection">Avbryt portvalg</button>`;
  $("new-route-tracks").value = d.tracks;
  $("new-route-curve").value = d.curveStyle;
  for (const [id, key] of [
    ["new-route-tracks", "tracks"],
    ["new-route-spacing", "trackSpacing"],
    ["new-route-curve", "curveStyle"],
  ])
    $(id).onchange = (e) =>
      safe(() =>
        mutate(
          (q) =>
            (q.routeDefaults = {
              ...routeStyle(q.routeDefaults ?? {}),
              [key]: key === "curveStyle" ? e.target.value : +e.target.value,
            }),
        ),
      );
  $("cancel-connection").onclick = () => {
    routeStart = null;
    reconnectTarget = null;
    render();
  };
}
function choosePort(stationId, portId) {
  safe(() => {
    if (project().layers.routes.locked || project().layers.capsules.locked)
      throw Error("Trasélaget er låst.");
    if (!stationPort(project(), stationId, portId))
      throw Error("Porten finnes ikke.");
    if (tool !== "route") {
      selected = [];
      selectedRoute = null;
      setTool("route");
    }
    const ref = { stationId, portId };
    if (!routeStart) {
      if (reconnectTarget) {
        const r = project().layout.routes.find(
          (r) => r.id === reconnectTarget.routeId,
        );
        if (stationId !== r.stationIds[reconnectTarget.edge])
          throw Error("Velg først startstasjonens port.");
      }
      selectedRoute = null;
      routeStart = ref;
      properties();
      draw();
      message("Startport valgt. Velg sluttport på en annen stasjon.");
      return;
    }
    const result = connectPorts(project(), routeStart, ref, reconnectTarget),
      r = result.project.layout.routes.find((r) => r.id === result.routeId),
      edge = reconnectTarget?.edge ?? 0,
      g = edgeGeometry(result.project, r, edge);
    if (!g.valid) throw Error(g.warnings.join(" "));
    selectedRoute = result.routeId;
    selectedEdge = edge;
    routeStart = null;
    reconnectTarget = null;
    portHover = null;
    selected = [];
    commit(result.project);
    message(
      "Forbindelsen bruker valgte porter. Velg ny startport for neste forbindelse.",
    );
  });
}
function portMarkup(p) {
  if (!(tool === "route" || selectedRoute) || !p.layers.rings.visible)
    return "";
  const selectedConnection = p.layout.routes.find(
      (r) => r.id === selectedRoute,
    ),
    endpoints = selectedConnection?.stationIds.slice(
      selectedEdge,
      selectedEdge + 2,
    ),
    anchors = selectedConnection?.anchors?.[selectedEdge];
  return `<g class="station-ports">${p.layout.stations
    .filter((s) => tool === "route" || endpoints?.includes(s.id))
    .flatMap((s) =>
      stationPorts(p, s).map((port) => {
        const start =
            (routeStart?.stationId === s.id && routeStart.portId === port.id) ||
            (endpoints?.[0] === s.id && anchors?.start === port.id),
          end = endpoints?.[1] === s.id && anchors?.end === port.id,
          hover = portHover === s.id + "|" + port.id,
          active = start || end || hover,
          radius = (port.width ? 5.5 : 4) / zoom,
          tag = port.width ? "rect" : "circle",
          coords = port.width
            ? `x="${port.marker.x - radius}" y="${port.marker.y - radius}" width="${radius * 2}" height="${radius * 2}" rx="${2 / zoom}"`
            : `cx="${port.marker.x}" cy="${port.marker.y}" r="${radius}"`;
        return `<g><path pointer-events="none" d="M ${port.point.x} ${port.point.y} L ${port.marker.x} ${port.marker.y}" stroke="#3b856b" stroke-width="${1 / zoom}"/><${tag} class="station-port" role="button" tabindex="0" aria-label="${esc(s.name + " · " + port.label)}" data-port-station="${esc(s.id)}" data-port="${port.id}" data-port-state="${start ? "start" : end ? "end" : hover ? "hover" : "idle"}" ${coords} fill="${start ? "#277852" : end ? "#d49a36" : hover ? "#a1ddbd" : "#fff"}" stroke="#28734f" stroke-width="${(active ? 2.5 : 1.2) / zoom}"><title>${esc(s.name + " · " + port.label)}</title></${tag}>${active ? `<text pointer-events="none" x="${port.marker.x + 8 / zoom}" y="${port.marker.y - 9 / zoom}" font-size="${11 / zoom}" fill="#1c623f">${start ? "Start: " : end ? "Slutt: " : ""}${esc(s.name + " · " + port.label)}</text>` : ""}</g>`;
      }),
    )
    .join("")}</g>`;
}
function routeProperties() {
  const p = project(),
    r = p.layout.routes.find((r) => r.id === selectedRoute);
  if (!r) {
    selectedRoute = null;
    return properties();
  }
  const parallelBinding = p.layout.parallelConstraints.find(
    (c) => c.follower.routeId === r.id,
  );
  const warnings = Array.from(
    { length: r.stationIds.length - 1 },
    (_, i) => edgeGeometry(p, r, i).warnings,
  ).flat();
  const panel = $("properties");
  panel.innerHTML = `<h2>Trasé <span>02</span></h2><label>Grafisk rute for valgt forbindelse<select id="route-object"></select></label>${warnings.length ? `<p class="warning">${esc([...new Set(warnings)].join(". "))}</p>` : ""}${parallelBinding ? `<p class="note">Låst parallellavstand: ${Math.abs(parallelBinding.distance).toFixed(2)} mm. Bruk «Frigi parallellavstand» for fri flytting.</p>` : ""}<div class="station-actions"><button id="move-route" aria-pressed="${routeMoveEnabled}">Flytt trasé</button><button id="free-shape">Fri kurveform</button><button id="reset-shape">Automatisk kurveform</button><button id="parallel-release">Frigi parallellavstand</button></div><label>Grafisk sporantall<select id="route-tracks"><option value="1">Enkeltspor</option><option value="2">Dobbeltspor</option></select></label><div class="pair">${field("route-spacing", "Sporavstand, mm", r.trackSpacing)}${field("route-stroke", "Linjebredde, mm", r.stroke, "number", 'step="0.01"')}</div><div class="pair">${field("route-length", "Overgangslengde, mm", r.transitionLength)}${field("route-tension", "Kurveform (0,05–0,95)", r.tension, "number", 'step="0.05"')}</div><label>Delstrekning<select id="route-edge">${r.stationIds
    .slice(0, -1)
    .map(
      (id, i) =>
        `<option value="${i}">${esc(p.layout.stations.find((s) => s.id === id).name)} → ${esc(p.layout.stations.find((s) => s.id === r.stationIds[i + 1]).name)}</option>`,
    )
    .join(
      "",
    )}</select></label><div class="pair">${field("bend-x", "Knekkpunkt X, mm", "")}${field("bend-y", "Knekkpunkt Y, mm", "")}</div><div class="pair">${field("route-radius", "Min. kurveradius, mm", r.cornerRadius)}<button id="bend-save">Sett knekkpunkt</button></div><div class="pair">${field("control-start", "Starthåndtak, mm", r.controls[selectedEdge]?.startReach ?? edgeGeometry(p, r, selectedEdge).effectiveReach?.start ?? 12)}${field("control-end", "Slutthåndtak, mm", r.controls[selectedEdge]?.endReach ?? edgeGeometry(p, r, selectedEdge).effectiveReach?.end ?? 12)}</div>${field("route-grow", "Tillatt automatisk utvidelse, mm", r.autoGrow, "number", 'min="0" max="48"')}<button id="bend-clear">Rett delstrekning</button><button id="edge-track">Skill ut delstrekning</button><button id="edge-delete">Slett valgt strekning</button><p class="note">Nye forbindelser arver siste valgte sporoppsett. Andre eksisterende forbindelser endres ikke.</p><p class="note">Velg en trasélinje på tavlen. Stasjonssymboler har eget punktantall. Radius gjelder knekkpunktet, med geometrisk parallelle spor. For kort strekning begrenser radiusen.</p>`;
  const title = panel.querySelector("h2"),
    warningsUI = [...panel.querySelectorAll(".warning")],
    routeChoice = $("route-object").closest("label"),
    tracks = $("route-tracks").closest("label"),
    spacing = $("route-spacing").closest("label"),
    edge = $("route-edge").closest("label"),
    split = $("edge-track"),
    remove = $("edge-delete");
  for (const el of [
    title,
    ...warningsUI,
    routeChoice,
    tracks,
    spacing,
    edge,
    split,
    remove,
  ])
    el.remove();
  const advanced = document.createElement("details");
  advanced.id = "line-advanced";
  advanced.innerHTML = "<summary>Avanserte linjeinnstillinger</summary>";
  advanced.append(...panel.childNodes);
  advanced.open = lineAdvanced;
  advanced.ontoggle = () => {
    if (!advanced.isConnected) return;
    lineAdvanced = advanced.open;
    draw();
  };
  const curve = document.createElement("label");
  curve.innerHTML =
    'Kurvestil<select id="route-curve"><option value="rounded">Avrundet</option><option value="straight">Rett</option></select>';
  const ports = document.createElement("p");
  ports.className = "note";
  ports.id = "connection-ports";
  const anchors = r.anchors?.[selectedEdge];
  ports.textContent = anchors
    ? `Start: ${stationPort(p, r.stationIds[selectedEdge], anchors.start)?.label} → slutt: ${stationPort(p, r.stationIds[selectedEdge + 1], anchors.end)?.label}`
    : "Eksisterende forbindelse med opprinnelig automatisk tilkobling. Velg porter for å endre den.";
  const reconnect = document.createElement("button");
  reconnect.id = "reconnect-ports";
  reconnect.textContent = "Velg nye koblingspunkter";
  reconnect.onclick = () => {
    const target = { routeId: r.id, edge: selectedEdge };
    selectedRoute = null;
    selected = [];
    setTool("route");
    reconnectTarget = target;
    render();
    message("Velg startport og sluttport på forbindelsens to stasjoner.");
  };
  panel.replaceChildren(
    title,
    ...warningsUI,
    routeChoice,
    tracks,
    spacing,
    curve,
    edge,
    ports,
    reconnect,
    split,
    remove,
    advanced,
  );
  $("route-curve").value = r.curveStyle ?? "rounded";
  $("route-curve").disabled =
    p.layers.routes.locked || p.layers.capsules.locked;
  $("route-curve").onchange = (e) =>
    mutate((q) => {
      const target = q.layout.routes.find((t) => t.id === r.id);
      target.curveStyle = e.target.value;
      q.routeDefaults = routeStyle(target);
    });
  $("move-route").onclick = () => {
    routeMoveEnabled = !routeMoveEnabled;
    $("move-route").setAttribute("aria-pressed", routeMoveEnabled);
    canvas.focus();
    message(
      "Dra den markerte traséen. Parallellsnapping følger avstanden i verktøylinjen.",
    );
    draw();
  };
  $("free-shape").onclick = () => {
    if (p.layers.routes.locked || p.layers.capsules.locked) return;
    const g = edgeGeometry(p, r, selectedEdge),
      mid = g.center[Math.floor(g.center.length / 2)];
    mutate(
      (q) =>
        (q.layout.routes.find((t) => t.id === r.id).controls[selectedEdge] = {
          ...r.controls[selectedEdge],
          startReach: g.effectiveReach.start,
          endReach: g.effectiveReach.end,
          shape: { x: mid.x, y: mid.y },
        }),
    );
  };
  $("reset-shape").onclick = () => {
    if (p.layers.routes.locked || p.layers.capsules.locked) return;
    mutate((q) => {
      const c = q.layout.routes.find((t) => t.id === r.id).controls[
        selectedEdge
      ];
      if (c) {
        delete c.shape;
        delete c.shapeAngle;
        delete c.shapeReach;
      }
    });
  };
  $("parallel-release").disabled = !(p.layout.parallelConstraints ?? []).some(
    (c) => c.follower.routeId === r.id,
  );
  $("parallel-release").onclick = () =>
    mutate(
      (q) =>
        (q.layout.parallelConstraints = q.layout.parallelConstraints.filter(
          (c) => c.follower.routeId !== r.id,
        )),
    );
  const pair = r.stationIds.slice(selectedEdge, selectedEdge + 2),
    choices = p.layout.routes.filter((t) =>
      t.stationIds.some(
        (id, i) =>
          i < t.stationIds.length - 1 &&
          pair.includes(id) &&
          pair.includes(t.stationIds[i + 1]),
      ),
    );
  $("route-object").innerHTML = choices
    .map(
      (t) =>
        `<option value="${esc(t.id)}">${esc(t.name ?? `Rute ${p.layout.routes.indexOf(t) + 1}`)} · ${esc(p.layout.stations.find((s) => s.id === t.stationIds[0])?.name)} → ${esc(p.layout.stations.find((s) => s.id === t.stationIds.at(-1))?.name)}</option>`,
    )
    .join("");
  $("route-object").value = r.id;
  $("route-object").onchange = (e) => {
    const target = p.layout.routes.find((t) => t.id === e.target.value);
    selectedRoute = target.id;
    selectedEdge = target.stationIds.findIndex(
      (id, i) =>
        i < target.stationIds.length - 1 &&
        pair.includes(id) &&
        pair.includes(target.stationIds[i + 1]),
    );
    render();
  };
  $("edge-delete").onclick = deleteSelectedConnection;
  $("route-tracks").value = r.tracks;
  const map = {
    "route-tracks": "tracks",
    "route-spacing": "trackSpacing",
    "route-stroke": "stroke",
    "route-length": "transitionLength",
    "route-tension": "tension",
    "route-radius": "cornerRadius",
    "route-grow": "autoGrow",
  };
  for (const [id, key] of Object.entries(map)) {
    $(id).disabled = p.layers.routes.locked || p.layers.capsules.locked;
    $(id).onchange = (e) =>
      safe(() =>
        mutate((q) =>
          (() => {
            const target = q.layout.routes.find((t) => t.id === r.id);
            target[key] = +e.target.value;
            q.routeDefaults = routeStyle(target);
          })(),
        ),
      );
  }
  $("route-edge").value = String(
    Math.min(selectedEdge, r.stationIds.length - 2),
  );
  for (const side of ["start", "end"]) {
    $("control-" + side).disabled =
      p.layers.routes.locked || p.layers.capsules.locked;
    $("control-" + side).onchange = (e) =>
      safe(() => {
        const value = +e.target.value,
          g = edgeGeometry(p, r, selectedEdge);
        mutate(
          (q) =>
            (q.layout.routes.find((t) => t.id === r.id).controls[selectedEdge] =
              {
                startReach: g.effectiveReach.start,
                endReach: g.effectiveReach.end,
                ...r.controls[selectedEdge],
                [side + "Reach"]: value,
              }),
        );
      });
  }
  const setBend = () => {
    selectedEdge = +$("route-edge").value;
    const edge = +$("route-edge").value,
      b = r.bends[edge];
    $("bend-x").value = b?.x ?? "";
    $("bend-y").value = b?.y ?? "";
    const g = edgeGeometry(p, r, edge);
    $("control-start").value =
      r.controls[edge]?.startReach ?? g.effectiveReach?.start ?? 12;
    $("control-end").value =
      r.controls[edge]?.endReach ?? g.effectiveReach?.end ?? 12;
  };
  $("route-edge").onchange = () => {
    setBend();
    render();
  };
  setBend();
  $("bend-save").onclick = () =>
    safe(() => {
      if (p.layers.routes.locked || p.layers.capsules.locked) return;
      if (!$("bend-x").value || !$("bend-y").value)
        throw Error("Angi begge koordinater");
      const edge = +$("route-edge").value,
        x = +$("bend-x").value,
        y = +$("bend-y").value;
      mutate(
        (q) =>
          (q.layout.routes.find((t) => t.id === r.id).bends[edge] = { x, y }),
      );
    });
  $("bend-clear").onclick = () => {
    if (p.layers.routes.locked || p.layers.capsules.locked) return;
    const edge = +$("route-edge").value;
    mutate(
      (q) => delete q.layout.routes.find((t) => t.id === r.id).bends[edge],
    );
  };
  $("edge-track").onclick = () => {
    if (p.layers.routes.locked || p.layers.capsules.locked) return;
    const edge = +$("route-edge").value;
    safe(() => {
      const result = splitConnection(p, r.id);
      selectedRoute = result.edgeMap.get(edge).routeId;
      selectedEdge = 0;
      commit(result.project);
    });
    message("Delstrekning valgt · endre sporantall");
  };
}
function render() {
  const p = project();
  $("title").value = p.title;
  $("width").value = p.board.width;
  $("height").value = p.board.height;
  $("size-summary").textContent = `${p.board.width} × ${p.board.height} mm`;
  $("preset").value = ["300,400", "400,400", "500,700"].includes(
    `${p.board.width},${p.board.height}`,
  )
    ? `${p.board.width},${p.board.height}`
    : "custom";
  $("selection-count").textContent = selected.length
    ? `${selected.length} valgt`
    : `${p.layout.stations.length} stasjoner`;
  $("undo").disabled = !history.past.length;
  $("redo").disabled = !history.future.length;
  $("layers").innerHTML = LAYERS.map(
    ([id, name]) =>
      `<div class="layer"><input type="checkbox" data-visible="${id}" aria-label="Vis ${name}" ${p.layers[id].visible ? "checked" : ""}><button class="lock" data-lock="${id}" aria-label="Lås ${name}" aria-pressed="${p.layers[id].locked}">${p.layers[id].locked ? "▣" : "□"}</button><button class="layer-name" data-select-layer="${id}">${name}</button><input type="checkbox" data-export="${id}" aria-label="Eksporter ${name}" ${p.layers[id].export ? "checked" : ""}></div>`,
  ).join("");
  for (const key of ["visible", "export"])
    document
      .querySelectorAll(`[data-${key}]`)
      .forEach(
        (el) =>
          (el.onchange = () =>
            mutate((q) => (q.layers[el.dataset[key]][key] = el.checked))),
      );
  document
    .querySelectorAll("[data-lock]")
    .forEach(
      (el) =>
        (el.onclick = () =>
          mutate(
            (q) =>
              (q.layers[el.dataset.lock].locked =
                !q.layers[el.dataset.lock].locked),
          )),
    );
  document.querySelectorAll("[data-select-layer]").forEach(
    (el) =>
      (el.onclick = () => {
        const id = el.dataset.selectLayer;
        selected =
          ["rings", "names", "holes", "capsules"].includes(id) &&
          p.layers[id].visible &&
          !p.layers[id].locked
            ? p.layout.stations.map((s) => s.id)
            : [];
        render();
        message(`Lag: ${LAYERS.find(([x]) => x === id)[1]}`);
      }),
  );
  $("template-status").textContent = p.stationTemplate
    ? "Egen stasjonsmal"
    : "Standard enkeltstasjon";
  properties();
  renderChecks();
  renderPhysical();
  renderLibrary();
  draw();
}
function safe(fn) {
  try {
    fn();
  } catch (e) {
    message(e.message);
    render();
  }
}
function setTool(next) {
  ledSnap = null;
  if (next !== "select") pendingStation = null;
  tool = next;
  if (next !== "select") selectedRoute = null;
  if (next === "route") {
    selected = [];
    selectedRoute = null;
  }
  routeStart = null;
  reconnectTarget = null;
  portHover = null;
  document
    .querySelectorAll("[data-tool]")
    .forEach((b) => b.classList.toggle("active", b.dataset.tool === tool));
  canvas.style.cursor =
    tool === "hand" ? "grab" : tool === "select" ? "default" : "crosshair";
  message(
    {
      select: "Velg eller dra en stasjon",
      station: "Klikk på tavlen for å legge til en stasjon",
      route: "Velg startport og sluttport på stasjonene",
      measure: "Dra en målelinje",
      hand: "Dra for å panorere",
    }[tool],
  );
  properties();
  draw();
}
canvas.onpointerdown = (e) => {
  if (e.button !== 0 && e.button !== 1) return;
  e.preventDefault();
  canvas.focus();
  canvas.setPointerCapture(e.pointerId);
  const portTarget = e.target.closest("[data-port]");
  if (portTarget) {
    choosePort(portTarget.dataset.portStation, portTarget.dataset.port);
    return;
  }
  const a = xy(e),
    target = e.target.closest("[data-station],[data-label]"),
    id =
      target?.dataset.station ||
      target?.dataset.label ||
      (tool === "route"
        ? project().ledLayout.bindings.find(
            (b) => b.ledId === e.target.closest("[data-led]")?.dataset.led,
          )?.stationId
        : null),
    p = project();
  if (pendingStation && e.button === 0) {
    if (stationLocks()) {
      message("Lås opp berørte lag før plassering");
      return;
    }
    const index = Math.min(
        +$("snap-led-point").value,
        pendingStation.template.appearance.points - 1,
      ),
      raw = fromTemplate(pendingStation.template, a, pendingStation.id),
      candidate = nearestPhysicalLed(
        p,
        symbolCenters(
          { ...p, layout: { ...p.layout, stations: [raw], routes: [] } },
          raw,
        )[index],
        zoom,
        { enabled: $("snap-led").checked },
      ),
      pt = snapped(a);
    if (pt.x < 0 || pt.y < 0 || pt.x > p.board.width || pt.y > p.board.height)
      return;
    safe(() => {
      const station = fromTemplate(
        pendingStation.template,
        pt,
        pendingStation.id,
      );
      let q = copy(p);
      q.layout.stations.push(station);
      if (candidate)
        q = snapStationPoint(q, station.id, index, candidate, {
          bind: $("snap-led-bind").checked,
        });
      pendingStation = null;
      ledSnap = null;
      selected = [station.id];
      commit(q);
    });
    return;
  }
  if (pendingStrip && e.button === 0 && !space && tool !== "hand") {
    const pt = snapped(a),
      s = { ...pendingStrip, x: pt.x, y: pt.y };
    pendingStrip = null;
    selectedSegment = s.id;
    mutate((q) => {
      const index = q.ledLayout.segments.findIndex((t) => t.id === s.id);
      if (index < 0) q.ledLayout.segments.push(s);
      else q.ledLayout.segments[index] = s;
      q.layers.strips.visible = true;
      q.layers.leds.visible = true;
    });
    setTool("select");
    return;
  }
  const ledTarget = e.target.closest("[data-led]");
  if (bindTarget && ledTarget) {
    const request = {
      ...bindTarget,
      segmentId: ledTarget.dataset.segment,
      ledId: ledTarget.dataset.led,
    };
    bindTarget = null;
    safe(() => commit(bindPoint(project(), request)));
    return;
  }
  if (ledTarget && !bindTarget && tool === "select") {
    const linked = p.ledLayout.bindings.find(
      (b) => b.ledId === ledTarget.dataset.led,
    );
    if (linked) {
      selected = [linked.stationId];
      selectedRoute = null;
      bindingStation = linked.stationId;
      bindingPoint = linked.pointIndex;
      if (tool === "select" && $("snap-led").checked && !stationLocks())
        gesture = {
          kind: "move",
          id: linked.stationId,
          start: a,
          base: copy(p),
          moved: false,
          pointIndex: linked.pointIndex,
          share: $("bind-share")?.checked ?? false,
        };
      render();
      return;
    }
  }
  const segmentTarget = e.target.closest("[data-segment]");
  if (segmentTarget && tool === "select") {
    selected = [];
    selectedRoute = null;
    selectedSegment = segmentTarget.dataset.segment;
    const seg = p.ledLayout.segments.find((s) => s.id === selectedSegment);
    if (!seg) return;
    selectedProfile = seg.profileId;
    $("led-panel").hidden = false;
    renderPhysical();
    if (p.layers.strips.locked || p.layers.leds.locked) {
      message("LED-layouten er låst");
      return;
    }
    gesture = { kind: "segment", id: seg.id, start: a, base: copy(p) };
    return;
  }
  const handle = e.target.closest("[data-handle]");
  if (handle) {
    const r = p.layout.routes.find((r) => r.id === handle.dataset.controlRoute);
    if (p.layers.routes.locked || p.layers.capsules.locked) return;
    const g = edgeGeometry(p, r, selectedEdge);
    gesture = {
      kind: "curve",
      handle: handle.dataset.handle,
      routeId: r.id,
      edge: selectedEdge,
      base: copy(p),
      geometry: g,
    };
    return;
  }
  if (space || tool === "hand" || e.button === 1) {
    gesture = {
      kind: "pan",
      client: { x: e.clientX, y: e.clientY },
      origin: copy(origin),
    };
    return;
  }
  if (tool === "measure") {
    measure = { a, b: a };
    gesture = { kind: "measure" };
    draw();
    return;
  }
  if (tool === "station") {
    selectedRoute = null;
    if (
      p.layers.rings.locked ||
      p.layers.holes.locked ||
      p.layers.capsules.locked ||
      p.layers.routes.locked ||
      p.layers.names.locked
    ) {
      message("Stasjons- eller hullaget er låst");
      return;
    }
    const template = p.stationTemplate ?? defaultTemplate(),
      index = Math.min(
        +$("snap-led-point").value,
        template.appearance.points - 1,
      ),
      raw = fromTemplate(template, a),
      candidate = nearestPhysicalLed(
        p,
        symbolCenters(
          { ...p, layout: { ...p.layout, stations: [raw], routes: [] } },
          raw,
        )[index],
        zoom,
        { enabled: $("snap-led").checked },
      ),
      pt = snapped(a);
    if (pt.x < 0 || pt.y < 0 || pt.x > p.board.width || pt.y > p.board.height)
      return;
    safe(() => {
      const station = fromTemplate(template, pt, raw.id);
      let q = copy(p);
      q.layout.stations.push(station);
      if (candidate)
        q = snapStationPoint(q, station.id, index, candidate, {
          bind: $("snap-led-bind").checked,
        });
      selected = [station.id];
      ledSnap = null;
      commit(q);
    });
    return;
  }
  if (tool === "route") {
    message("Velg et synlig tilkoblingspunkt, ikke midten av stasjonen.");
    return;
  }
  if (tool !== "select") return;
  const routeTarget = e.target.closest("[data-route]");
  if (
    routeTarget &&
    !id &&
    (routeMoveEnabled || e.altKey) &&
    selectedRoute === routeTarget.dataset.route
  ) {
    if (stationLocks()) {
      message("Lås opp berørte lag før traséflytting");
      return;
    }
    gesture = {
      kind: "route-move",
      routeId: selectedRoute,
      edge: +(routeTarget.dataset.edge ?? 0),
      start: a,
      base: copy(p),
    };
    return;
  }
  if (routeTarget && !id) {
    routeMoveEnabled = false;
    selected = [];
    selectedRoute = routeTarget.dataset.route;
    selectedEdge = +(routeTarget.dataset.edge ?? 0);
    render();
    return;
  }
  selectedRoute = null;
  if (id) {
    const label = !!target.dataset.label,
      locked = label
        ? p.layers.names.locked
        : p.layers.rings.locked ||
          p.layers.holes.locked ||
          p.layers.capsules.locked ||
          p.layers.routes.locked ||
          p.layers.names.locked;
    if (locked) {
      message("Laget er låst");
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      selected = selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id];
      render();
      return;
    }
    if (!selected.includes(id)) selected = [id];
    if (bindingStation !== id) {
      bindingStation = id;
      bindingPoint = 0;
    }
    gesture = {
      kind: label ? "label" : "move",
      id,
      start: a,
      base: copy(p),
      moved: false,
      pointIndex: Math.min(
        bindingPoint,
        p.layout.stations.find((s) => s.id === id).points - 1,
      ),
      share: $("bind-share")?.checked ?? false,
    };
    render();
  } else {
    if (!e.ctrlKey && !e.metaKey) selected = [];
    gesture = { kind: "box", start: a, last: a, previous: [...selected] };
    render();
  }
};
canvas.onpointermove = (e) => {
  const pt = xy(e);
  $("coords").textContent = `X ${pt.x.toFixed(2)} · Y ${pt.y.toFixed(2)} mm`;
  if (!gesture) {
    const target = e.target.closest("[data-port]"),
      key = target
        ? target.dataset.portStation + "|" + target.dataset.port
        : null;
    if (portHover !== key) {
      portHover = key;
      draw();
    }
  }
  if (pendingStrip && !gesture) {
    const pt2 = snapped(pt),
      preview = copy(project()),
      segment = { ...pendingStrip, x: pt2.x, y: pt2.y },
      index = preview.ledLayout.segments.findIndex((t) => t.id === segment.id);
    if (index < 0) preview.ledLayout.segments.push(segment);
    else preview.ledLayout.segments[index] = segment;
    preview.layers.leds.visible = true;
    preview.layers.strips.visible = true;
    draw(preview);
    return;
  }
  if (pendingStation) {
    newStationIndicator(pt);
    pendingStation.point = snapped(pt);
    if (ledSnap) {
      const ghost = fromTemplate(
          pendingStation.template,
          pendingStation.point,
          pendingStation.id,
        ),
        index = Math.min(+$("snap-led-point").value, ghost.points - 1),
        center = symbolCenters(p, ghost)[index];
      pendingStation.point = {
        x: pendingStation.point.x + ledSnap.x - center.x,
        y: pendingStation.point.y + ledSnap.y - center.y,
      };
    }
    draw();
    return;
  }
  if (!gesture && tool === "station") {
    newStationIndicator(pt);
    draw();
    return;
  }
  if (!gesture) return;
  const g = gesture;
  if (g.kind === "pan") {
    origin = {
      x: g.origin.x + e.clientX - g.client.x,
      y: g.origin.y + e.clientY - g.client.y,
    };
    draw();
  } else if (g.kind === "measure") {
    measure.b = pt;
    draw();
  } else if (g.kind === "box") {
    g.last = pt;
    draw();
  } else if (g.kind === "move") {
    try {
      g.preview = stationDrag(g, pt);
      g.snapError = null;
      draw(g.preview);
    } catch (err) {
      g.preview = null;
      g.snapError = err.message;
      draw(g.base);
      message(err.message);
    }
  } else if (g.kind === "route-move") {
    smartGuides = [];
    const q = translateRoute(
      copy(g.base),
      g.routeId,
      pt.x - g.start.x,
      pt.y - g.start.y,
    );
    safe(() => {
      g.preview = previewParallel(q, g);
      draw(g.preview);
    });
  } else if (g.kind === "segment") {
    const q = copy(g.base),
      s = q.ledLayout.segments.find((s) => s.id === g.id),
      old = g.base.ledLayout.segments.find((s) => s.id === g.id),
      pt2 = snapped(
        { x: old.x + pt.x - g.start.x, y: old.y + pt.y - g.start.y },
        g.base,
      );
    s.x = pt2.x;
    s.y = pt2.y;
    g.preview = q;
    draw(q);
  } else if (g.kind === "curve") {
    const q = copy(g.base),
      r = q.layout.routes.find((r) => r.id === g.routeId);
    if (g.handle === "form" || g.handle === "shape-tangent") {
      const c = {
        startReach: g.geometry.effectiveReach.start,
        endReach: g.geometry.effectiveReach.end,
        ...r.controls[g.edge],
      };
      if (g.handle === "form") c.shape = snapped(pt, g.base);
      else {
        const dx = pt.x - c.shape.x,
          dy = pt.y - c.shape.y;
        c.shapeAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
        c.shapeReach = Math.max(0.1, Math.min(5000, Math.hypot(dx, dy)));
      }
      r.controls[g.edge] = c;
    } else if (g.handle === "bend")
      r.bends[g.edge] = snapped(
        pt,
        g.base,
        g.base.layout.routes.find((t) => t.id === g.routeId).bends[g.edge] ??
          g.geometry.center[Math.floor(g.geometry.center.length / 2)],
      );
    else {
      const geom = g.geometry,
        c = geom.curves[0],
        last = geom.curves.at(-1),
        start = c.start,
        end = last.end,
        ref = g.handle === "start" ? start : end,
        dir =
          g.handle === "start"
            ? { x: c.c1.x - start.x, y: c.c1.y - start.y }
            : { x: last.c2.x - end.x, y: last.c2.y - end.y },
        len = Math.hypot(dir.x, dir.y),
        reach = Math.max(
          0.1,
          Math.min(
            5000,
            ((pt.x - ref.x) * dir.x + (pt.y - ref.y) * dir.y) / len,
          ),
        );
      r.controls[g.edge] = {
        startReach: geom.effectiveReach.start,
        endReach: geom.effectiveReach.end,
        ...r.controls[g.edge],
        [g.handle === "start" ? "startReach" : "endReach"]: reach,
      };
    }
    try {
      g.preview =
        g.handle === "bend" ? previewParallel(q, g) : enforceParallels(q);
      draw(g.preview);
    } catch (err) {
      g.preview = null;
      message(err.message);
      draw(g.base);
    }
  } else if (g.kind === "label") {
    const q = copy(g.base),
      s = q.layout.stations.find((s) => s.id === g.id);
    s.label.dx += pt.x - g.start.x;
    s.label.dy += pt.y - g.start.y;
    g.preview = q;
    g.moved = true;
    draw(q);
  }
};
function finishGesture(cancel = false) {
  if (!gesture) return;
  const g = gesture;
  gesture = null;
  smartGuides = [];
  ledSnap = null;
  if (!cancel && g.snapError) {
    draw();
    message(g.snapError);
    return;
  }
  if (!cancel && g.preview) {
    safe(() => commit(g.preview));
  } else if (!cancel && g.kind === "box") {
    const a = g.start,
      b = g.last;
    selected = [
      ...new Set([
        ...g.previous,
        ...project()
          .layout.stations.filter(
            (s) =>
              project().layers.rings.visible &&
              !project().layers.rings.locked &&
              s.x >= Math.min(a.x, b.x) &&
              s.x <= Math.max(a.x, b.x) &&
              s.y >= Math.min(a.y, b.y) &&
              s.y <= Math.max(a.y, b.y),
          )
          .map((s) => s.id),
      ]),
    ];
    render();
  } else draw();
}
canvas.onpointerup = () => finishGesture();
canvas.onpointercancel = () => finishGesture(true);
canvas.onlostpointercapture = () => finishGesture(true);
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    zoomAt(Math.exp(-e.deltaY * 0.001), e.clientX - r.left, e.clientY - r.top);
  },
  { passive: false },
);
for (const b of document.querySelectorAll("[data-tool]"))
  b.onclick = () => setTool(b.dataset.tool);
$("zoom-in").onclick = () => zoomAt(1.2);
$("zoom-out").onclick = () => zoomAt(1 / 1.2);
$("fit").onclick = fit;
for (const id of [
  "grid",
  "grid-step",
  "grid-major",
  "grid-contrast",
  "snap",
  "snap-guides",
  "snap-led",
  "snap-led-bind",
  "snap-led-point",
])
  $(id).onchange = () => {
    if (id === "snap-led") {
      ledSnap = null;
      if ($("station-snap-led"))
        $("station-snap-led").checked = $("snap-led").checked;
    }
    draw();
  };
$("undo").onclick = () => {
  finishGesture(true);
  history.undo();
  selected = selected.filter((id) =>
    project().layout.stations.some((s) => s.id === id),
  );
  persist();
  render();
};
$("redo").onclick = () => {
  history.redo();
  persist();
  render();
};
$("delete").onclick = () => {
  if (selectedRoute) {
    deleteSelectedConnection();
    return;
  }
  if (!selected.length) return;
  if (
    ["rings", "holes", "names", "routes", "capsules"].some(
      (id) => project().layers[id].locked,
    )
  ) {
    message("Lås opp berørte lag før sletting");
    return;
  }
  mutate((p) => {
    const changedRoutes = p.layout.routes
      .filter((r) => r.stationIds.some((id) => selected.includes(id)))
      .map((r) => r.id);
    p.layout.parallelConstraints = p.layout.parallelConstraints.filter(
      (c) =>
        !changedRoutes.includes(c.reference.routeId) &&
        !changedRoutes.includes(c.follower.routeId),
    );
    if (p.layout.tangentHints)
      for (const id of selected) delete p.layout.tangentHints[id];
    p.ledLayout.bindings = p.ledLayout.bindings.filter(
      (b) => !selected.includes(b.stationId),
    );
    p.layout.stations = p.layout.stations.filter(
      (s) => !selected.includes(s.id),
    );
    p.layout.routes = p.layout.routes
      .map((r) => {
        const ids = r.stationIds.filter((id) => !selected.includes(id)),
          bends = {};
        for (let i = 0; i < ids.length - 1; i++) {
          const old = r.stationIds.indexOf(ids[i]);
          if (r.stationIds[old + 1] === ids[i + 1] && r.bends[old])
            bends[i] = copy(r.bends[old]);
        }
        const controls = {},
          anchors = {};
        for (let i = 0; i < ids.length - 1; i++) {
          const old = r.stationIds.indexOf(ids[i]);
          if (r.stationIds[old + 1] === ids[i + 1] && r.controls[old])
            controls[i] = copy(r.controls[old]);
        }
        for (let i = 0; i < ids.length - 1; i++) {
          const old = r.stationIds.indexOf(ids[i]);
          if (r.stationIds[old + 1] === ids[i + 1] && r.anchors?.[old])
            anchors[i] = copy(r.anchors[old]);
        }
        return {
          ...r,
          stationIds: ids,
          bends,
          controls,
          ...(r.anchors ? { anchors } : {}),
        };
      })
      .filter((r) => r.stationIds.length > 1);
  });
  selected = [];
  render();
};
$("title").onchange = (e) => mutate((p) => (p.title = e.target.value));
for (const axis of ["width", "height"])
  $(axis).onchange = (e) =>
    safe(() => mutate((p) => (p.board[axis] = +e.target.value)));
$("preset").onchange = (e) => {
  if (e.target.value === "custom") return;
  const [w, h] = e.target.value.split(",").map(Number);
  mutate((p) => {
    p.board.width = w;
    p.board.height = h;
  });
  fit();
};
$("rotate").onclick = () => {
  mutate(
    (p) => ([p.board.width, p.board.height] = [p.board.height, p.board.width]),
  );
  fit();
};
$("guide-add").onclick = () =>
  safe(() => {
    if (project().layers.guides.locked) throw Error("Hjelpelinjelaget er låst");
    mutate((p) =>
      p.layout.guides.push({
        axis: $("guide-axis").value,
        value: +$("guide-value").value,
      }),
    );
  });
$("guide-clear").onclick = () => {
  if (!project().layers.guides.locked) mutate((p) => (p.layout.guides = []));
};
function download(text, name, type) {
  const url = URL.createObjectURL(new Blob([text], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("save").onclick = () =>
  safe(() =>
    download(serialize(project()), "intransit-board.json", "application/json"),
  );
$("open").onclick = () => $("file").click();
$("file").onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  if (file.size > 10_000_000) {
    message("Prosjektfilen er for stor (maks 10 MB)");
    return;
  }
  safe(() => {});
  try {
    const p = parseProject(await file.text());
    selected = [];
    selectedRoute = null;
    pendingStation = null;
    pendingStrip = null;
    bindTarget = null;
    setTool("select");
    commit(p, { load: true });
    fit();
  } catch (err) {
    message(err.message);
  }
};
$("export").onclick = () => $("export-dialog").showModal();
$("export-close").onclick = () => $("export-dialog").close();
$("export-download").onclick = () =>
  safe(() => {
    download(svg(project()), "intransit-board.svg", "image/svg+xml");
    $("export-dialog").close();
    message("SVG eksportert med millimetermål");
  });
for (const [id, demo] of [
  ["new", false],
  ["demo", true],
])
  $(id).onclick = () => {
    selected = [];
    selectedRoute = null;
    measure = null;
    pendingStation = null;
    pendingStrip = null;
    bindTarget = null;
    setTool("select");
    commit(createProject(demo), { load: true });
    fit();
  };
document.onkeydown = (e) => {
  if ((e.key === "Enter" || e.key === " ") && e.target.closest("[data-port]")) {
    e.preventDefault();
    const el = e.target.closest("[data-port]");
    choosePort(el.dataset.portStation, el.dataset.port);
    return;
  }

  if (e.key === "Escape" && bindTarget) {
    bindTarget = null;
    message("LED-valg avbrutt");
    return;
  }
  if (e.key === "Escape" && pendingStrip) {
    pendingStrip = null;
    draw();
    message("Segmentplassering avbrutt");
    return;
  }
  if (e.key === "Escape" && pendingStation) {
    e.preventDefault();
    pendingStation = null;
    ledSnap = null;
    draw();
    message("Plassering avbrutt");
    return;
  }
  if (
    e.target.closest(
      "input,select,textarea,dialog,[contenteditable]:not([contenteditable=false])",
    )
  )
    return;
  if (e.code === "Space") {
    e.preventDefault();
    space = true;
    return;
  }
  if (e.key === "Escape") {
    pendingStation = null;
    $("station-menu").hidden = true;
    finishGesture(true);
    routeStart = null;
    setTool("select");
    draw();
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
    e.preventDefault();
    $("redo").click();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    $(e.shiftKey ? "redo" : "undo").click();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
    const s = project().layout.stations.find((s) => s.id === selected[0]);
    if (s) {
      e.preventDefault();
      clipboard = stationTemplate(project(), s);
      message("Stasjonens utseende kopiert");
    }
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
    if (clipboard) {
      e.preventDefault();
      beginPaste();
    }
    return;
  }
  if (e.ctrlKey || e.metaKey) return;
  const tools = {
    v: "select",
    s: "station",
    l: "route",
    m: "measure",
    h: "hand",
  };
  if (tools[e.key.toLowerCase()]) setTool(tools[e.key.toLowerCase()]);
  if (e.key === "Delete" || e.key === "Backspace") {
    e.preventDefault();
    $("delete").click();
  }
};
document.onkeyup = (e) => {
  if (e.code === "Space") space = false;
};
window.onblur = () => {
  space = false;
  finishGesture(true);
};
new ResizeObserver(() => draw()).observe($("viewport"));
render();
requestAnimationFrame(fit);

const iconPaths = {
  select: "M4 3 L17 12 L11 13 L8 19 Z",
  station:
    "M12 3 A9 9 0 1 0 12 21 A9 9 0 1 0 12 3 M12 7 A5 5 0 1 0 12 17 A5 5 0 1 0 12 7",
  route: "M3 18 L9 12 L15 12 L21 6",
  measure: "M3 8 V16 M21 8 V16 M3 12 H21 M7 8 L3 12 L7 16 M17 8 L21 12 L17 16",
  hand: "M12 2 V22 M2 12 H22 M8 6 L12 2 L16 6 M8 18 L12 22 L16 18 M6 8 L2 12 L6 16 M18 8 L22 12 L18 16",
  undo: "M8 5 L3 10 L8 15 M3 10 H15 A5 5 0 0 1 15 20",
  redo: "M16 5 L21 10 L16 15 M21 10 H9 A5 5 0 0 0 9 20",
  delete: "M6 6 L18 18 M18 6 L6 18",
};
for (const [name, path] of Object.entries(iconPaths)) {
  const button = document.querySelector(`[data-tool="${name}"]`) || $(name);
  button.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="${path}"/></svg>`;
}

$("fixture").onclick = () => {
  selected = [];
  selectedRoute = null;
  selectedEdge = 0;
  measure = null;
  pendingStation = null;
  setTool("select");
  commit(geometryFixture(), { load: true });
  fit();
};

canvas.oncontextmenu = (e) => {
  const el = e.target.closest("[data-station],[data-label]");
  if (!el) return;
  e.preventDefault();
  selected = [el.dataset.station ?? el.dataset.label];
  selectedRoute = null;
  render();
  const menu = $("station-menu");
  menu.hidden = false;
  menu.style.left = Math.min(e.clientX, innerWidth - 200) + "px";
  menu.style.top = Math.min(e.clientY, innerHeight - 55) + "px";
  $("context-duplicate").focus();
};
$("context-duplicate").onclick = () => {
  $("station-menu").hidden = true;
  startDuplicate();
};
document.addEventListener("pointerdown", (e) => {
  if (!e.target.closest("#station-menu")) $("station-menu").hidden = true;
});

function libraryRecords() {
  return [...builtInSymbols(defaultTemplate()), ...project().library.templates];
}
function renderLibrary() {
  if ($("symbol-library").hidden) return;
  const category = $("library-category").value,
    records = libraryRecords().filter(
      (r) => !category || r.category === category,
    );
  $("library-items").innerHTML = records
    .map((r) => {
      const s = fromTemplate(r.template, { x: 30, y: 20 }, "preview-" + r.id),
        p = {
          ...project(),
          layout: { ...project().layout, stations: [s], routes: [] },
        };
      return `<article><button class="symbol-pick" data-symbol="${esc(r.id)}"><svg viewBox="0 0 60 40" aria-hidden="true">${["capsules", "rings"].map((id) => stationMarkup(s, id, p)).join("")}</svg><span>${esc(r.name)}</span></button><button data-symbol-default="${esc(r.id)}" class="symbol-default">Som standard</button>${!r.builtin ? `<button data-symbol-update="${esc(r.id)}" class="symbol-default">Oppdater fra valgt</button>` : ""}</article>`;
    })
    .join("");
  document
    .querySelectorAll("[data-symbol]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          beginPaste(
            libraryRecords().find((r) => r.id === b.dataset.symbol).template,
          )),
    );
  document.querySelectorAll("[data-symbol-update]").forEach(
    (b) =>
      (b.onclick = () =>
        safe(() => {
          const s = project().layout.stations.find((s) => s.id === selected[0]);
          if (!s) throw Error("Velg en stasjon å oppdatere malen fra.");
          mutate(
            (q) =>
              (q.library.templates.find(
                (r) => r.id === b.dataset.symbolUpdate,
              ).template = stationTemplate(q, s)),
          );
        })),
  );
  document
    .querySelectorAll("[data-symbol-default]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          mutate(
            (q) =>
              (q.stationTemplate = copy(
                libraryRecords().find((r) => r.id === b.dataset.symbolDefault)
                  .template,
              )),
          )),
    );
}
$("library-toggle").onclick = () => {
  $("symbol-library").hidden = !$("symbol-library").hidden;
  $("led-panel").hidden = true;
  renderLibrary();
};
$("library-close").onclick = () => ($("symbol-library").hidden = true);
$("library-category").onchange = renderLibrary;
$("library-save").onclick = () =>
  safe(() => {
    const s = project().layout.stations.find((s) => s.id === selected[0]);
    if (!s) throw Error("Velg stasjonen som skal lagres som symbolmal.");
    const name = $("library-name").value.trim();
    if (!name) throw Error("Gi symbolmalen et navn.");
    mutate((q) =>
      q.library.templates.push({
        id: crypto.randomUUID(),
        name,
        category: $("library-save-category").value,
        template: stationTemplate(q, s),
      }),
    );
  });
$("library-export").onclick = () =>
  download(
    JSON.stringify(symbolBundle(project().library.templates), null, 2),
    "intransit-symboler.json",
    "application/json",
  );
$("library-import").onclick = () => $("library-file").click();
$("library-file").onchange = async (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  try {
    if (f.size > 2_000_000) throw Error("Symbolfilen er for stor.");
    const records = importSymbolBundle(await f.text()),
      q = copy(project());
    q.library.templates.push(...records);
    const valid = parseProject(q);
    for (const r of valid.library.templates) {
      const s = fromTemplate(r.template, { x: 0, y: 0 }, "import-preview");
      r.template = stationTemplate(
        { ...valid, layout: { ...valid.layout, stations: [s], routes: [] } },
        s,
      );
    }
    commit(valid);
  } catch (err) {
    message(err.message);
  }
};

const numeric = (id) => +$(id).value;
function physicalLocked() {
  return project().layers.strips.locked || project().layers.leds.locked;
}
function readSegment() {
  const p = project(),
    profile = p.ledLayout.profiles.find((r) => r.id === selectedProfile);
  if (!profile) throw Error("Opprett en stripeprofil først.");
  const old = p.ledLayout.segments.find((s) => s.id === selectedSegment),
    s = old ? copy(old) : newSegment(p, profile.id);
  Object.assign(s, {
    profileId: profile.id,
    name: $("seg-name").value,
    x: numeric("seg-x"),
    y: numeric("seg-y"),
    angle: numeric("seg-angle"),
    count: numeric("seg-count"),
    length: numeric("seg-length"),
    startIndex: numeric("seg-index"),
    controllerId: $("seg-controller").value,
    chainId: $("seg-chain").value,
    direction: numeric("seg-direction"),
    mounting: $("seg-mount").value,
    cutPoints: $("seg-cuts").value.trim()
      ? $("seg-cuts").value.split(",").map(Number)
      : [],
    splices: $("seg-splices").value.trim()
      ? $("seg-splices")
          .value.split(",")
          .map(Number)
          .map((atMm) => ({
            atMm,
            note:
              $("seg-splice-note").value ||
              (old?.splices.find((j) => j.atMm === atMm)?.note ?? ""),
          }))
      : [],
  });
  return s;
}
function renderPhysical() {
  if ($("led-panel").hidden) return;
  const p = project();
  if (!p.ledLayout.profiles.some((r) => r.id === selectedProfile))
    selectedProfile = p.ledLayout.profiles[0]?.id ?? null;
  const r = p.ledLayout.profiles.find((r) => r.id === selectedProfile),
    s = p.ledLayout.segments.find((s) => s.id === selectedSegment);
  $("led-profile").innerHTML = p.ledLayout.profiles
    .map((r) => `<option value="${esc(r.id)}">${esc(r.name)}</option>`)
    .join("");
  $("led-profile").value = selectedProfile ?? "";
  const editor = $("led-editor");
  if (!r) {
    editor.innerHTML =
      '<p class="note">Opprett WS2812B-profilen for å starte.</p>';
    return;
  }
  const draft = s ?? newSegment(p, r.id);
  editor.innerHTML = `<details><summary>Stripeprofil · mål i mm</summary>${field("profile-name", "Profilnavn", r.name, "text")}${field("profile-type", "LED-type", r.ledType, "text")}<div class="pair">${field("profile-width", "Stripebredde", r.width)}${field("profile-pitch", "Faktisk LED-pitch", r.pitch, "number", 'step="0.01"')}</div><div class="pair">${field("profile-nominal", "Nominell pitch", r.nominalPitch)}${field("profile-offset", "Første LED fra ende", r.firstOffset)}</div><div class="pair">${field("profile-count", "Antall LED på stripe", r.count)}${field("profile-length", "Hele stripens lengde", r.length)}</div><button id="profile-save">Oppdater profil</button></details><hr><label>Segment<select id="led-segment"><option value="">Ny kladd</option>${p.ledLayout.segments.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("")}</select></label>${field("seg-name", "Segmentnavn", draft.name, "text")}<div class="pair">${field("seg-x", "Start X, mm", draft.x)}${field("seg-y", "Start Y, mm", draft.y)}</div><div class="pair">${field("seg-angle", "Rotasjon, °", draft.angle)}${field("seg-count", "Antall LED", draft.count)}</div><div class="pair">${field("seg-length", "Segmentlengde, mm", draft.length)}${field("seg-index", "Startindeks", draft.startIndex)}</div><div class="pair">${field("seg-controller", "Kontrolleridentitet", draft.controllerId, "text")}${field("seg-chain", "Kjedeidentitet", draft.chainId, "text")}</div><div class="pair"><label>Indeksering<select id="seg-direction"><option value="1">Fremover →</option><option value="-1">Bakover ←</option></select></label><label>Montering<select id="seg-mount"><option value="back">Bakside</option><option value="front">Forside</option></select></label></div>${field("seg-cuts", "Kutt etter lokale LED-posisjoner (komma)", draft.cutPoints.join(","), "text")}${field("seg-splices", "Skjøtepunkter fra start, mm (komma)", draft.splices.map((j) => j.atMm).join(","), "text")}${field("seg-splice-note", "Notat for nye skjøter", "", "text")}<div class="pair"><button id="segment-save">${s ? "Oppdater segment" : "Opprett segment"}</button><button id="segment-place">Plasser med mus</button></div><button id="segment-delete">Slett valgt segment</button>${
    s
      ? `<table class="led-coordinates"><thead><tr><th>Indeks</th><th>X mm</th><th>Y mm</th></tr></thead><tbody>${ledPositions(
          p,
          s,
        )
          .map(
            (l) =>
              `<tr data-coordinate-led="${esc(l.id)}"><td>${l.index}</td><td title="${l.x}">${l.x.toFixed(4)}</td><td title="${l.y}">${l.y.toFixed(4)}</td></tr>`,
          )
          .join("")}</tbody></table>`
      : ""
  }`;
  $("led-segment").value = s?.id ?? "";
  $("led-segment").onchange = (e) => {
    selectedSegment = e.target.value || null;
    const selected = p.ledLayout.segments.find((s) => s.id === selectedSegment);
    if (selected) selectedProfile = selected.profileId;
    renderPhysical();
  };
  $("seg-direction").value = draft.direction;
  $("seg-mount").value = draft.mounting;
  $("profile-save").onclick = () =>
    safe(() => {
      if (physicalLocked()) throw Error("LED-layouten er låst.");
      mutate((q) =>
        Object.assign(
          q.ledLayout.profiles.find((t) => t.id === r.id),
          {
            name: $("profile-name").value,
            ledType: $("profile-type").value,
            width: numeric("profile-width"),
            pitch: numeric("profile-pitch"),
            nominalPitch: numeric("profile-nominal"),
            firstOffset: numeric("profile-offset"),
            count: numeric("profile-count"),
            length: numeric("profile-length"),
          },
        ),
      );
    });
  $("segment-save").onclick = () =>
    safe(() => {
      if (physicalLocked()) throw Error("LED-layouten er låst.");
      const proposed = readSegment();
      selectedSegment = proposed.id;
      mutate((q) => {
        const i = q.ledLayout.segments.findIndex((s) => s.id === proposed.id);
        if (i < 0) q.ledLayout.segments.push(proposed);
        else q.ledLayout.segments[i] = proposed;
        q.layers.strips.visible = true;
        q.layers.leds.visible = true;
      });
    });
  $("segment-place").onclick = () =>
    safe(() => {
      if (physicalLocked()) throw Error("LED-layouten er låst.");
      const draft = readSegment();
      pendingStrip = draft;
      $("led-panel").hidden = true;
      canvas.focus();
      message("Klikk på tavlen for segmentets startpunkt · Escape avbryter");
    });
  $("segment-delete").disabled = !s;
  $("segment-delete").onclick = () =>
    safe(() => {
      if (physicalLocked()) throw Error("LED-layouten er låst.");
      if (p.ledLayout.bindings.some((b) => b.segmentId === s.id))
        throw Error("Løsne segmentets LED-bindinger før sletting.");
      mutate(
        (q) =>
          (q.ledLayout.segments = q.ledLayout.segments.filter(
            (t) => t.id !== s.id,
          )),
      );
      selectedSegment = null;
    });
}
$("led-toggle").onclick = () => {
  $("snap-led").checked = true;
  $("snap-led-bind").checked = true;
  $("led-panel").hidden = !$("led-panel").hidden;
  $("symbol-library").hidden = true;
  renderPhysical();
};
$("led-close").onclick = () => ($("led-panel").hidden = true);
$("led-profile").onchange = (e) => {
  selectedProfile = e.target.value;
  selectedSegment = null;
  renderPhysical();
};
$("led-add-profile").onclick = () =>
  safe(() => {
    const r = newProfile();
    selectedProfile = r.id;
    mutate((q) => q.ledLayout.profiles.push(r));
  });
$("led-new-segment").onclick = () => {
  selectedSegment = null;
  renderPhysical();
};

function renderChecks() {
  const issues = mechanicalCheck(project());
  $("mechanical-report").innerHTML = issues.length
    ? `<p>${issues.length} funn</p><ul>${issues
        .slice(0, 100)
        .map((i) => `<li><b>${esc(i.object)}</b>: ${esc(i.message)}</li>`)
        .join("")}</ul>`
    : "<p>Grunnkontroll: ingen funn.</p>";
}
function renderBindings(p, s) {
  if (bindingStation !== s.id) {
    bindingStation = s.id;
    bindingPoint = 0;
  }
  bindingPoint = Math.min(bindingPoint, s.points - 1);
  let root = $("station-bindings");
  if (!root) {
    $("properties").insertAdjacentHTML(
      "beforeend",
      '<div id="station-bindings"></div>',
    );
    root = $("station-bindings");
  }
  const b = p.ledLayout.bindings.find(
      (b) => b.stationId === s.id && b.pointIndex === bindingPoint,
    ),
    segment =
      p.ledLayout.segments.find((t) => t.id === b?.segmentId) ??
      p.ledLayout.segments[0],
    led = b && ledFor(p, b.segmentId, b.ledId),
    h = s.holes[bindingPoint],
    ring = symbolCenters(p, s)[bindingPoint];
  root.innerHTML = `<h2>Fysisk LED-binding</h2><label>Stasjonspunkt<select id="bind-point">${Array.from({ length: s.points }, (_, i) => `<option value="${i}">Punkt ${String.fromCharCode(65 + i)}</option>`).join("")}</select></label><p class="note" id="binding-summary">${b ? `${esc(segment?.name ?? b.segmentId)} · LED ${led?.index ?? "mangler"} · ${esc(led?.controllerId ?? "")} / ${esc(led?.chainId ?? "")} · ${b.mode === "direct" ? "direkte" : "lysleder"}${b.shared ? " · bevisst delt" : ""}` : "Ingen fysisk LED-binding"}</p><label>Monteringsmåte<select id="bind-mode"><option value="direct">Direkte belysning</option><option value="lightguide">Lysleder / fiberoptikk</option></select></label><label>Segment<select id="bind-segment">${p.ledLayout.segments.map((t) => `<option value="${esc(t.id)}">${esc(t.name)} · ${esc(t.chainId)}</option>`).join("")}</select></label><label>Fysisk LED-indeks<select id="bind-led"></select></label><div class="pair"><label>Stoppintervall<select id="bind-interval"><option value="1">Hver LED</option><option value="2">Annenhver LED</option><option value="3">Hver tredje LED</option><option value="4">Hver fjerde LED</option><option value="custom">Egendefinert indeks</option></select></label><button id="bind-next">Neste LED</button></div><p class="note" id="binding-users"></p><label><input type="checkbox" id="bind-share">Bevisst deling av samme fysiske LED</label><div class="pair"><button id="bind-click">Velg LED på tavlen</button><button id="bind-apply">Koble valgt LED</button></div><button id="bind-remove">Løsne binding</button>${h ? `<details><summary>Frontpunkt og lyslederforskyvning</summary><p class="note">${led ? `LED: ${led.x.toFixed(4)}, ${led.y.toFixed(4)} mm. Forskyvning til hull: ${(h.x - led.x).toFixed(4)}, ${(h.y - led.y).toFixed(4)} mm.` : "Ubundet frontpunkt."}</p><div class="pair">${field("front-hole-x", "Hull X, mm", h.x)}${field("front-hole-y", "Hull Y, mm", h.y)}</div><div class="pair">${field("front-ring-x", "Ring X, mm", ring.x)}${field("front-ring-y", "Ring Y, mm", ring.y)}</div>${field("front-diameter", "Hulldiameter, mm", h.diameter ?? s.holeDiameter)}<button id="front-save">Oppdater lysleder-frontpunkt</button></details>` : ""}`;
  $("bind-point").value = bindingPoint;
  $("bind-point").onchange = (e) => {
    bindingPoint = +e.target.value;
    if ($("station-snap-point")) $("station-snap-point").value = bindingPoint;
    renderBindings(p, s);
  };
  $("bind-mode").value = b?.mode ?? "direct";
  $("bind-segment").value = segment?.id ?? "";
  const users = () => {
    const other = p.ledLayout.bindings.filter(
      (t) =>
        t.ledId === $("bind-led").value &&
        !(t.stationId === s.id && t.pointIndex === bindingPoint),
    );
    $("binding-users").textContent = other.length
      ? "Allerede brukt av: " +
        other
          .map(
            (t) =>
              p.layout.stations.find((s) => s.id === t.stationId)?.name ??
              t.stationId,
          )
          .join(", ")
      : "LED-en er ledig.";
  };
  const list = () => {
    const seg = p.ledLayout.segments.find(
      (t) => t.id === $("bind-segment").value,
    );
    $("bind-led").innerHTML = seg
      ? ledPositions(p, seg)
          .map(
            (l) =>
              `<option value="${esc(l.id)}">${l.index} · ${l.x.toFixed(3)}, ${l.y.toFixed(3)} mm</option>`,
          )
          .join("")
      : "";
    if (b && b.segmentId === seg?.id) $("bind-led").value = b.ledId;
    else if (
      bindingCursor &&
      seg &&
      bindingCursor.segmentId === seg.id &&
      ledFor(p, seg.id, bindingCursor.ledId)
    )
      $("bind-led").value = bindingCursor.ledId;
    users();
  };
  $("bind-segment").onchange = list;
  $("bind-led").onchange = () => {
    bindingCursor = {
      segmentId: $("bind-segment").value,
      ledId: $("bind-led").value,
    };
    users();
  };
  list();
  $("bind-interval").value = String(stopInterval);
  $("bind-interval").onchange = (e) => {
    stopInterval = e.target.value === "custom" ? "custom" : +e.target.value;
  };
  $("bind-next").onclick = () => {
    if (stopInterval === "custom") {
      message("Velg ønsket LED-indeks direkte i listen.");
      return;
    }
    const selector = $("bind-led"),
      next = selector.selectedIndex + stopInterval;
    if (next >= selector.options.length) {
      message("Intervallet går utenfor segmentet.");
      return;
    }
    selector.selectedIndex = next;
    bindingCursor = {
      segmentId: $("bind-segment").value,
      ledId: selector.value,
    };
    users();
  };
  const request = () => ({
    stationId: s.id,
    pointIndex: bindingPoint,
    segmentId: $("bind-segment").value,
    ledId: $("bind-led").value,
    mode: $("bind-mode").value,
    share: $("bind-share").checked,
  });
  $("bind-apply").onclick = () =>
    safe(() => commit(bindPoint(project(), request())));
  $("bind-click").onclick = () => {
    if (p.layers.bindings.locked) {
      message("Bindinglaget er låst");
      return;
    }
    bindTarget = request();
    $("led-panel").hidden = true;
    mutate((q) => {
      q.layers.leds.visible = true;
      q.layers.strips.visible = true;
      q.layers.bindings.visible = true;
    });
    canvas.focus();
    message(
      "Klikk fysisk LED for " +
        s.name +
        " punkt " +
        (bindingPoint + 1) +
        " · Escape avbryter",
    );
  };
  $("bind-remove").disabled = !b;
  $("bind-remove").onclick = () =>
    safe(() => commit(unbindPoint(project(), s.id, bindingPoint)));
  if (h) {
    $("front-save").disabled =
      b?.mode !== "lightguide" ||
      p.layers.holes.locked ||
      p.layers.rings.locked;
    $("front-save").onclick = () =>
      safe(() =>
        commit(
          setFrontPoint(project(), s.id, bindingPoint, {
            holeX: numeric("front-hole-x"),
            holeY: numeric("front-hole-y"),
            ringX: numeric("front-ring-x"),
            ringY: numeric("front-ring-y"),
            diameter: numeric("front-diameter"),
          }),
        ),
      );
  }
}
$("physical-cancel").onclick = () => {
  $("physical-dialog").close();
  pendingPhysical = null;
  render();
};
$("physical-dialog").addEventListener("cancel", () => {
  pendingPhysical = null;
  render();
});
$("physical-confirm").onclick = () =>
  safe(() => {
    const proposal = pendingPhysical;
    pendingPhysical = null;
    $("physical-dialog").close();
    commit(proposal.project, { approved: true });
  });

$("trondheim-demo").onclick = () => {
  $("snap-led").checked = true;
  $("snap-led-bind").checked = true;
  selected = [];
  selectedRoute = null;
  pendingStation = null;
  pendingStrip = null;
  bindTarget = null;
  setTool("select");
  commit(trondheimPrototype(), { load: true });
  fit();
};
