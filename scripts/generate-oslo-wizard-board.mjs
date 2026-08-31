import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=relative=>JSON.parse(fs.readFileSync(path.join(root,relative),"utf8"));
const write=(relative,value)=>fs.writeFileSync(path.join(root,relative),JSON.stringify(value,null,2)+"\n");
const a=read("config/boards/oslo-metro-board-direction-a.json");
const b=read("config/boards/oslo-metro-board-direction-b.json");
const existing=read("config/boards/oslo-metro-wizard-separate.json");
const existingLeds=new Map(existing.nodes.map(node=>[node.id,node.led]));

const nodes=[
  ...a.nodes.map(node=>({...node,id:`${node.id}-direction-a`,stationId:node.id,directionSide:"A"})),
  ...b.nodes.map(node=>({...node,id:`${node.id}-direction-b`,stationId:node.id,directionSide:"B"})),
].sort((left,right)=>{
  const leftLed=existingLeds.get(left.id);
  const rightLed=existingLeds.get(right.id);
  if(leftLed!==undefined&&rightLed!==undefined)return leftLed-rightLed;
  if(leftLed!==undefined)return -1;
  if(rightLed!==undefined)return 1;
  return left.name.localeCompare(right.name,"no")||left.directionSide.localeCompare(right.directionSide);
});
nodes.forEach((node,led)=>{node.led=led});

const board={
  schemaVersion:1,
  id:"oslo-metro-wizard-separate",
  name:"Oslo T-bane · begge retninger / separate LED-er",
  layout:"station-network",
  generatedByWizard:true,
  directionMode:"separate",
  routes:[...a.routes],
  leds:{count:nodes.length,dataPin:null,brightnessLimit:32},
  nodes,
  render:{collisionMode:"alternate",routePriority:[],arrivalHoldSeconds:45,freshnessSeconds:120,departureAfterglowSeconds:10},
  status:"wizard-draft-hardware-order-pending"
};

const assignments=nodes.map(node=>({
  sourceNodeId:node.id,
  stationId:node.stationId,
  quayId:null,
  name:node.name,
  direction:`Retning ${node.directionSide}`,
  routes:node.routes,
  logicalLed:node.led,
  physicalLed:node.led
}));
const hardware={
  schemaVersion:1,
  id:"oslo-metro-wizard-separate-hardware",
  name:"Oslo T-bane · begge retninger / separate LED-er hardwareprofil",
  boardProfile:board.id,
  leds:{count:nodes.length,dataPin:null,brightnessLimit:32},
  assignments
};

write("config/boards/oslo-metro-wizard-separate.json",board);
write("config/hardware/oslo-metro-wizard-separate-hardware.json",hardware);
console.log(`Generated Oslo wizard board with ${new Set(nodes.map(node=>node.stationId)).size} stations and ${nodes.length} directional LEDs.`);
