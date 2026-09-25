import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const load = path => readFile(new URL(path, root), 'utf8').then(JSON.parse);
const base = await load('config/boards/trondheim-bus-board.json');
const catalog = await load('config/boards/trondheim-city-lines-catalog.json');
const hardware = await load('config/hardware/trondheim-bus-board-hardware.json');
const byQuay = new Map(catalog.nodes.flatMap(node => node.stopIds.map(id => [id, node])));
const nodes = base.nodes.map(node => {
  const source = byQuay.get(node.quayId);
  if (!source) throw Error(`Missing quay in city catalog: ${node.quayId}`);
  const routes = [...new Set([...node.routes, ...source.routes])].filter(id => id.startsWith('atb-bus-'));
  return { ...node, routes,
    routeDirections: Object.fromEntries(routes.map(id => [id, node.routeDirections[id] || source.routeDirections[id]])) };
});
const routes = [...new Set(nodes.flatMap(node => node.routes))].sort();
const board = { ...base, id: 'trondheim-shared-stops-board',
  name: 'Trondheim – alle bylinjer på metrobusstoppene', routes, nodes };
// Stable route colours are part of the board, shared by web and future hardware.
const lineColors = {};
for (const id of routes) {
  const profile = await load(`config/routes/${id}.json`);
  const hue = (Number(profile.line.publicCode) * 137.508) % 360;
  const channel = offset => {
    const k = (offset + hue / 30) % 12;
    return Math.round(255 * (0.62 - 0.32 * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0');
  };
  lineColors[profile.line.publicCode] = profile.line.color || `#${channel(0)}${channel(8)}${channel(4)}`;
}
board.render = { ...board.render, lineColors };
const sharedHardware = { ...hardware, id: `${board.id}-hardware`, boardProfile: board.id,
  name: board.name, assignments: hardware.assignments.map(item => ({ ...item,
    routes: nodes.find(node => node.led === item.logicalLed).routes })) };
for (const [path, value] of [
  [`config/boards/${board.id}.json`, board],
  [`config/hardware/${board.id}-hardware.json`, sharedHardware]
]) await writeFile(new URL(path, root), `${JSON.stringify(value, null, 2)}\n`);
console.log(`${routes.length} routes on ${nodes.length} exact quays; existing physical LED order retained.`);

