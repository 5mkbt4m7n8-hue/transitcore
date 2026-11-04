// Canonical physical coordinates: millimetres. No screen/DPI conversions here.
export const FORMAT='intransit-board';
export const LAYERS=[['routes','Traséer'],['rings','Stasjonsringer'],['capsules','Kapsler og overganger'],['names','Stasjonsnavn'],['leds','Fysiske LED-posisjoner'],['holes','Hull og boremarkeringer'],['strips','Stripesegmenter'],['outline','Tavlekontur og montering'],['guides','Rutenett og hjelpelinjer']];
export const copy=x=>structuredClone(x);
export const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function createProject(demo=true){
 const names=['Ila','Bergsli gate','Nyveibakken','Bygrensen','Belvedere','Breidablikk','Nordre Hoem','Søndre Hoem','Rognheim','Munkvoll','Ferstad','Ugla','Kyvannet','Vestmarka','Herlofsenløypa','Lian'];
 const coords=[[198,42],[204,72],[214,102],[220,132],[230,162],[234,192],[242,222],[248,252],[224,286],[198,298],[156,306],[134,286],[108,268],[72,272],[54,298],[34,326]];
 const stations=demo?names.map((name,i)=>({id:`station-${i+1}`,name,x:coords[i][0],y:coords[i][1],ringOuter:6,ringInner:4.6,stroke:.18,holeDiameter:2.5,label:{dx:i===0?-9:i>=9?-9:9,dy:i===0?-9:i>=9?10:0,angle:0,size:3.5,spacing:.35,weight:600,font:'Arial',anchor:i>=9?'end':'start'},source:null})):[];
 return {format:FORMAT,version:1,id:'grakallbanen-board',title:demo?'Gråkallbanen · studie 01':'Ny tavle',network:{stations:[],routes:[]},schematic:null,board:{width:300,height:400,material:'general',thickness:3},layers:Object.fromEntries(LAYERS.map(([id])=>[id,{visible:!['leds','holes','strips'].includes(id),locked:false,export:id!=='guides'}])),layout:{stations,routes:demo?[{id:'route-1',stationIds:stations.map(s=>s.id),stroke:.18}]:[],guides:[]},ledLayout:{profiles:[],segments:[],bindings:[]},production:{profiles:[],mountingHoles:[]}};
}
const num=(n,min,max)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
export function parseProject(input){
 const p=typeof input==='string'?JSON.parse(input):copy(input);
 if(p?.format!==FORMAT||p.version!==1)throw Error('Ukjent prosjektformat eller versjon. Originalfilen er ikke endret.');
 if(!num(p.board?.width,20,5000)||!num(p.board?.height,20,5000))throw Error('Tavlemål må være 20–5000 mm.');
 if(!Array.isArray(p.layout?.stations)||p.layout.stations.length>5000||!Array.isArray(p.layout.routes))throw Error('Ugyldig layout.');
 const ids=new Set();
 for(const s of p.layout.stations){if(typeof s.id!=='string'||ids.has(s.id)||typeof s.name!=='string'||!num(s.x,-5000,10000)||!num(s.y,-5000,10000)||!num(s.ringOuter,.1,100)||!num(s.ringInner,.1,100)||!num(s.holeDiameter,.1,100)||!num(s.stroke,.01,10)||!s.label||!num(s.label.dx,-5000,5000)||!num(s.label.dy,-5000,5000)||!num(s.label.angle,-360,360)||!num(s.label.size,.1,100)||!num(s.label.spacing,-10,100)||!['start','middle','end'].includes(s.label.anchor))throw Error('Ugyldig stasjon eller etikett.');ids.add(s.id);}
 for(const r of p.layout.routes)if(typeof r.id!=='string'||!num(r.stroke,.01,10)||!Array.isArray(r.stationIds)||r.stationIds.some(id=>!ids.has(id)))throw Error('Ugyldig traséreferanse.');
 for(const [id] of LAYERS)if(!p.layers?.[id]||['visible','locked','export'].some(k=>typeof p.layers[id][k]!=='boolean'))throw Error('Ugyldig lagstruktur.');
 if(!Array.isArray(p.layout.guides)||p.layout.guides.some(g=>!['x','y'].includes(g.axis)||!num(g.value,0,5000)))throw Error('Ugyldige hjelpelinjer.');
 if(!p.network||!p.ledLayout||!p.production)throw Error('Prosjektet mangler dataområder.');
 return p;
}
export function serialize(p){return JSON.stringify(parseProject(p),null,2);}
export function moveStations(p,ids,dx,dy){const q=copy(p);if(q.layers.rings.locked||q.layers.holes.locked)return q;for(const s of q.layout.stations)if(ids.includes(s.id)){s.x+=dx;s.y+=dy;}return q;}
export class History{
 constructor(p){this.value=copy(p);this.past=[];this.future=[];}
 commit(p){parseProject(p);if(JSON.stringify(this.value)===JSON.stringify(p))return;this.past.push(copy(this.value));if(this.past.length>100)this.past.shift();this.value=copy(p);this.future=[];}
 undo(){if(this.past.length){this.future.push(this.value);this.value=this.past.pop();}return this.value;}
 redo(){if(this.future.length){this.past.push(this.value);this.value=this.future.pop();}return this.value;}
}
export function routeMarkup(p){return p.layout.routes.map(r=>{const points=r.stationIds.map(id=>p.layout.stations.find(s=>s.id===id));return `<path data-route="${esc(r.id)}" d="${points.map((s,i)=>`${i?'L':'M'} ${s.x} ${s.y}`).join(' ')}" fill="none" stroke="#555" stroke-width="${r.stroke}"/>`;}).join('');}
export function stationMarkup(s,layer){
 if(layer==='rings')return `<g data-station="${esc(s.id)}"><circle cx="${s.x}" cy="${s.y}" r="${s.ringOuter/2}" fill="white" stroke="#444" stroke-width="${s.stroke}"/><circle cx="${s.x}" cy="${s.y}" r="${s.ringInner/2}" fill="none" stroke="#666" stroke-width="${s.stroke}"/></g>`;
 if(layer==='holes')return `<circle data-hole="${esc(s.id)}" cx="${s.x}" cy="${s.y}" r="${s.holeDiameter/2}" fill="none" stroke="#b33" stroke-width="0.15"/>`;
 if(layer==='names'){const l=s.label;return `<text data-label="${esc(s.id)}" x="${s.x+l.dx}" y="${s.y+l.dy}" transform="rotate(${l.angle} ${s.x+l.dx} ${s.y+l.dy})" font-family="${esc(l.font)}" font-size="${l.size}" font-weight="${esc(l.weight)}" letter-spacing="${l.spacing}" text-anchor="${l.anchor}" dominant-baseline="middle" fill="#151515">${esc(s.name)}</text>`;}
 return '';
}
export function layerMarkup(p,id){if(id==='routes')return routeMarkup(p);if(['rings','names','holes'].includes(id))return p.layout.stations.map(s=>stationMarkup(s,id)).join('');if(id==='outline')return `<rect x="0" y="0" width="${p.board.width}" height="${p.board.height}" fill="none" stroke="#444" stroke-width="0.15"/>`;return '';}
export function svg(p,{layers=LAYERS.filter(([id])=>p.layers[id].export).map(([id])=>id)}={}){parseProject(p);return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${p.board.width}mm" height="${p.board.height}mm" viewBox="0 0 ${p.board.width} ${p.board.height}"><title>${esc(p.title)}</title>${LAYERS.filter(([id])=>layers.includes(id)).map(([id,name])=>`<g id="${id}" inkscape:groupmode="layer" inkscape:label="${esc(name)}">${layerMarkup(p,id)}</g>`).join('')}</svg>`;}
