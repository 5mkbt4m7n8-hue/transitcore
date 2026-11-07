export const PRODUCTION_DEFAULTS = {
  version: 1,
  side: "front",
  paper: "a4-portrait",
  margin: 15,
  overlap: 10,
  crosshairs: true,
  labels: true,
};
export function productionSettings(input = {}) {
  const s = { ...PRODUCTION_DEFAULTS, ...input };
  if (
    s.version !== 1 ||
    !["front", "back"].includes(s.side) ||
    !["board", "a4-portrait", "a4-landscape"].includes(s.paper) ||
    !Number.isFinite(s.margin) ||
    s.margin < 15 ||
    s.margin > 30 ||
    !Number.isFinite(s.overlap) ||
    s.overlap < 5 ||
    s.overlap > 30 ||
    typeof s.crosshairs !== "boolean" ||
    typeof s.labels !== "boolean"
  )
    throw Error("Ugyldige produksjonsvalg. Marg 15–30 mm og overlapp 5–30 mm.");
  return Object.fromEntries(
    Object.keys(PRODUCTION_DEFAULTS).map((k) => [k, s[k]]),
  );
}
