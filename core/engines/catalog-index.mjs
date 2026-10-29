// Configuration node arrays are immutable for their lifetime. A refreshed
// configuration supplies a new array; mixed GPS/ETA board views share it.
// Weak keys let expired configurations and their indexes be collected.
const indexes = new WeakMap();
const cellSize = 0.01;
const cell = value => Math.floor(value / cellSize);
const key = (lat, lon) => `${lat}:${lon}`;

export function catalogIndex(nodes) {
  let index = indexes.get(nodes);
  if (index) return index;
  const grid = new Map(), stations = new Map();
  for (const node of nodes) {
    if (node.stationId) {
      const group = stations.get(node.stationId) || [];
      group.push(node);
      stations.set(node.stationId, group);
    }
    if (!Number.isFinite(node.lat) || !Number.isFinite(node.lon)) continue;
    const id = key(cell(node.lat), cell(node.lon));
    const group = grid.get(id) || [];
    group.push(node);
    grid.set(id, group);
  }
  index = {
    stations,
    candidates(lat, lon, latLimit, lonLimit) {
      if (![lat, lon, latLimit, lonLimit].every(Number.isFinite)) return [];
      const lowLat = cell(lat - latLimit), highLat = cell(lat + latLimit);
      const lowLon = cell(lon - lonLimit), highLon = cell(lon + lonLimit);
      // Preserve bounded work even for unusual configured radii/coordinates.
      if ((highLat - lowLat + 1) * (highLon - lowLon + 1) > grid.size) return nodes;
      const result = [];
      for (let y = lowLat; y <= highLat; y++) {
        for (let x = lowLon; x <= highLon; x++) {
          const group = grid.get(key(y, x));
          if (group) result.push(...group);
        }
      }
      return result;
    }
  };
  indexes.set(nodes, index);
  return index;
}
