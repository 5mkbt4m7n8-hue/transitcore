import { fromTemplate } from "./stations.mjs";
export const CATEGORIES = ["Trondheim buss", "Gråkallbanen", "Oslo T-bane"];
export function builtInSymbols(base) {
  return CATEGORIES.flatMap((category, ci) =>
    [
      ["single", "Enkeltstopp", 1, "none", false],
      ["double", "Dobbeltstopp", 2, "none", false],
      ["capsule", "Felles kapsel", 2, "stadium", false],
      ["transfer", "Overgangsstasjon", 3, "rounded-box", false],
      ["shared", "Felles LED-stopp", 1, "none", true],
      ["custom", "Egendefinert utgangspunkt", 2, "stadium", false],
    ].map(([kind, name, points, capsuleType, allowShared]) => {
      const template = structuredClone(base);
      Object.assign(template.appearance, {
        points,
        pointSpacing: 10,
        symbolAngle: 0,
        capsuleType,
        capsuleExtraWidth: 0,
        capsuleExtraHeight: 0,
        symbolKind: kind,
        allowShared,
        transitionLength: null,
      });
      template.label.dx = 0;
      template.label.dy = -8;
      template.label.anchor = "middle";
      template.holeOffsets = Array.from({ length: points }, (_, i) => ({
        x: (i - (points - 1) / 2) * 10,
        y: 0,
      }));
      delete template.ringOffsets;
      return {
        id: `builtin-${ci}-${kind}`,
        name,
        category,
        template,
        builtin: true,
      };
    }),
  );
}
export function symbolBundle(records) {
  return {
    format: "intransit-symbol-library",
    version: 1,
    templates: records.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      template: structuredClone(r.template),
    })),
  };
}
export function importSymbolBundle(input) {
  const b =
    typeof input === "string" ? JSON.parse(input) : structuredClone(input);
  if (
    b?.format !== "intransit-symbol-library" ||
    b.version !== 1 ||
    !Array.isArray(b.templates) ||
    b.templates.length > 200
  )
    throw Error("Ugyldig symbolbibliotek.");
  return b.templates.map((r) => {
    if (
      typeof r.name !== "string" ||
      r.name.length > 100 ||
      !CATEGORIES.includes(r.category) ||
      r.template?.version !== 1
    )
      throw Error("Ugyldig symbolmal.");
    return {
      id: crypto.randomUUID(),
      name: r.name,
      category: r.category,
      template: r.template,
    };
  });
}
export function applyVisualStyle(p, ids, patch) {
  const q = structuredClone(p);
  if (q.layers.rings.locked || q.layers.capsules.locked)
    throw Error("Grafikklaget er låst.");
  const keys = [
    "ringOuter",
    "ringInner",
    "stroke",
    "ringColor",
    "doubleRing",
    "capsulePadding",
    "capsuleStroke",
    "capsuleType",
    "capsuleExtraWidth",
    "capsuleExtraHeight",
  ];
  for (const s of q.layout.stations)
    if (ids.includes(s.id))
      for (const key of keys)
        if (key in patch) s[key] = structuredClone(patch[key]);
  return q;
}
