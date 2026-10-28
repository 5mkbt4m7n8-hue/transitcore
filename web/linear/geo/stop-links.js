// Shared, local-only stop-name bridge for the two map views.
// The geographic editor owns this existing draft key; no schematic layout is rewritten.
(function(root,factory){
 const api=factory(typeof module==='object'?require('./model.js'):root.InTransitGeoModel);
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.InTransitStopLinks=api;
})(globalThis,function(Geo){
 'use strict';
 const KEY='intransit-geo-draft-v1',LIMIT=2000000;
 function fingerprint(layout){
  const ids=(layout?.stops||[]).map(s=>s.id).join('|');
  let hash=2166136261;
  for(const ch of ids){hash^=ch.charCodeAt(0);hash=Math.imul(hash,16777619);}
  return (hash>>>0).toString(16)+'-'+layout.stops.length;
 }
 function load(layout,store){
  const storage=store||localStorage;
  const raw=storage.getItem(KEY),fp=fingerprint(layout);
  if(!raw)return {fingerprint:fp,geo:Geo.empty()};
  if(raw.length>LIMIT)throw Error('Geografisk arbeidskopi er for stor; behold en eksport.');
  const value=JSON.parse(raw);
  if(value?.fingerprint!==fp)throw Error('Geografisk arbeidskopi passer ikke til gjeldende originalstopp. Eksporter den først.');
  Geo.validate(value.geo,layout);
  return value;
 }
 function names(layout,store){
  try{return {...load(layout,store).geo.names};}
  catch{return {};} // Bad/stale drafts are never silently overwritten by a name edit.
 }
 function rename(layout,id,name,store){
  const storage=store||localStorage;
  const draft=load(layout,storage);
  Geo.renameStop(draft.geo,layout,id,name);Geo.validate(draft.geo,layout);
  storage.setItem(KEY,JSON.stringify(draft));
  return {...draft.geo.names};
 }
 // Apply one coherent remote name snapshot without overwriting manually
 // placed GPS coordinates or geographic paths saved on this device.
 function replaceNames(layout,names,store){
  const storage=store||localStorage,draft=load(layout,storage);
  if(!names||typeof names!=="object"||Array.isArray(names))throw Error("Ugyldige sky-navn");
  draft.geo.names={...names};
  Geo.validate(draft.geo,layout);
  storage.setItem(KEY,JSON.stringify(draft));
  return {...draft.geo.names};
 }
 function readGeo(layout,store){return load(layout,store).geo;}
 function schematicUrl(id){return '../index.html?view=network&stop='+encodeURIComponent(id);}
 function geographicUrl(id){return './geo/?stop='+encodeURIComponent(id);}
 return {KEY,fingerprint,load,names,rename,replaceNames,readGeo,schematicUrl,geographicUrl};
});
