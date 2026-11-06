import { validatePoints, pointStyle } from "./point-style.mjs";
import { validateMounting, mountingMarkup } from "./mounting.mjs";
import { productionSettings } from "./production-settings.mjs";
import { validatePorts } from "./ports.mjs";
import { validateBindings, bindingMarkup } from "./bindings.mjs";
import { validateLedLayout, physicalMarkup } from "./led-layout.mjs";
import { validateParallels, enforceParallels } from "./parallel.mjs";
import { fromTemplate, STATION_DEFAULTS } from "./stations.mjs";
import {
  holeCenters,
  symbolCenters,
  initializeGeometry,
  geometryReport,
  symbolNormal,
  edgeGeometry,
  cubic,
} from "./geometry.mjs";
// Canonical physical coordinates: millimetres. No screen/DPI conversions here.
export const FORMAT = "intransit-board";
export const LAYERS = [
  ["routes", "Traséer"],
  ["rings", "Stasjonsringer"],
  ["capsules", "Kapsler og overganger"],
  ["names", "Stasjonsnavn"],
  ["leds", "Fysiske LED-posisjoner"],
  ["holes", "Hull og boremarkeringer"],
  ["mounting", "Monteringshull"],
  ["bindings", "LED-bindinger"],
  ["strips", "Stripesegmenter"],
  ["outline", "Tavlekontur og montering"],
  ["guides", "Rutenett og hjelpelinjer"],
];
export const copy = (x) => structuredClone(x);
export const esc = (x) =>
  String(x).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
export function createProject(demo = true) {
  const names = [
    "Ila",
    "Bergsli gate",
    "Nyveibakken",
    "Bygrensen",
    "Belvedere",
    "Breidablikk",
    "Nordre Hoem",
    "Søndre Hoem",
    "Rognheim",
    "Munkvoll",
    "Ferstad",
    "Ugla",
    "Kyvannet",
    "Vestmarka",
    "Herlofsenløypa",
    "Lian",
  ];
  const coords = [
    [198, 42],
    [204, 72],
    [214, 102],
    [220, 132],
    [230, 162],
    [234, 192],
    [242, 222],
    [248, 252],
    [224, 286],
    [198, 298],
    [156, 306],
    [134, 286],
    [108, 268],
    [72, 272],
    [54, 298],
    [34, 326],
  ];
  const stations = demo
    ? names.map((name, i) => ({
        id: `station-${i + 1}`,
        name: name.toUpperCase(),
        x: coords[i][0],
        y: coords[i][1],
        ringOuter: 6,
        ringInner: 4.6,
        stroke: 0.18,
        holeDiameter: 2.5,
        label: {
          dx: i === 0 ? -9 : [5, 6, 7].includes(i) ? -12 : i >= 9 ? -9 : 12,
          dy: i === 0 ? -9 : i >= 9 ? 10 : 0,
          angle: 0,
          size: 4.1,
          spacing: 0.4,
          weight: 600,
          font: "Arial",
          anchor: i >= 9 || [5, 6, 7].includes(i) ? "end" : "start",
        },
        source: null,
        points: [1, 3, 5, 6, 9, 11, 15].includes(i) ? 2 : 1,
        pointSpacing: 10,
        symbolAngle: null,
        splitBias: 0,
        capsulePadding: 1,
        capsuleStroke: 0.18,
        ringColor: "#555555",
        doubleRing: true,
        ...STATION_DEFAULTS,
      }))
    : [];
  return initializeGeometry({
    format: FORMAT,
    version: 4,
    id: demo ? "grakallbanen-board" : crypto.randomUUID(),
    title: demo ? "Gråkallbanen · studie 01" : "Ny tavle",
    network: { stations: [], routes: [] },
    schematic: null,
    board: { width: 300, height: 400, material: "general", thickness: 3 },
    layers: Object.fromEntries(
      LAYERS.map(([id]) => [
        id,
        {
          visible: !["leds", "holes", "strips"].includes(id),
          locked: false,
          export: id !== "guides",
        },
      ]),
    ),
    layout: {
      stations,
      routes: demo
        ? [
            {
              id: "route-1",
              stationIds: stations.map((s) => s.id),
              stroke: 0.18,
              tracks: 1,
              trackSpacing: 10,
              transitionLength: 12,
              tension: 0.5,
              cornerRadius: 8,
              bends: {},
            },
          ]
        : [],
      guides: [],
      parallelConstraints: [],
    },
    ledLayout: { profiles: [], segments: [], bindings: [] },
    library: { templates: [] },
    production: { profiles: [], mountingHoles: [] },
  });
}
const num = (n, min, max) =>
  typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
export function parseProject(input) {
  const p = typeof input === "string" ? JSON.parse(input) : copy(input);
  if (p?.format !== FORMAT || ![1, 2, 3, 4].includes(p.version))
    throw Error(
      "Ukjent prosjektformat eller versjon. Originalfilen er ikke endret.",
    );
  if (!num(p.board?.width, 20, 5000) || !num(p.board?.height, 20, 5000))
    throw Error("Tavlemål må være 20–5000 mm.");
  if (
    typeof p.id !== "string" ||
    typeof p.title !== "string" ||
    p.title.length > 1000
  )
    throw Error("Ugyldig tavle-ID eller prosjektnavn.");
  if (
    !Array.isArray(p.layout?.stations) ||
    p.layout.stations.length > 5000 ||
    !Array.isArray(p.layout.routes) ||
    p.layout.routes.length > 5000
  )
    throw Error("Ugyldig layout.");
  for (const s of p.layout.stations) {
    Object.assign(s, {
      ...Object.fromEntries(
        Object.entries(STATION_DEFAULTS).map(([k, v]) => [k, s[k] ?? v]),
      ),
      points: s.points ?? 1,
      pointSpacing: s.pointSpacing ?? 10,
      symbolAngle: s.symbolAngle ?? null,
      splitBias: s.splitBias ?? 0,
      capsulePadding: s.capsulePadding ?? 1,
      capsuleStroke: s.capsuleStroke ?? 0.18,
      ringColor: s.ringColor ?? "#555555",
      doubleRing: s.doubleRing ?? true,
    });
  }
  for (const r of p.layout.routes)
    Object.assign(r, {
      tracks: r.tracks ?? 1,
      trackSpacing: r.trackSpacing ?? 10,
      transitionLength: r.transitionLength ?? 12,
      tension: r.tension ?? 0.5,
      cornerRadius: r.cornerRadius ?? 8,
      bends: r.bends ?? {},
    });
  const ids = new Set();
  for (const s of p.layout.stations) {
    if (
      typeof s.id !== "string" ||
      ids.has(s.id) ||
      typeof s.name !== "string" ||
      !num(s.x, -5000, 10000) ||
      !num(s.y, -5000, 10000) ||
      !num(s.ringOuter, 0.1, 100) ||
      !num(s.ringInner, 0, 100) ||
      !num(s.holeDiameter, 0.1, 100) ||
      !num(s.stroke, 0.01, 10) ||
      !s.label ||
      !num(s.label.dx, -5000, 5000) ||
      !num(s.label.dy, -5000, 5000) ||
      !num(s.label.angle, -360, 360) ||
      !num(s.label.size, 0.1, 100) ||
      !num(s.label.spacing, -10, 100) ||
      !["start", "middle", "end"].includes(s.label.anchor) ||
      typeof s.label.font !== "string" ||
      !num(s.label.weight, 100, 900)
    )
      throw Error("Ugyldig stasjon eller etikett.");
    if (
      !Number.isInteger(s.points) ||
      !num(s.points, 1, 8) ||
      !num(s.pointSpacing, 0.1, s.ringCenters ? 10000 : 100) ||
      !(s.symbolAngle === null || num(s.symbolAngle, -360, 360)) ||
      !num(s.splitBias, -0.5, 0.5) ||
      !num(s.capsulePadding, 0, 20) ||
      !num(s.capsuleStroke, 0.01, 10) ||
      !/^#[0-9a-f]{6}$/i.test(s.ringColor) ||
      typeof s.doubleRing !== "boolean"
    )
      throw Error("Ugyldige symbolmål.");
    ids.add(s.id);
  }
  const routeIds = new Set();
  for (const r of p.layout.routes) {
    if (routeIds.has(r.id)) throw Error("Duplisert trasé-ID.");
    routeIds.add(r.id);
  }
  for (const r of p.layout.routes)
    if (
      typeof r.id !== "string" ||
      !num(r.stroke, 0.01, 10) ||
      !Array.isArray(r.stationIds) ||
      r.stationIds.some((id) => !ids.has(id))
    )
      throw Error("Ugyldig traséreferanse.");
  for (const r of p.layout.routes)
    if (
      ![1, 2].includes(r.tracks) ||
      !num(r.trackSpacing, 0.1, 100) ||
      !num(r.transitionLength, 0.1, 100) ||
      !num(r.tension, 0.05, 0.95) ||
      !num(r.cornerRadius, 0, 100)
    )
      throw Error("Ugyldig sporgeometri.");
  for (const r of p.layout.routes) {
    if (!r.bends || typeof r.bends !== "object" || Array.isArray(r.bends))
      throw Error("Ugyldige knekkpunkter.");
    for (const [i, b] of Object.entries(r.bends))
      if (
        !/^\d+$/.test(i) ||
        +i >= r.stationIds.length - 1 ||
        !num(b.x, -5000, 10000) ||
        !num(b.y, -5000, 10000)
      )
        throw Error("Ugyldig knekkpunkt.");
  }
  p.layers.mounting ??= { visible: true, locked: false, export: true };
  p.layers.bindings ??= { visible: false, locked: false, export: false };
  for (const [id] of LAYERS)
    if (
      !p.layers?.[id] ||
      ["visible", "locked", "export"].some(
        (k) => typeof p.layers[id][k] !== "boolean",
      )
    )
      throw Error("Ugyldig lagstruktur.");
  if (
    !Array.isArray(p.layout.guides) ||
    p.layout.guides.some(
      (g) => !["x", "y"].includes(g.axis) || !num(g.value, 0, 5000),
    )
  )
    throw Error("Ugyldige hjelpelinjer.");
  if (!p.network || !p.ledLayout || !p.production)
    throw Error("Prosjektet mangler dataområder.");
  validateMounting(p);
  if (p.production.exportSettings)
    productionSettings(p.production.exportSettings);
  p.version = 4;
  validateLedLayout(p);
  validateBindings(p);
  initializeGeometry(p);
  p.library ??= { templates: [] };
  if (!Array.isArray(p.library.templates) || p.library.templates.length > 200)
    throw Error("Ugyldig symbolbibliotek.");
  for (const s of p.layout.stations) {
    validatePoints(s);
    if (
      !["none", "stadium", "rounded-box"].includes(s.capsuleType) ||
      !num(s.markerAngle, -360, 360) ||
      !num(s.markerDx, -5000, 5000) ||
      !num(s.markerDy, -5000, 5000) ||
      !num(s.capsuleExtraWidth, 0, 100) ||
      !num(s.capsuleExtraHeight, 0, 100) ||
      typeof s.allowShared !== "boolean" ||
      typeof s.symbolKind !== "string" ||
      !(s.transitionLength === null || num(s.transitionLength, 0.1, 100))
    )
      throw Error("Ugyldig symbolstil.");
    if (
      s.ringCenters &&
      (!Array.isArray(s.ringCenters) ||
        s.ringCenters.length !== s.points ||
        s.ringCenters.some(
          (c) => !num(c.x, -5000, 10000) || !num(c.y, -5000, 10000),
        ))
    )
      throw Error("Ugyldige grafiske ringsentre.");
  }
  for (const st of p.layout.stations) {
    if (
      !Array.isArray(st.holes) ||
      st.holes.length > 8 ||
      st.holes.some(
        (h) =>
          typeof h.id !== "string" ||
          (h.enabled !== undefined && typeof h.enabled !== "boolean") ||
          !num(h.x, -5000, 10000) ||
          !num(h.y, -5000, 10000) ||
          (h.diameter !== undefined && !num(h.diameter, 0.1, 100)),
      )
    )
      throw Error("Ugyldige fysiske hullsentre.");
  }
  for (const r of p.layout.routes) {
    if (
      !Array.isArray(r.trackIds) ||
      r.trackIds.length !== 2 ||
      r.trackIds.some((id) => typeof id !== "string") ||
      new Set(r.trackIds).size !== 2 ||
      !num(r.autoGrow, 0, 48) ||
      !r.portSigns ||
      !r.controls
    )
      throw Error("Ugyldige sporidentiteter eller kontroller.");
    for (const id of r.stationIds)
      if (![-1, 1].includes(r.portSigns[id]))
        throw Error("Ugyldig portreferanse.");
    for (const [i, c] of Object.entries(r.controls))
      if (
        !/^\d+$/.test(i) ||
        +i >= r.stationIds.length - 1 ||
        !num(c.startReach, 0.1, 5000) ||
        !num(c.endReach, 0.1, 5000) ||
        (c.shape &&
          (!num(c.shape.x, -5000, 10000) || !num(c.shape.y, -5000, 10000))) ||
        (c.shapeAngle !== undefined && !num(c.shapeAngle, -360, 360)) ||
        (c.shapeReach !== undefined && !num(c.shapeReach, 0.1, 5000))
      )
        throw Error("Ugyldig kurvekontroll.");
  }
  if (p.layout.tangentHints) {
    for (const [id, t] of Object.entries(p.layout.tangentHints))
      if (
        !p.layout.stations.some((s) => s.id === id) ||
        !num(t.x, -1, 1) ||
        !num(t.y, -1, 1) ||
        Math.abs(Math.hypot(t.x, t.y) - 1) > 1e-6
      )
        throw Error("Ugyldig geometriretning.");
  }
  for (const r of p.layout.routes)
    if (r.parentRouteId !== undefined && typeof r.parentRouteId !== "string")
      throw Error("Ugyldig overordnet rute-ID.");
  if (p.routeDefaults) {
    const d = p.routeDefaults;
    if (
      ![1, 2].includes(d.tracks) ||
      !num(d.trackSpacing, 0.1, 100) ||
      !num(d.stroke, 0.01, 10) ||
      !num(d.transitionLength, 0.1, 100) ||
      !num(d.tension, 0.05, 0.95) ||
      !num(d.cornerRadius, 0, 100) ||
      !num(d.autoGrow, 0, 48) ||
      (d.curveStyle !== undefined &&
        !["straight", "rounded"].includes(d.curveStyle))
    )
      throw Error("Ugyldig standard for nye forbindelser.");
  }
  validatePorts(p);
  p.layout.parallelConstraints ??= [];
  validateParallels(p, true);
  for (const record of p.library.templates) {
    if (
      typeof record.id !== "string" ||
      typeof record.name !== "string" ||
      typeof record.category !== "string"
    )
      throw Error("Ugyldig symbolmal.");
    validateTemplate(record.template);
  }
  if (p.stationTemplate) validateTemplate(p.stationTemplate);
  function validateTemplate(template) {
    if (template?.version !== 1) throw Error("Ugyldig stasjonsmal.");
    const temp = fromTemplate(template, { x: 0, y: 0 }, "template-validation");
    parseProject({
      ...p,
      stationTemplate: null,
      library: { templates: [] },
      ledLayout: { profiles: [], segments: [], bindings: [] },
      layout: {
        stations: [temp],
        routes: [],
        guides: [],
        parallelConstraints: [],
      },
    });
  }
  return p;
}
export function serialize(p) {
  return JSON.stringify(parseProject(p), null, 2);
}
export function moveStations(p, ids, dx, dy) {
  const q = copy(p);
  if (
    q.layers.rings.locked ||
    q.layers.holes.locked ||
    q.layers.capsules.locked ||
    q.layers.routes.locked ||
    q.layers.names.locked
  )
    return q;
  if (q.layout.tangentHints) {
    const affected = new Set(ids);
    for (const r of q.layout.routes)
      for (let i = 0; i < r.stationIds.length; i++)
        if (ids.includes(r.stationIds[i]))
          for (const id of r.stationIds.slice(Math.max(0, i - 1), i + 2))
            affected.add(id);
    for (const id of affected)
      if (!q.layout.routes.some((r) => r.anchors && r.stationIds.includes(id)))
        delete q.layout.tangentHints[id];
  }
  for (const s of q.layout.stations)
    if (ids.includes(s.id)) {
      s.x += dx;
      s.y += dy;
      for (const c of s.ringCenters ?? []) {
        c.x += dx;
        c.y += dy;
      }
      for (const h of s.holes ?? []) {
        h.x += dx;
        h.y += dy;
      }
    }
  return q;
}
export class History {
  constructor(p) {
    this.value = parseProject(p);
    this.past = [];
    this.future = [];
  }
  commit(p) {
    p = parseProject(enforceParallels(p));
    if (JSON.stringify(this.value) === JSON.stringify(p)) return;
    this.past.push(copy(this.value));
    if (this.past.length > 100) this.past.shift();
    this.value = copy(p);
    this.future = [];
  }
  undo() {
    if (this.past.length) {
      this.future.push(this.value);
      this.value = this.past.pop();
    }
    return this.value;
  }
  redo() {
    if (this.future.length) {
      this.past.push(this.value);
      this.value = this.future.pop();
    }
    return this.value;
  }
}
export function routeMarkup(p, transitions = false) {
  return p.layout.routes
    .map((r) =>
      Array.from({ length: Math.max(0, r.stationIds.length - 1) }, (_, i) => {
        const g = edgeGeometry(p, r, i);
        return g.paths
          .filter((c) => {
            const stationId =
                c.part === "start" ? r.stationIds[i] : r.stationIds[i + 1],
              count =
                p.layout.stations.find((s) => s.id === stationId)?.points ?? 1,
              isTransition = c.part !== "core" && (r.tracks === 2 || count > 1);
            return transitions === isTransition;
          })
          .map(
            (c) =>
              `<path data-route="${esc(r.id)}" data-part="${c.part}" data-edge="${i}" data-track="${esc(c.trackId ?? r.trackIds[0])}" data-valid="${g.valid}" d="${c.d || cubic(c)}" fill="none" stroke="${g.valid ? "#555" : "#bd3f36"}" ${g.valid ? "" : 'stroke-dasharray="1.5 1"'} stroke-width="${r.stroke}"/>`,
          )
          .join("");
      }).join(""),
    )
    .join("");
}
export function stationMarkup(s, layer, p) {
  const centers = layer === "holes" ? holeCenters(p, s) : symbolCenters(p, s),
    color = s.ringColor ?? "#555555";
  if (layer === "rings")
    return `<g data-station="${esc(s.id)}">${centers
      .map((c) => {
        const style = pointStyle(s, c.index);
        return `<g data-ring-point="${c.index}" data-point-id="${esc(s.pointIds?.[c.index] ?? "")}"><circle cx="${c.x}" cy="${c.y}" r="${style.ringOuter / 2}" fill="white" stroke="${color}" stroke-width="${style.stroke}"/>${s.doubleRing !== false && style.ringInner > 0 ? `<circle cx="${c.x}" cy="${c.y}" r="${style.ringInner / 2}" fill="none" stroke="${color}" stroke-width="${style.stroke}"/>` : ""}</g>`;
      })
      .join("")}</g>`;
  if (layer === "holes")
    return centers
      .map(
        (c) =>
          `<circle data-hole="${esc(s.id)}" data-point="${c.index}" cx="${c.x}" cy="${c.y}" r="${(c.diameter ?? s.holeDiameter) / 2}" fill="none" stroke="#b33" stroke-width="0.15"/>`,
      )
      .join("");
  if (layer === "capsules" && s.capsuleType !== "none" && centers.length > 1) {
    const a = centers[0],
      basis = symbolNormal(p, s),
      theta =
        Math.atan2(basis.y, basis.x) + ((s.markerAngle ?? 0) * Math.PI) / 180,
      n = { x: Math.cos(theta), y: Math.sin(theta) },
      angle = (theta * 180) / Math.PI,
      r =
        Math.max(...centers.map((c) => pointStyle(s, c.index).ringOuter / 2)) +
        s.capsulePadding,
      projected = centers.map((c) => ({
        x: (c.x - a.x) * n.x + (c.y - a.y) * n.y,
        y: -(c.x - a.x) * n.y + (c.y - a.y) * n.x,
        radius: pointStyle(s, c.index).ringOuter / 2 + s.capsulePadding,
      })),
      extraX = s.capsuleExtraWidth ?? 0,
      extraY = s.capsuleExtraHeight ?? 0,
      x = Math.min(...projected.map((c) => c.x - c.radius)) - extraX / 2,
      y = Math.min(...projected.map((c) => c.y - c.radius)) - extraY / 2,
      w = Math.max(...projected.map((c) => c.x + c.radius)) - x + extraX / 2,
      h = Math.max(...projected.map((c) => c.y + c.radius)) - y + extraY / 2;
    return `<g data-station="${esc(s.id)}" transform="translate(${a.x + (s.markerDx ?? 0)} ${a.y + (s.markerDy ?? 0)}) rotate(${angle})"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${s.capsuleType === "rounded-box" ? Math.min(r, 2) : Math.min(w, h) / 2}" fill="white" stroke="${color}" stroke-width="${s.capsuleStroke}"/></g>`;
  }
  if (layer === "names") {
    const l = s.label;
    return `<text data-label="${esc(s.id)}" x="${s.x + l.dx}" y="${s.y + l.dy}" transform="rotate(${l.angle} ${s.x + l.dx} ${s.y + l.dy})" font-family="${esc(l.font)}" font-size="${l.size}" font-weight="${esc(l.weight)}" letter-spacing="${l.spacing}" text-anchor="${l.anchor}" dominant-baseline="middle" fill="#151515">${esc(s.name)}</text>`;
  }
  return "";
}
export const PAINT_ORDER = [
  "routes",
  "capsules",
  "rings",
  "names",
  "strips",
  "leds",
  "holes",
  "mounting",
  "bindings",
  "outline",
  "guides",
];
export function layerMarkup(p, id) {
  if (id === "mounting") return mountingMarkup(p, esc);
  if (id === "bindings") return bindingMarkup(p, esc);
  if (["strips", "leds"].includes(id)) return physicalMarkup(p, id, esc);
  if (id === "routes") return routeMarkup(p);
  if (["rings", "names", "holes", "capsules"].includes(id))
    return (
      (id === "capsules" ? routeMarkup(p, true) : "") +
      p.layout.stations.map((s) => stationMarkup(s, id, p)).join("")
    );
  if (id === "guides")
    return p.layout.guides
      .map(
        (g) =>
          `<path d="${g.axis === "x" ? `M ${g.value} 0 V ${p.board.height}` : `M 0 ${g.value} H ${p.board.width}`}" fill="none" stroke="#6cabb2" stroke-width="0.15"/>`,
      )
      .join("");
  if (id === "outline")
    return `<rect x="0" y="0" width="${p.board.width}" height="${p.board.height}" fill="none" stroke="#444" stroke-width="0.15"/>`;
  return "";
}
export function svg(
  p,
  {
    layers = LAYERS.filter(([id]) => p.layers[id].export).map(([id]) => id),
  } = {},
) {
  p = parseProject(p);
  const invalid = geometryReport(p).filter((g) => !g.valid);
  if (
    invalid.length &&
    layers.some((id) => ["routes", "capsules"].includes(id))
  )
    throw Error(
      "SVG stoppet: ugyldig sporgeometri. Rett røde forbindelser først.",
    );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${p.board.width}mm" height="${p.board.height}mm" viewBox="0 0 ${p.board.width} ${p.board.height}"><title>${esc(p.title)}</title>${PAINT_ORDER.filter(
    (id) => layers.includes(id),
  )
    .map((id) => {
      const name = LAYERS.find(([key]) => key === id)[1];
      return `<g id="${id}" inkscape:groupmode="layer" inkscape:label="${esc(name)}">${layerMarkup(p, id)}</g>`;
    })
    .join("")}</svg>`;
}
