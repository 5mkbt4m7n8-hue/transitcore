import { connectPorts } from "./connections.mjs";
import { edgeGeometry, geometryReport, symbolCenters } from "./geometry.mjs";
import { ledPositions } from "./led-layout.mjs";
import { fromTemplate } from "./stations.mjs";
import { bindPoint, mechanicalCheck } from "./bindings.mjs";
export function connectionPreview(p, start, end, reconnect = null) {
  try {
    const result = connectPorts(p, start, end, reconnect),
      route = result.project.layout.routes.find((r) => r.id === result.routeId);
    return edgeGeometry(result.project, route, reconnect?.edge ?? 0);
  } catch (e) {
    return { valid: false, paths: [], warnings: [e.message] };
  }
}
export function nextRapidStop(p, config) {
  const segment = p.ledLayout.segments.find((s) => s.id === config.segmentId);
  if (!segment) throw Error("Velg et eksisterende stripesegment.");
  const leds = ledPositions(p, segment),
    points = config.template?.appearance.points;
  if (!Number.isInteger(points) || points < 1 || points > 8)
    throw Error("Velg et gyldig stasjonssymbol.");
  let starts;
  if (config.indices) {
    if (
      !config.indices.length ||
      config.indices.some((i) => !Number.isInteger(i)) ||
      new Set(config.indices).size !== config.indices.length
    )
      throw Error("LED-indeksene må være forskjellige heltall.");
    starts = config.indices.map((index) => {
      const slot = leds.findIndex((l) => l.index === index);
      if (slot < 0)
        throw Error(`LED-indeks ${index} finnes ikke på ${segment.name}.`);
      return slot;
    });
  } else {
    if (
      !Number.isInteger(config.startSlot) ||
      config.startSlot < 0 ||
      config.startSlot >= leds.length ||
      !Number.isInteger(config.step) ||
      config.step < 1
    )
      throw Error("Velg gyldig start og stoppintervall.");
    starts = Array.from(
      { length: Math.ceil((leds.length - config.startSlot) / config.step) },
      (_, i) => config.startSlot + i * config.step,
    );
  }
  const used = new Set(
    p.ledLayout.bindings
      .filter((b) => b.segmentId === segment.id)
      .map((b) => b.ledId),
  );
  for (const start of starts) {
    const group = leds.slice(start, start + points);
    if (group.length === points && group.every((l) => !used.has(l.id)))
      return { segment, leds: group, startSlot: start };
  }
  return null;
}
export function placeRapidStop(p, config) {
  if (
    ["rings", "holes", "capsules", "names", "bindings"].some(
      (k) => p.layers[k].locked,
    )
  )
    throw Error("Lås opp stasjons- og bindingslagene før plassering.");
  const candidate = nextRapidStop(p, config);
  if (!candidate)
    throw Error("Ingen flere ledige LED-posisjoner for dette symbolet.");
  let q = structuredClone(p);
  const station = fromTemplate(config.template, candidate.leds[0]);
  station.name =
    (config.namePrefix?.trim() || "Ny stasjon") +
    " " +
    (p.layout.stations.length + 1);
  station.symbolAngle = candidate.segment.angle;
  q.layout.stations.push(station);
  for (let i = 0; i < candidate.leds.length; i++)
    q = bindPoint(q, {
      stationId: station.id,
      pointIndex: i,
      segmentId: candidate.segment.id,
      ledId: candidate.leds[i].id,
    });
  return { project: q, stationId: station.id, candidate };
}
export function boardChecks(p) {
  const issues = mechanicalCheck(p).map((i) => ({
    ...i,
    category: "physical",
    severity: "warning",
  }));
  for (const g of geometryReport(p))
    if (!g.valid || g.adjusted)
      issues.push({
        object:
          "Forbindelse " +
          (p.layout.routes.findIndex((r) => r.id === g.routeId) + 1),
        message: g.warnings.join(" "),
        category: "geometry",
        severity: g.valid ? "info" : "error",
        target: { kind: "route", id: g.routeId, edge: g.edge },
      });
  for (const s of p.layout.stations) {
    const rings = symbolCenters(p, s);
    for (let pointIndex = 0; pointIndex < s.points; pointIndex++) {
      const binding = p.ledLayout.bindings.find(
          (b) => b.stationId === s.id && b.pointIndex === pointIndex,
        ),
        target = { kind: "station", id: s.id, pointIndex };
      if (!binding)
        issues.push({
          object: s.name + " · " + String.fromCharCode(65 + pointIndex),
          message: "Stasjonspunktet mangler fysisk LED-binding.",
          category: "unbound",
          severity: "info",
          target,
        });
      const h = s.holes[pointIndex],
        ring = rings[pointIndex];
      if (
        !binding &&
        h &&
        ring &&
        Math.hypot(h.x - ring.x, h.y - ring.y) > 1e-5
      )
        issues.push({
          object: s.name + " · " + String.fromCharCode(65 + pointIndex),
          message:
            "Grafisk ring og fysisk hull har forskjellige sentre. Kontroller rotasjon og hulltilpasning.",
          category: "physical",
          severity: "warning",
          target,
        });
    }
  }
  return issues;
}
