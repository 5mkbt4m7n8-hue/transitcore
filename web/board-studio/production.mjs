import { parseProject, svg, esc } from "./model.mjs";
import { mechanicalCheck } from "./bindings.mjs";
import { symbolCenters, geometryReport } from "./geometry.mjs";
import { ledFor } from "./led-layout.mjs";
import { productionSettings } from "./production-settings.mjs";
import { vectorPdf } from "./pdf-vector.mjs";
export const PRODUCTION_LAYERS = [
  { keyName: "outline", label: "Tavlekontur", clip: true },
  { keyName: "holes", label: "Fysiske hull", clip: true },
  { keyName: "centers", label: "Senterkryss", clip: true },
  { keyName: "labels", label: "Hullnummer", clip: true },
  { keyName: "registration", label: "Arkregistrering", clip: true },
  { keyName: "notes", label: "Side og kontrollmål", clip: false },
];
export function productionHoles(p, side = "front") {
  if (!["front", "back"].includes(side))
    throw Error("Velg forside eller bakside.");
  const holes = [],
    keys = new Map();
  const push = (x, y, diameter, reference) => {
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(diameter) ||
      diameter <= 0
    )
      throw Error("Ugyldig fysisk hullgeometri.");
    const key = JSON.stringify([x, y, diameter]);
    if (keys.has(key)) {
      keys.get(key).references.push(reference);
      return;
    }
    const hole = {
      id: "H" + String(holes.length + 1).padStart(3, "0"),
      x: side === "back" ? p.board.width - x : x,
      y,
      sourceX: x,
      sourceY: y,
      diameter,
      references: [reference],
    };
    holes.push(hole);
    keys.set(key, hole);
  };
  for (const s of p.layout.stations)
    for (let i = 0; i < s.holes.length; i++)
      push(s.holes[i].x, s.holes[i].y, s.holes[i].diameter ?? s.holeDiameter, {
        kind: "station",
        stationId: s.id,
        name: s.name,
        pointIndex: i,
        holeId: s.holes[i].id,
        binding:
          p.ledLayout.bindings.find(
            (b) => b.stationId === s.id && b.pointIndex === i,
          ) ?? null,
      });
  const mounts = p.production.mountingHoles ?? [];
  if (!Array.isArray(mounts)) throw Error("Monteringshull må være en liste.");
  const ids = new Set();
  for (const h of mounts) {
    if (typeof h.id !== "string" || !h.id.length || ids.has(h.id))
      throw Error("Monteringshull må ha unike ID-er.");
    ids.add(h.id);
    push(h.x, h.y, h.diameter, {
      kind: "mounting",
      holeId: h.id,
      name: h.name ?? "Monteringshull",
      binding: null,
    });
  }
  return holes;
}
export function productionReport(input, options = {}) {
  const p = parseProject(input),
    settings = productionSettings(options),
    holes = productionHoles(p, settings.side),
    errors = mechanicalCheck(p).map((i) => i.object + ": " + i.message),
    warnings = [],
    unbound = holes.flatMap((h) =>
      h.references.filter((r) => r.kind === "station" && !r.binding),
    );
  if (!holes.length) errors.push("Prosjektet har ingen fysiske hull.");
  for (const s of p.layout.stations) {
    const rings = symbolCenters(p, s);
    s.holes.forEach((h, i) => {
      const binding = p.ledLayout.bindings.find(
        (b) => b.stationId === s.id && b.pointIndex === i,
      );
      if (
        !binding &&
        rings[i] &&
        Math.hypot(h.x - rings[i].x, h.y - rings[i].y) > 1e-5
      )
        errors.push(
          s.name +
            ": ring og hull har forskjellige sentre. Tilpass hull eller opprett en eksplisitt lyslederbinding.",
        );
    });
  }
  // Mounting holes share the same physical plate and must clear all other holes.
  for (let i = 0; i < holes.length; i++) {
    const h = holes[i];
    if (h.references.some((r) => r.kind === "mounting")) {
      if (h.references.length > 1)
        errors.push(
          h.id + ": monteringshull deler posisjon med et annet hull.",
        );
      if (
        h.x - h.diameter / 2 < 0 ||
        h.x + h.diameter / 2 > p.board.width ||
        h.y - h.diameter / 2 < 0 ||
        h.y + h.diameter / 2 > p.board.height
      )
        errors.push(h.id + ": monteringshullet ligger utenfor platen.");
      for (let j = 0; j < holes.length; j++)
        if (
          j !== i &&
          Math.hypot(h.x - holes[j].x, h.y - holes[j].y) <
            (h.diameter + holes[j].diameter) / 2 + 1
        )
          errors.push(
            h.id +
              ": monteringshullet overlapper eller ligger nærmere enn 1 mm fra et annet hull.",
          );
    }
  }
  if (unbound.length)
    warnings.push(
      `${unbound.length} stasjonspunkter mangler LED-binding. Boremalen bruker deres lagrede hullkoordinater.`,
    );
  const graphicLayers = [
    "routes",
    "capsules",
    "rings",
    "names",
    "outline",
  ].filter((id) => p.layers[id].export);
  if (!graphicLayers.length)
    warnings.push("Velg grafiske eksportlag for å laste ned grafikk-SVG.");
  const invalidGraphics = geometryReport(p).filter((g) => !g.valid).length;
  if (
    invalidGraphics &&
    graphicLayers.some((id) => ["routes", "capsules"].includes(id))
  )
    warnings.push(
      `${invalidGraphics} ugyldige forbindelser må rettes før grafikk-SVG kan eksporteres.`,
    );
  return {
    settings,
    holes,
    errors: [...new Set(errors)],
    warnings,
    unboundCount: unbound.length,
    invalidGraphics,
    graphicLayers,
    graphicsBlocked:
      invalidGraphics > 0 &&
      graphicLayers.some((id) => ["routes", "capsules"].includes(id)),
    allowed:
      !errors.length && (!unbound.length || options.allowUnbound === true),
  };
}
export function productionPlan(p, options = {}) {
  const settings = productionSettings(options),
    m = settings.margin,
    paper =
      settings.paper === "board"
        ? {
            width: Math.max(180, p.board.width + 2 * m),
            height: Math.max(80, p.board.height + 2 * m),
          }
        : settings.paper === "a4-portrait"
          ? { width: 210, height: 297 }
          : { width: 297, height: 210 },
    usable = { width: paper.width - 2 * m, height: paper.height - 2 * m },
    count = (size, available) =>
      Math.max(
        1,
        1 +
          Math.ceil(
            Math.max(0, size - available) / (available - settings.overlap),
          ),
      ),
    cols = settings.paper === "board" ? 1 : count(p.board.width, usable.width),
    rows =
      settings.paper === "board" ? 1 : count(p.board.height, usable.height);
  if (cols * rows > 100)
    throw Error(
      "Mer enn 100 PDF-ark. Velg samlet tavleformat eller mindre tavle.",
    );
  const pages = [];
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < cols; col++)
      pages.push({
        ...paper,
        margin: m,
        row,
        col,
        x: col * (usable.width - settings.overlap),
        y: row * (usable.height - settings.overlap),
      });
  return { settings, pages, cols, rows, usable };
}
function registrationPoints(p, plan, holes) {
  if (plan.pages.length === 1) return [];
  const points = [],
    add = (x, y) => {
      if (
        x > 2 &&
        y > 2 &&
        x < p.board.width - 2 &&
        y < p.board.height - 2 &&
        !holes.some((h) => Math.hypot(h.x - x, h.y - y) < h.diameter / 2 + 3) &&
        !points.some((p) => Math.hypot(p.x - x, p.y - y) < 16)
      )
        points.push({ x, y });
    };
  for (let c = 1; c < plan.cols; c++)
    for (let r = 1; r < plan.rows; r++)
      add(
        c * (plan.usable.width - plan.settings.overlap) +
          plan.settings.overlap / 2,
        r * (plan.usable.height - plan.settings.overlap) +
          plan.settings.overlap / 2,
      );
  for (let c = 1; c < plan.cols; c++) {
    const x =
      c * (plan.usable.width - plan.settings.overlap) +
      plan.settings.overlap / 2;
    for (let y = 25; y < p.board.height; y += 50) add(x, y);
  }
  for (let r = 1; r < plan.rows; r++) {
    const y =
      r * (plan.usable.height - plan.settings.overlap) +
      plan.settings.overlap / 2;
    for (let x = 25; x < p.board.width; x += 50) add(x, y);
  }
  return points;
}
export function productionPage(
  p,
  plan,
  page,
  holes = productionHoles(p, plan.settings.side),
) {
  const { margin: m } = page,
    items = [],
    push = (layer, type, data) => items.push({ layer, type, ...data }),
    map = (x, y) => ({ x: m + x - page.x, y: m + y - page.y }),
    visible = (x, y, r = 0) =>
      x + r >= page.x &&
      y + r >= page.y &&
      x - r <= page.x + plan.usable.width &&
      y - r <= page.y + plan.usable.height,
    cross = (layer, x, y, r) => {
      push(layer, "line", { x: x - r, y, x2: x + r, y2: y });
      push(layer, "line", { x, y: y - r, x2: x, y2: y + r });
    };
  push("outline", "rect", {
    ...map(0, 0),
    width: p.board.width,
    height: p.board.height,
    stroke: 0.18,
  });
  for (const hole of holes) {
    if (!visible(hole.x, hole.y, hole.diameter / 2 + 6)) continue;
    const point = map(hole.x, hole.y);
    push("holes", "circle", {
      ...point,
      r: hole.diameter / 2,
      holeId: hole.id,
      sourceX: hole.sourceX,
      sourceY: hole.sourceY,
      diameter: hole.diameter,
      stroke: 0.12,
    });
    if (plan.settings.crosshairs)
      cross("centers", point.x, point.y, Math.min(1, hole.diameter / 3));
    if (plan.settings.labels)
      push("labels", "text", {
        x: point.x + hole.diameter / 2 + 0.6,
        y: point.y - 0.6,
        size: 1.8,
        text: hole.id,
      });
  }
  for (const point of registrationPoints(p, plan, holes))
    if (visible(point.x, point.y, 2)) {
      const pt = map(point.x, point.y);
      cross("registration", pt.x, pt.y, 2);
      push("registration", "circle", { ...pt, r: 0.6, stroke: 0.1 });
      push("registration", "text", {
        x: pt.x + 13 < page.width - m ? pt.x + 2 : pt.x - 12,
        y: pt.y - 2,
        size: 1.5,
        text: `${point.x.toFixed(1)}/${point.y.toFixed(1)}`,
      });
    }
  const side =
    plan.settings.side === "front"
      ? "FORSIDE"
      : "BAKSIDE - speilet om loddrett akse";
  push("notes", "text", {
    x: m,
    y: m / 3 + 2.5,
    size: 2.5,
    text: p.title.slice(0, Math.min(70, Math.floor(plan.usable.width / 2.5))),
  });
  push("notes", "text", {
    x: m,
    y: m / 3 + 5.5,
    size: 2.3,
    text: `${side} | 1:1 | tavle ${p.board.width} x ${p.board.height} mm | ${holes.length} hull`,
  });
  push("notes", "text", {
    x: m,
    y: m / 3 + 8.5,
    size: 2.1,
    text: `Ark R${page.row + 1} C${page.col + 1} av ${plan.rows}x${plan.cols} | X ${page.x} Y ${page.y} mm | marg ${m} mm | ${plan.pages.length > 1 ? "overlapp " + plan.settings.overlap + " mm" : "samlet tavle"} | TOPP opp`,
  });
  const horizontal = Math.min(100, Math.floor(plan.usable.width / 10) * 10),
    vertical = Math.min(100, Math.floor((plan.usable.height - 10) / 10) * 10),
    y = page.height - m / 3 - 4;
  push("notes", "line", { x: m, y, x2: m + horizontal, y2: y });
  for (const x of [m, m + horizontal])
    push("notes", "line", { x, y: y - 1.5, x2: x, y2: y + 1.5 });
  push("notes", "text", {
    x: m,
    y: page.height - m / 3 - 0.5,
    size: 2.2,
    text: `X-kontroll ${horizontal} mm | Skriv ut 100 %, ingen tilpasning`,
  });
  push("notes", "line", {
    x: m / 3 + 2,
    y: m + 5,
    x2: m / 3 + 2,
    y2: m + 5 + vertical,
  });
  for (const yy of [m + 5, m + 5 + vertical])
    push("notes", "line", { x: m / 3 + 0.5, y: yy, x2: m / 3 + 3.5, y2: yy });
  push("notes", "text", {
    x: m / 3 + 6.5,
    y: m + 5 + vertical,
    size: 2,
    rotate: -90,
    text: `Y-kontroll ${vertical} mm`,
  });
  if (plan.pages.length > 1)
    push("registration", "rect", {
      x: m,
      y: m,
      width: plan.usable.width,
      height: plan.usable.height,
      gray: 0.6,
      stroke: 0.08,
    });
  return { ...page, title: p.title, items };
}
export function pageSvg(page) {
  const element = (i) => {
    const common = `fill="none" stroke="${i.gray ? "#aaa" : "#111"}" stroke-width="${i.stroke ?? 0.12}"`;
    if (i.type === "circle")
      return `<circle ${i.holeId ? `data-hole="${esc(i.holeId)}" data-diameter="${i.diameter}" data-source-x="${i.sourceX}" data-source-y="${i.sourceY}"` : ""} cx="${i.x}" cy="${i.y}" r="${i.r}" ${common}/>`;
    if (i.type === "line")
      return `<path d="M ${i.x} ${i.y} L ${i.x2} ${i.y2}" ${common}/>`;
    if (i.type === "rect")
      return `<rect x="${i.x}" y="${i.y}" width="${i.width}" height="${i.height}" ${common}/>`;
    return `<text x="${i.x}" y="${i.y}" font-size="${i.size}" font-family="Arial, sans-serif" fill="#111" ${i.rotate ? `transform="rotate(${i.rotate} ${i.x} ${i.y})"` : ""}>${esc(i.text)}</text>`;
  };
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${page.width}mm" height="${page.height}mm" viewBox="0 0 ${page.width} ${page.height}" data-scale="1:1"><title>${esc(page.title ?? "Boremal")}</title><defs><clipPath id="content"><rect x="${page.margin}" y="${page.margin}" width="${page.width - 2 * page.margin}" height="${page.height - 2 * page.margin}"/></clipPath></defs>${PRODUCTION_LAYERS.map(
    (layer) =>
      `<g id="production-${layer.keyName}" inkscape:groupmode="layer" inkscape:label="${layer.label}" ${layer.clip ? 'clip-path="url(#content)"' : ""}>${page.items
        .filter((i) => i.layer === layer.keyName)
        .map(element)
        .join("")}</g>`,
  ).join("")}</svg>`;
}
function ready(p, options) {
  const report = productionReport(p, options);
  if (!report.allowed)
    throw Error(
      report.errors[0] ??
        "Bekreft eksport av ubundne stasjonspunkter før boremal lastes ned.",
    );
  return report;
}
export function drillSvg(p, options = {}) {
  const report = ready(p, options),
    plan = productionPlan(p, { ...options, paper: "board" });
  return pageSvg(productionPage(p, plan, plan.pages[0], report.holes));
}
export function drillPdf(p, options = {}) {
  const report = ready(p, options),
    plan = productionPlan(p, options);
  return vectorPdf(
    plan.pages.map((page) => productionPage(p, plan, page, report.holes)),
    {
      title: p.title + " - boremal " + report.settings.side,
      layers: PRODUCTION_LAYERS,
    },
  );
}
export function graphicsSvg(p, options = {}) {
  const report = ready(p, options);
  if (!report.graphicLayers.length)
    throw Error("Velg minst ett grafisk eksportlag.");
  const source = svg(p, {
      layers: report.graphicLayers,
    }),
    settings = productionSettings(options);
  if (settings.side === "front")
    return source.replace("<svg xmlns=", '<svg data-side="front" xmlns=');
  const root = source.replace(/^<\?xml[^>]*>\s*/, ""),
    inner = root.slice(root.indexOf(">") + 1, root.lastIndexOf("</svg>"));
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${p.board.width}mm" height="${p.board.height}mm" viewBox="0 0 ${p.board.width} ${p.board.height}" data-side="back"><title>${esc(p.title)} - bakside</title><g transform="translate(${p.board.width} 0) scale(-1 1)">${inner}</g></svg>`;
}
export function drillCsv(p, options = {}) {
  const report = ready(p, options),
    cell = (value, text = false) => {
      let s = String(value ?? "");
      if (text && /^[\s]*[=+\-@]/.test(s)) s = "'" + s;
      return '"' + s.replaceAll('"', '""') + '"';
    },
    rows = [
      [
        "Hullnr",
        "Type",
        "Hull-ID",
        "Stasjons-ID",
        "Navn",
        "Punkt",
        "Side",
        "X_mm",
        "Y_mm",
        "Diameter_mm",
        "Forside_X_mm",
        "Forside_Y_mm",
        "Segment-ID",
        "LED-ID",
        "LED-indeks",
        "Kontroller",
        "Kjede",
      ],
    ];
  for (const h of report.holes)
    for (const r of h.references) {
      const led = r.binding && ledFor(p, r.binding.segmentId, r.binding.ledId);
      rows.push([
        h.id,
        r.kind,
        r.holeId,
        r.stationId ?? "",
        r.name,
        r.pointIndex === undefined ? "" : r.pointIndex + 1,
        report.settings.side,
        h.x,
        h.y,
        h.diameter,
        h.sourceX,
        h.sourceY,
        r.binding?.segmentId ?? "",
        r.binding?.ledId ?? "",
        led?.index ?? "",
        led?.controllerId ?? "",
        led?.chainId ?? "",
      ]);
    }
  return (
    "\uFEFF" +
    rows
      .map((row, i) =>
        row
          .map((v, j) =>
            cell(v, i > 0 && ![5, 7, 8, 9, 10, 11, 14].includes(j)),
          )
          .join(";"),
      )
      .join("\r\n") +
    "\r\n"
  );
}
export function machiningSvg(p, options = {}) {
  const report = ready(p, options);
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${p.board.width}mm" height="${p.board.height}mm" viewBox="0 0 ${p.board.width} ${p.board.height}" data-origin="board-top-left" data-side="${report.settings.side}"><title>${esc(p.title)} - fysiske hull - ${report.settings.side}</title><desc>Millimeter. Plateorigo øvre venstre hjørne sett fra valgt side. Ingen marg, tekst, senterkryss eller skjærekompensasjon.</desc><g id="holes" inkscape:groupmode="layer" inkscape:label="Fysiske hull">${report.holes.map((h) => `<circle data-hole="${h.id}" data-source-x="${h.sourceX}" data-source-y="${h.sourceY}" data-diameter="${h.diameter}" cx="${h.x}" cy="${h.y}" r="${h.diameter / 2}" fill="none" stroke="#000" stroke-width="0.01"/>`).join("")}</g></svg>`;
}
