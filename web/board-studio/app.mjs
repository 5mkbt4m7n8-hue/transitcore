import { holeCenters, symbolCenters, edgeGeometry, geometryReport } from "./geometry.mjs";
import {
  createProject,
  parseProject,
  serialize,
  History,
  copy,
  LAYERS,
  esc,
  layerMarkup,
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
  selectedRoute = null;
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
function commit(p) {
  history.commit(p);
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
function snapped(pt, p = project()) {
  if (!$("snap").checked) return pt;
  const step = +$("grid-step").value;
  const out = {
    x: Math.round(pt.x / step) * step,
    y: Math.round(pt.y / step) * step,
  };
  for (const axis of ["x", "y"]) {
    const candidates = [
      ...p.layout.guides.filter((g) => g.axis === axis).map((g) => g.value),
      ...p.layout.stations
        .filter((s) => !selected.includes(s.id))
        .map((s) => s[axis]),
    ];
    const closest = candidates.sort(
      (a, b) => Math.abs(a - pt[axis]) - Math.abs(b - pt[axis]),
    )[0];
    if (closest !== undefined && Math.abs(closest - pt[axis]) < 4 / zoom)
      out[axis] = closest;
  }
  return out;
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
  const grid = +$("grid-step").value;
  let gs = grid;
  while (gs * zoom < 8) gs *= 2;
  const guides = p.layers.guides.visible;
  const gridMarkup =
    $("grid").checked && guides
      ? `<defs><pattern id="grid-pattern" width="${gs}" height="${gs}" patternUnits="userSpaceOnUse"><path d="M ${gs} 0 H 0 V ${gs}" fill="none" stroke="#9eafa0" stroke-width="${0.4 / zoom}" opacity=".26"/></pattern></defs><rect width="${b.width}" height="${b.height}" fill="url(#grid-pattern)" pointer-events="none"/>`
      : "";
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
  if (measure) {
    const { a, b: c } = measure;
    overlay += `<path d="M ${a.x} ${a.y} L ${c.x} ${c.y}" stroke="#b8893b" fill="none" stroke-width="${1.5 / zoom}"/><text x="${(a.x + c.x) / 2}" y="${(a.y + c.y) / 2 - 3 / zoom}" font-size="${12 / zoom}" fill="#946419">${Math.hypot(a.x - c.x, a.y - c.y).toFixed(2)} mm</text>`;
  }
  const gl = guides
    ? p.layout.guides
        .map(
          (g) =>
            `<path d="${g.axis === "x" ? `M ${g.value} 0 V ${b.height}` : `M 0 ${g.value} H ${b.width}`}" stroke="#6cabb2" stroke-width="${0.8 / zoom}" stroke-dasharray="${4 / zoom} ${3 / zoom}"/>`,
        )
        .join("")
    : "";
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
    .join("")}${marks}${overlay}</g><g pointer-events="none">${rulers}</g>`;
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
  $("zoom").textContent = `${Math.round(zoom * 100)}%`;
}
const field = (id, label, value, type = "number", attrs = "") =>
  `<label>${label}<input id="${id}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
function properties() {
  const p = project(),
    s = p.layout.stations.find((s) => s.id === selected[0]),
    panel = $("properties");
  if (selectedRoute) {
    routeProperties();
    return;
  }
  if (!s) {
    panel.innerHTML =
      '<h2>Egenskaper <span>02</span></h2><p class="note">Velg en stasjon på tavlen for presis plassering. S legger til en stasjon, L kobler stasjoner.</p>';
    return;
  }
  panel.innerHTML = `<h2>${selected.length > 1 ? selected.length + " stasjoner" : "Stasjon"} <span>02</span></h2>${field("station-name", "Navn", s.name, "text")}<div class="pair">${field("station-x", "X, mm", s.x, "number", 'step="0.1"')}${field("station-y", "Y, mm", s.y, "number", 'step="0.1"')}</div><div class="pair">${field("ring-outer", "Ytterring Ø, mm", s.ringOuter, "number", 'min="0.1" step="0.1"')}${field("ring-inner", "Innerring Ø, mm", s.ringInner, "number", 'min="0.1" step="0.1"')}</div><div class="pair">${field("hole-diameter", "Hull Ø, mm", s.holeDiameter, "number", 'min="0.1" step="0.1"')}${field("ring-stroke", "Ringstrek, mm", s.stroke, "number", 'min="0.01" step="0.01"')}</div><h2>Symbol og kapsel</h2><div class="pair">${field("symbol-points", "Antall punkter", s.points, "number", 'min="1" max="8" step="1"')}${field("symbol-spacing", "Punktavstand, mm", s.pointSpacing, "number", 'min="0.1" step="0.1"')}</div><div class="pair">${field("symbol-padding", "Kapselmarg, mm", s.capsulePadding, "number", 'min="0" step="0.1"')}${field("symbol-stroke", "Kapselstrek, mm", s.capsuleStroke, "number", 'min="0.01" step="0.01"')}</div><div class="pair">${field("symbol-angle", "Vinkel, ° (tom = auto)", s.symbolAngle ?? "", "number", 'min="-360" max="360"')}${field("symbol-bias", "Asymmetri (−0,5–0,5)", s.splitBias, "number", 'min="-0.5" max="0.5" step="0.1"')}</div><div class="pair"><label>Ringer<select id="symbol-double"><option value="true">Dobbel ring</option><option value="false">Enkel ring</option></select></label>${field("symbol-color", "Ringfarge", s.ringColor, "color")}</div><button id="align-holes">Tilpass hull til symbolet</button><p class="note">Grafisk rotasjon flytter ikke fysiske hull. Tilpass hull eksplisitt ved behov.</p><h2>Stasjonsnavn</h2><div class="pair">${field("label-dx", "Forskyvning X, mm", s.label.dx)}${field("label-dy", "Forskyvning Y, mm", s.label.dy)}</div><div class="pair">${field("label-angle", "Rotasjon, °", s.label.angle)}${field("label-size", "Tekststørrelse, mm", s.label.size, "number", 'step="0.1" min="0.1"')}</div><div class="pair">${field("label-spacing", "Bokstavavstand, mm", s.label.spacing, "number", 'step="0.1"')}<label>Justering<select id="label-anchor"><option value="start">Venstre</option><option value="middle">Midtstilt</option><option value="end">Høyre</option></select></label></div><label>Skrift<select id="label-font"><option>Arial</option><option>Verdana</option><option>Georgia</option><option>monospace</option></select></label><label>Skriftvekt<select id="label-weight"><option>400</option><option>600</option><option>700</option></select></label><p class="note">${selected.length > 1 ? "X/Y flytter hele utvalget. Andre felt endrer første stasjon." : "Navn og ring er uavhengige av hulldiameteren."}</p>`;
  const physical=holeCenters(p,s),graphic=symbolCenters(p,s),mismatch=physical.length!==graphic.length||physical.some((h,i)=>!graphic[i]||Math.hypot(h.x-graphic[i].x,h.y-graphic[i].y)>.01);
  if(mismatch)panel.insertAdjacentHTML('afterbegin','<p class="warning">Grafikk og hull er forskjøvet. Hullsentrene er beholdt.</p>');
  $('align-holes').disabled=p.layers.holes.locked;$('align-holes').onclick=()=>mutate(q=>{const target=q.layout.stations.find(t=>t.id===s.id);target.holes=symbolCenters(q,target).map((c,i)=>({id:target.holes[i]?.id??`${target.id}:hole:${i}`,x:c.x,y:c.y}));});
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
      safe(() =>
        mutate(
          (q) =>
            (q.layout.stations.find((t) => t.id === s.id)[key] = text
              ? e.target.value
              : +e.target.value),
        ),
      );
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
}
function routeProperties() {
  const p = project(),
    r = p.layout.routes.find((r) => r.id === selectedRoute);
  if (!r) {
    selectedRoute = null;
    return properties();
  }
  const warnings = Array.from(
    { length: r.stationIds.length - 1 },
    (_, i) => edgeGeometry(p, r, i).warnings,
  ).flat();
  const panel = $("properties");
  panel.innerHTML = `<h2>Trasé <span>02</span></h2>${warnings.length ? `<p class="warning">${esc([...new Set(warnings)].join(". "))}</p>` : ""}<label>Grafisk sporantall<select id="route-tracks"><option value="1">Enkeltspor</option><option value="2">Dobbeltspor</option></select></label><div class="pair">${field("route-spacing", "Sporavstand, mm", r.trackSpacing)}${field("route-stroke", "Linjebredde, mm", r.stroke, "number", 'step="0.01"')}</div><div class="pair">${field("route-length", "Overgangslengde, mm", r.transitionLength)}${field("route-tension", "Kurveform (0,05–0,95)", r.tension, "number", 'step="0.05"')}</div><label>Delstrekning<select id="route-edge">${r.stationIds
    .slice(0, -1)
    .map(
      (id, i) =>
        `<option value="${i}">${esc(p.layout.stations.find((s) => s.id === id).name)} → ${esc(p.layout.stations.find((s) => s.id === r.stationIds[i + 1]).name)}</option>`,
    )
    .join(
      "",
    )}</select></label><div class="pair">${field("bend-x", "Knekkpunkt X, mm", "")}${field("bend-y", "Knekkpunkt Y, mm", "")}</div><div class="pair">${field("route-radius", "Hjørneradius, mm", r.cornerRadius)}<button id="bend-save">Sett knekkpunkt</button></div><button id="bend-clear">Rett delstrekning</button><button id="edge-track">Skill ut delstrekning</button><p class="note">Velg en trasélinje på tavlen. Stasjonssymboler har eget punktantall. Radius gjelder knekkpunktet, med geometrisk parallelle spor. For kort strekning begrenser radiusen.</p>`;
  $("route-tracks").value = r.tracks;
  const map = {
    "route-tracks": "tracks",
    "route-spacing": "trackSpacing",
    "route-stroke": "stroke",
    "route-length": "transitionLength",
    "route-tension": "tension",
    "route-radius": "cornerRadius",
  };
  for (const [id, key] of Object.entries(map)) {
    $(id).disabled = p.layers.routes.locked || p.layers.capsules.locked;
    $(id).onchange = (e) =>
      safe(() =>
        mutate(
          (q) =>
            (q.layout.routes.find((t) => t.id === r.id)[key] = +e.target.value),
        ),
      );
  }
  const setBend = () => {
    const edge = +$("route-edge").value,
      b = r.bends[edge];
    $("bend-x").value = b?.x ?? "";
    $("bend-y").value = b?.y ?? "";
  };
  $("route-edge").onchange = setBend;
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
    mutate((q) => {
      const index = q.layout.routes.findIndex((t) => t.id === r.id),
        parts = [];
      for (let i = 0; i < r.stationIds.length - 1; i++) {
        const part = {
          ...copy(r),
          id: crypto.randomUUID(),
          stationIds: r.stationIds.slice(i, i + 2),
          bends: r.bends[i] ? { 0: copy(r.bends[i]) } : {},
          controls:r.controls[i]?{0:copy(r.controls[i])}:{},
        };
        parts.push(part);
        if (i === edge) selectedRoute = part.id;
      }
      q.layout.routes.splice(index, 1, ...parts);
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
  properties();
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
  tool = next;
  routeStart = null;
  document
    .querySelectorAll("[data-tool]")
    .forEach((b) => b.classList.toggle("active", b.dataset.tool === tool));
  canvas.style.cursor =
    tool === "hand" ? "grab" : tool === "select" ? "default" : "crosshair";
  message(
    {
      select: "Velg eller dra en stasjon",
      station: "Klikk på tavlen for å legge til en stasjon",
      route: "Klikk på to stasjoner for å koble dem",
      measure: "Dra en målelinje",
      hand: "Dra for å panorere",
    }[tool],
  );
}
canvas.onpointerdown = (e) => {
  if (e.button !== 0 && e.button !== 1) return;
  e.preventDefault();
  canvas.focus();
  canvas.setPointerCapture(e.pointerId);
  const a = xy(e),
    target = e.target.closest("[data-station],[data-label]"),
    id = target?.dataset.station || target?.dataset.label,
    p = project();
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
    const pt = snapped(a);
    if (pt.x < 0 || pt.y < 0 || pt.x > p.board.width || pt.y > p.board.height)
      return;
    const s = copy(createProject().layout.stations[0]);
    s.id = crypto.randomUUID();
    s.name = "Ny stasjon";
    s.x = pt.x;
    s.y = pt.y;
    s.holes=[{id:`${s.id}:hole:0`,x:s.x,y:s.y}];
    s.label.dx = 9;
    s.label.dy = 0;
    s.label.anchor = "start";
    selected = [s.id];
    mutate((q) => q.layout.stations.push(s));
    return;
  }
  if (tool === "route" && id) {
    if (
      ["routes", "rings", "holes", "capsules"].some((id) => p.layers[id].locked)
    ) {
      message("Lås opp berørte lag før tilkobling");
      return;
    }
    if (!routeStart) {
      routeStart = id;
      message("Velg neste stasjon");
    } else if (routeStart !== id) {
      mutate((q) =>
        q.layout.routes.push({
          id: crypto.randomUUID(),
          stationIds: [routeStart, id],
          stroke: 0.18,
        }),
      );
      routeStart = id;
      message("Koblet · velg neste stasjon eller trykk V");
    }
    return;
  }
  if (tool !== "select") return;
  const routeTarget = e.target.closest("[data-route]");
  if (routeTarget && !id) {
    selected = [];
    selectedRoute = routeTarget.dataset.route;
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
    gesture = {
      kind: label ? "label" : "move",
      id,
      start: a,
      base: copy(p),
      moved: false,
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
    const s = g.base.layout.stations.find((s) => s.id === g.id),
      end = snapped(
        { x: s.x + pt.x - g.start.x, y: s.y + pt.y - g.start.y },
        g.base,
      );
    g.preview = moveStations(g.base, selected, end.x - s.x, end.y - s.y);
    g.moved = true;
    draw(g.preview);
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
for (const id of ["grid", "grid-step", "snap"]) $(id).onchange = () => draw();
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
        const controls={};for(let i=0;i<ids.length-1;i++){const old=r.stationIds.indexOf(ids[i]);if(r.stationIds[old+1]===ids[i+1]&&r.controls[old])controls[i]=copy(r.controls[old]);}
        return { ...r, stationIds: ids, bends,controls };
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
    commit(p);
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
    commit(createProject(demo));
    fit();
  };
document.onkeydown = (e) => {
  if (e.target.closest("input,select,textarea,dialog")) return;
  if (e.code === "Space") {
    e.preventDefault();
    space = true;
    return;
  }
  if (e.key === "Escape") {
    finishGesture(true);
    routeStart = null;
    setTool("select");
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    $(e.shiftKey ? "redo" : "undo").click();
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
