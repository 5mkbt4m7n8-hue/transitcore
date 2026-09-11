import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const board=JSON.parse(fs.readFileSync(path.join(root,"config/boards/trondheim-city-lines-catalog.json"),"utf8"));
const expected="1 2 3 10 11 12 13 14 15 16 18 20 21 22 23 25 28 40 41 42 43 44 45 46 50 51 52 53 54 70 71 72 73 74 75 76 77 78 79 80 81 82 83 85 86 91 92".split(" ");
const actual=board.routes.map(id=>id.match(/atb-bus-(\d+)-live/)?.[1]);
if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error(`Wrong city-line catalog: ${actual.join(", ")}`);
if(board.schemaVersion!==2||!board.directionalPlatforms)throw Error("Catalog must retain directional quay data");
if(board.leds.count!==board.nodes.length)throw Error("Catalog LED count does not match its nodes");
const nodeIds=new Set,leds=new Set,stations=new Map;
for(const node of board.nodes){
  if(!node.stationId||!node.quayId)throw Error(`Missing stable stop identity on ${node.id}`);
  if(nodeIds.has(node.id)||leds.has(node.led))throw Error(`Duplicate node or LED at ${node.id}`);
  nodeIds.add(node.id);leds.add(node.led);
  const routes=stations.get(node.stationId)||new Set;node.routes.forEach(route=>routes.add(route));stations.set(node.stationId,routes);
}
const shared=[...stations.values()].filter(routes=>routes.size>1).length;
if(shared<300)throw Error(`Only ${shared} shared stops were linked; expected more than 300`);
const html=fs.readFileSync(path.join(root,"web/trondheim-wizard/index.html"),"utf8");
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match=>match[1]);
if(!scripts.length)throw Error("Wizard has no script");
scripts.forEach((script,index)=>new vm.Script(script,{filename:`trondheim-wizard-${index}.js`}));
console.log(`Trondheim city catalog OK: ${actual.length} lines, ${stations.size} stops, ${shared} shared stops.`);
