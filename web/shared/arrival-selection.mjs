// Arrival estimates are not GPS positions. Choose one station per service journey
// before resolving collisions, otherwise a losing vehicle can appear elsewhere.
export function selectArrivals(candidates) {
  const priority = {PASSED:1, APPROACHING:2, AT_STOP:3, PARKED:4};
  const rank = (a,b) => (priority[b.state]||0)-(priority[a.state]||0) ||
    Math.abs(a.deltaSeconds)-Math.abs(b.deltaSeconds) || Number(a.id)-Number(b.id) ||
    String(a.vehicleId).localeCompare(String(b.vehicleId));
  const journeys = new Map();
  for (const item of [...candidates].sort(rank)) {
    if (!item.vehicleId || !Number.isInteger(item.id) || !Number.isFinite(item.deltaSeconds)) continue;
    if (!journeys.has(item.vehicleId)) journeys.set(item.vehicleId,item);
  }
  const leds = new Map();
  for (const item of journeys.values()) {
    const group = leds.get(item.id);
    if (!group) leds.set(item.id,[item]);
    else if (priority[item.state]===priority[group[0].state]) group.push(item);
  }
  return [...leds.values()].sort((a,b)=>a[0].id-b[0].id);
}
