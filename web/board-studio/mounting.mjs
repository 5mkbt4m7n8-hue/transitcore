import { activeHole } from "./point-style.mjs";
export const MECHANICAL_DEFAULTS = {
  version: 1,
  edgeClearance: 0,
  holeClearance: 1,
};
export function mechanicalSettings(input = {}) {
  const s = { ...MECHANICAL_DEFAULTS, ...input };
  if (
    s.version !== 1 ||
    !["edgeClearance", "holeClearance"].every(
      (k) => Number.isFinite(s[k]) && s[k] >= 0 && s[k] <= 100,
    )
  )
    throw Error("Klaringer må være 0–100 mm.");
  return Object.fromEntries(
    Object.keys(MECHANICAL_DEFAULTS).map((k) => [k, s[k]]),
  );
}
export function validateMounting(p) {
  const mounts = p.production.mountingHoles ?? [];
  if (!Array.isArray(mounts) || mounts.length > 500)
    throw Error("Monteringshull må være en liste med høyst 500 hull.");
  const ids = new Set();
  for (const h of mounts) {
    if (
      typeof h.id !== "string" ||
      !h.id.length ||
      ids.has(h.id) ||
      !Number.isFinite(h.x) ||
      h.x < -5000 ||
      h.x > 10000 ||
      !Number.isFinite(h.y) ||
      h.y < -5000 ||
      h.y > 10000 ||
      !Number.isFinite(h.diameter) ||
      h.diameter < 0.1 ||
      h.diameter > 100 ||
      (h.name !== undefined &&
        (typeof h.name !== "string" || h.name.length > 100))
    )
      throw Error(
        "Ugyldig monteringshull: bruk unik ID, endelige X/Y-mål og diameter 0,1–100 mm.",
      );
    ids.add(h.id);
  }
  if (p.production.mechanicalSettings)
    mechanicalSettings(p.production.mechanicalSettings);
}
export function edgeDistance(p, h, diameter = h.diameter) {
  return Math.min(
    h.x - diameter / 2,
    p.board.width - h.x - diameter / 2,
    h.y - diameter / 2,
    p.board.height - h.y - diameter / 2,
  );
}
export function physicalHoleList(p) {
  return [
    ...p.layout.stations.flatMap((s) =>
      s.holes.map((h, i) => ({
        enabled: h.enabled,
        kind: "station",
        id: h.id,
        name: s.name + " · " + String.fromCharCode(65 + i),
        x: h.x,
        y: h.y,
        diameter: h.diameter ?? s.holeDiameter,
        stationId: s.id,
        pointIndex: i,
      })),
    ),
    ...(p.production.mountingHoles ?? []).map((h) => ({
      kind: "mounting",
      ...h,
      name: h.name ?? "Monteringshull",
    })),
  ].filter(activeHole);
}
export function mountingIssues(p) {
  const settings = mechanicalSettings(p.production.mechanicalSettings),
    holes = physicalHoleList(p),
    issues = [],
    target = (h) =>
      h.kind === "mounting"
        ? { kind: "mounting", id: h.id }
        : { kind: "station", id: h.stationId, pointIndex: h.pointIndex };
  for (const h of holes) {
    const edge = edgeDistance(p, h);
    if (edge < -1e-8 && h.kind === "mounting")
      issues.push({
        object: h.name,
        message: "Monteringshullet ligger utenfor platen.",
        target: target(h),
      });
    else if (edge >= -1e-8 && edge + 1e-8 < settings.edgeClearance)
      issues.push({
        object: h.name,
        message: `Kantavstand ${edge.toFixed(3)} mm, krever minst ${settings.edgeClearance} mm fra hullkant til platekant.`,
        target: target(h),
      });
  }
  for (let i = 0; i < holes.length; i++)
    for (let j = i + 1; j < holes.length; j++) {
      const a = holes[i],
        b = holes[j];
      if (a.kind !== "mounting" && b.kind !== "mounting") continue;
      const gap =
        Math.hypot(a.x - b.x, a.y - b.y) - (a.diameter + b.diameter) / 2;
      if (gap + 1e-8 < settings.holeClearance) {
        const primary = a.kind === "mounting" ? a : b;
        issues.push({
          object: a.name + " / " + b.name,
          message:
            gap < 0
              ? "Overlappende hull."
              : `Hullavstand ${gap.toFixed(3)} mm, krever minst ${settings.holeClearance} mm mellom hullkantene.`,
          target: {
            ...target(primary),
            mountIds: [a, b]
              .filter((h) => h.kind === "mounting")
              .map((h) => h.id),
          },
        });
      }
    }
  return issues;
}
function writable(p) {
  if (p.layers.mounting?.locked) throw Error("Monteringslaget er låst.");
}
export function editMount(p, id, patch) {
  writable(p);
  const q = structuredClone(p);
  q.production.mountingHoles ??= [];
  let h = q.production.mountingHoles.find((h) => h.id === id);
  if (id && !h) throw Error("Monteringshullet finnes ikke.");
  if (!h) {
    h = {
      id: crypto.randomUUID(),
      name: "Monteringshull " + (q.production.mountingHoles.length + 1),
      x: 15,
      y: 15,
      diameter: 3.2,
    };
    q.production.mountingHoles.push(h);
  }
  for (const key of ["name", "x", "y", "diameter"])
    if (patch[key] !== undefined) h[key] = patch[key];
  validateMounting(q);
  return { project: q, id: h.id };
}
export function removeMount(p, id) {
  writable(p);
  const q = structuredClone(p);
  if (!q.production.mountingHoles.some((h) => h.id === id))
    throw Error("Velg et eksisterende monteringshull.");
  q.production.mountingHoles = q.production.mountingHoles.filter(
    (h) => h.id !== id,
  );
  return q;
}
export function cornerPattern(p, { inset = 15, diameter = 3.2 } = {}) {
  if (
    !Number.isFinite(inset) ||
    inset <= 0 ||
    inset * 2 >= Math.min(p.board.width, p.board.height)
  )
    throw Error(
      "Senteravstanden fra kanten må være mindre enn halve tavlens kortside.",
    );
  const q = structuredClone(p),
    holes = [
      [inset, inset],
      [p.board.width - inset, inset],
      [inset, p.board.height - inset],
      [p.board.width - inset, p.board.height - inset],
    ].map(([x, y], i) => ({
      id: crypto.randomUUID(),
      name: "Hjørnehull " + (i + 1),
      x,
      y,
      diameter,
    }));
  q.production.mountingHoles = [
    ...(q.production.mountingHoles ?? []),
    ...holes,
  ];
  validateMounting(q);
  const ids = new Set(holes.map((h) => h.id)),
    issues = mountingIssues(q).filter(
      (i) =>
        ids.has(i.target.id) || i.target.mountIds?.some((id) => ids.has(id)),
    );
  return { project: q, holes, issues };
}
export function addCorners(p, options) {
  writable(p);
  const result = cornerPattern(p, options);
  if (result.issues.length)
    throw Error(
      result.issues.map((i) => i.object + ": " + i.message).join(" "),
    );
  return result.project;
}
export function mountChanges(old, next) {
  const rows = [];
  for (const before of old.production.mountingHoles ?? []) {
    const after = (next.production.mountingHoles ?? []).find(
      (h) => h.id === before.id,
    );
    if (
      !after ||
      Math.hypot(before.x - after.x, before.y - after.y) > 1e-8 ||
      Math.abs(before.diameter - after.diameter) > 1e-8
    )
      rows.push({
        stationId: before.id,
        pointIndex: 0,
        name: after?.name ?? before.name ?? "Monteringshull",
        holeBefore: { x: before.x, y: before.y },
        holeAfter: after && { x: after.x, y: after.y },
        diameterBefore: before.diameter,
        diameterAfter: after?.diameter,
      });
  }
  return rows;
}
export function mountingMarkup(p, esc) {
  return (p.production.mountingHoles ?? [])
    .map(
      (h) =>
        `<g data-mounting="${esc(h.id)}"><circle cx="${h.x}" cy="${h.y}" r="${h.diameter / 2}" fill="white" stroke="#775493" stroke-width=".15"/><path d="M ${h.x - 0.7} ${h.y} H ${h.x + 0.7} M ${h.x} ${h.y - 0.7} V ${h.y + 0.7}" fill="none" stroke="#775493" stroke-width=".1"/><title>${esc(h.name ?? "Monteringshull")} · Ø ${h.diameter} mm</title></g>`,
    )
    .join("");
}
