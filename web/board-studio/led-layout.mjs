// Physical positions are derived only from millimetres, anchor and straight axis.
const finite = (x, a, b) =>
  typeof x === "number" && Number.isFinite(x) && x >= a && x <= b;
export function newProfile() {
  return {
    id: crypto.randomUUID(),
    name: "WS2812B-2020 · 100 LED/m",
    ledType: "WS2812B-2020 RGB",
    voltage: 5,
    density: 100,
    nominalPitch: 10,
    pitch: 10,
    width: 5,
    count: 500,
    length: 5000,
    firstOffset: 5,
    endMargin: 5,
    housingWidth: 2,
    housingLength: 2,
    cutPoints: [],
    splices: [],
  };
}
export function newSegment(p, profileId, options = {}) {
  const profile = p.ledLayout.profiles.find((r) => r.id === profileId);
  if (!profile) throw Error("Velg en stripeprofil.");
  const number = Math.max(0, ...p.ledLayout.segments.map((s) => s.number)) + 1;
  const segment = {
    id: crypto.randomUUID(),
    number,
    name: `S${String(number).padStart(2, "0")}`,
    profileId,
    x: 40,
    y: 60,
    angle: 0,
    count: 16,
    length: 160,
    lengthMode: options.length !== undefined ? "manual" : "auto",
    endMargin: profile.endMargin ?? 5,
    startIndex: 0,
    controllerId: "kontroller-1",
    chainId: `kjede-${number}`,
    direction: 1,
    mounting: "back",
    cutPoints: [],
    splices: [],
    ...options,
  };
  if (segment.lengthMode === "auto") segment.length = segmentLength(p, segment);
  return segment;
}
export function segmentLength(p, s) {
  const r = p.ledLayout.profiles.find((r) => r.id === s.profileId);
  if (!r) throw Error("Velg stripeprofil.");
  return (
    r.firstOffset + (s.count - 1) * r.pitch + (s.endMargin ?? r.endMargin ?? 5)
  );
}
export function inheritSegment(
  p,
  source = p.ledLayout.segments.at(-1),
  profileId = source?.profileId ?? p.ledLayout.profiles[0]?.id,
) {
  const r = p.ledLayout.profiles.find((r) => r.id === profileId);
  if (!r) throw Error("Velg stripeprofil.");
  const fields =
    source && source.profileId === profileId
      ? Object.fromEntries(
          [
            "count",
            "angle",
            "direction",
            "mounting",
            "controllerId",
            "chainId",
            "lengthMode",
            "length",
            "endMargin",
          ].map((k) => [k, source[k]]),
        )
      : {};
  const s = newSegment(p, profileId, fields);
  let start = source
    ? Math.max(
        0,
        ...p.ledLayout.segments
          .filter(
            (t) => t.controllerId === s.controllerId && t.chainId === s.chainId,
          )
          .map((t) => t.startIndex + t.count),
      )
    : 0;
  if (start + s.count - 1 > 1000000)
    throw Error(
      "Ingen ledig indeksrekke. Velg ny kjede eller manuelt startnummer.",
    );
  s.startIndex = start;
  if (source) {
    const a = (source.angle * Math.PI) / 180;
    s.x = source.x + Math.cos(a) * source.length;
    s.y = source.y + Math.sin(a) * source.length;
  }
  return s;
}
export function ledPositions(p, segment) {
  const profile = p.ledLayout.profiles.find((r) => r.id === segment.profileId);
  if (!profile) return [];
  const a = (segment.angle * Math.PI) / 180,
    dx = Math.cos(a),
    dy = Math.sin(a);
  return Array.from({ length: segment.count }, (_, slot) => {
    const distance = profile.firstOffset + slot * profile.pitch;
    return {
      id: `${segment.id}:led:${slot}`,
      segmentId: segment.id,
      slot,
      index:
        segment.startIndex +
        (segment.direction === 1 ? slot : segment.count - 1 - slot),
      controllerId: segment.controllerId,
      chainId: segment.chainId,
      x: segment.x + dx * distance,
      y: segment.y + dy * distance,
    };
  });
}
export function ledFor(p, segmentId, ledId) {
  const s = p.ledLayout.segments.find((s) => s.id === segmentId);
  return s ? ledPositions(p, s).find((l) => l.id === ledId) : null;
}
export function validateLedLayout(p) {
  const l = p.ledLayout;
  if (
    !l ||
    !Array.isArray(l.profiles) ||
    !Array.isArray(l.segments) ||
    !Array.isArray(l.bindings) ||
    l.profiles.length > 100 ||
    l.segments.length > 500 ||
    l.bindings.length > 10000
  )
    throw Error("Ugyldig LED-layout.");
  if (
    l.segments.reduce(
      (sum, s) => sum + (Number.isInteger(s.count) ? s.count : 0),
      0,
    ) > 10000
  )
    throw Error(
      "Maksimalt 10000 fysiske LED-er per prosjekt i denne versjonen.",
    );
  for (const r of l.profiles) {
    r.endMargin ??= 5;
    if (!finite(r.endMargin, 0, 1000)) throw Error("Ugyldig sluttmargin.");
  }
  for (const s of l.segments) {
    s.lengthMode ??= "manual";
    s.endMargin ??=
      l.profiles.find((r) => r.id === s.profileId)?.endMargin ?? 5;
    if (
      !["auto", "manual"].includes(s.lengthMode) ||
      !finite(s.endMargin, 0, 1000)
    )
      throw Error("Ugyldig lengdemodus/sluttmargin.");
    if (s.lengthMode === "auto") s.length = segmentLength(p, s);
  }
  const ids = new Set();
  for (const r of l.profiles) {
    if (
      typeof r.id !== "string" ||
      ids.has(r.id) ||
      typeof r.name !== "string" ||
      typeof r.ledType !== "string" ||
      !finite(r.pitch, 0.1, 1000) ||
      !finite(r.nominalPitch, 0.1, 1000) ||
      !finite(r.width, 0.1, 100) ||
      !Number.isInteger(r.count) ||
      !finite(r.count, 1, 10000) ||
      !finite(r.firstOffset, 0, 1000) ||
      !finite(r.length, 0.1, 100000) ||
      !finite(r.housingWidth, 0.1, 100) ||
      !finite(r.housingLength, 0.1, 100) ||
      !finite(r.voltage, 1, 100) ||
      !finite(r.density, 0.1, 10000) ||
      !Array.isArray(r.cutPoints) ||
      !Array.isArray(r.splices)
    )
      throw Error("Ugyldig stripeprofil: " + r.name);
    for (const cut of r.cutPoints)
      if (!Number.isInteger(cut) || cut < 0 || cut >= r.count)
        throw Error("Ugyldig kuttpunkt i profil " + r.name);
    for (const splice of r.splices)
      if (!finite(splice.atMm, 0, r.length) || typeof splice.note !== "string")
        throw Error("Ugyldig skjøt i profil " + r.name);
    ids.add(r.id);
  }
  const segmentIds = new Set(),
    indexKeys = new Set();
  for (const s of l.segments) {
    if (
      typeof s.id !== "string" ||
      segmentIds.has(s.id) ||
      !ids.has(s.profileId) ||
      typeof s.name !== "string" ||
      !Number.isInteger(s.number) ||
      s.number < 1 ||
      !finite(s.x, -5000, 10000) ||
      !finite(s.y, -5000, 10000) ||
      !finite(s.angle, -360, 360) ||
      !Number.isInteger(s.count) ||
      !finite(s.count, 1, 10000) ||
      !Number.isInteger(s.startIndex) ||
      !finite(s.startIndex, 0, 1000000) ||
      !finite(s.length, 0.1, 100000) ||
      typeof s.controllerId !== "string" ||
      !s.controllerId.trim() ||
      typeof s.chainId !== "string" ||
      !s.chainId.trim() ||
      ![1, -1].includes(s.direction) ||
      !["front", "back"].includes(s.mounting) ||
      !Array.isArray(s.cutPoints) ||
      !Array.isArray(s.splices)
    )
      throw Error("Ugyldig stripesegment: " + s.name);
    segmentIds.add(s.id);
    for (const cut of s.cutPoints)
      if (!Number.isInteger(cut) || cut < 0 || cut >= s.count)
        throw Error("Ugyldig kuttpunkt i " + s.name);
    for (const splice of s.splices)
      if (!finite(splice.atMm, 0, s.length) || typeof splice.note !== "string")
        throw Error("Ugyldig skjøt i " + s.name);
    for (const led of ledPositions(p, s)) {
      const key = JSON.stringify([s.controllerId, s.chainId, led.index]);
      if (indexKeys.has(key))
        throw Error(
          `Duplisert LED-indeks ${led.index} i ${s.controllerId} / ${s.chainId}.`,
        );
      indexKeys.add(key);
    }
  }
  return p;
}
export function segmentCorners(p, s) {
  const r = p.ledLayout.profiles.find((r) => r.id === s.profileId),
    a = (s.angle * Math.PI) / 180,
    d = { x: Math.cos(a), y: Math.sin(a) },
    n = { x: -d.y, y: d.x };
  return [
    [0, -r.width / 2],
    [s.length, -r.width / 2],
    [s.length, r.width / 2],
    [0, r.width / 2],
  ].map(([u, v]) => ({
    x: s.x + u * d.x + v * n.x,
    y: s.y + u * d.y + v * n.y,
  }));
}
export function physicalMarkup(p, id, esc) {
  if (id === "strips")
    return p.ledLayout.segments
      .map((s) => {
        const r = p.ledLayout.profiles.find((r) => r.id === s.profileId);
        return `<g data-segment="${esc(s.id)}" transform="translate(${s.x} ${s.y}) rotate(${s.angle})"><rect x="0" y="${-r.width / 2}" width="${s.length}" height="${r.width}" fill="#b5d3dc" fill-opacity=".35" stroke="#668b99" stroke-width=".2"/><path d="M 0 0 H ${s.length} m -4 -2 l 4 2 -4 2" fill="none" stroke="#668b99" stroke-width=".25"/><text x="1" y="${-r.width / 2 - 2}" font-size="2.8" fill="#4d7382">${esc(s.name)} · ${esc(s.chainId)} · ${s.direction === 1 ? "→" : "←"}</text></g>`;
      })
      .join("");
  if (id === "leds")
    return p.ledLayout.segments
      .flatMap((s) =>
        ledPositions(p, s).map(
          (l) =>
            `<g data-led="${esc(l.id)}" data-segment="${esc(s.id)}" data-index="${l.index}" data-x="${l.x}" data-y="${l.y}"><circle cx="${l.x}" cy="${l.y}" r="1" fill="#f4c66a" stroke="#6f693e" stroke-width=".15"/><text x="${l.x + 1.5}" y="${l.y - 1.5}" font-size="1.8" fill="#806832">${l.index}</text></g>`,
        ),
      )
      .join("");
  return "";
}
