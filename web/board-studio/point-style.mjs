export function initializePoints(s) {
  s.pointIds ??= Array.from(
    { length: s.points },
    (_, i) => `${s.id}:point:${i}`,
  );
  if (Array.isArray(s.pointIds) && s.pointIds.length !== s.points)
    s.pointIds = Array.from(
      { length: s.points },
      (_, i) => s.pointIds[i] ?? crypto.randomUUID(),
    );
  s.pointDataVersion ??= 1;
  s.pointStyles ??= {};
  return s;
}
export function pointStyle(s, index) {
  const patch = s.pointStyles?.[s.pointIds?.[index]] ?? {};
  return {
    ringOuter: patch.ringOuter ?? s.ringOuter,
    ringInner: patch.ringInner ?? s.ringInner,
    stroke: patch.stroke ?? s.stroke,
  };
}
export function validatePoints(s) {
  if (s.pointDataVersion !== 1) throw Error("Ukjent versjon av punktdata.");
  if (
    !Array.isArray(s.pointIds) ||
    s.pointIds.length !== s.points ||
    new Set(s.pointIds).size !== s.points ||
    s.pointIds.some(
      (id) =>
        typeof id !== "string" ||
        !id.length ||
        ["__proto__", "prototype", "constructor"].includes(id),
    )
  )
    throw Error(`${s.name}: punkt-ID-er og antall punkter må samsvare.`);
  if (
    !s.pointStyles ||
    typeof s.pointStyles !== "object" ||
    Array.isArray(s.pointStyles)
  )
    throw Error(`${s.name}: ugyldige punktstiler.`);
  for (const [id, style] of Object.entries(s.pointStyles)) {
    if (
      !s.pointIds.includes(id) ||
      !style ||
      typeof style !== "object" ||
      Array.isArray(style)
    )
      throw Error(`${s.name}: punktstilen peker til et manglende punkt.`);
    for (const [key, value] of Object.entries(style))
      if (
        !["ringOuter", "ringInner", "stroke"].includes(key) ||
        !Number.isFinite(value) ||
        value < (key === "ringInner" ? 0 : key === "stroke" ? 0.01 : 0.1) ||
        value > 100
      )
        throw Error(
          `${s.name}: ${key} må være et gyldig millimetermål (diameter 0,1–100, innerring 0–100, strek 0,01–100).`,
        );
  }
}
export function ringRadius(s, index) {
  const st = pointStyle(s, index);
  return (st.ringOuter + st.stroke) / 2;
}
export function maxRingRadius(s) {
  return Math.max(
    ...Array.from({ length: s.points }, (_, i) => ringRadius(s, i)),
  );
}
export const activeHole = (h) => !!h && h.enabled !== false;
