(function(root){
 'use strict';
 const M=root.InTransitStopAdminModel,N=root.InTransitStopLinks;
 const $=id=>document.getElementById(id),node=(tag,text,cls)=>{
  const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text);
  if(cls)e.className=cls;return e;
 };
 const statusLabel=row=>row.geoStatus==='manual'?'Manuell':row.geoStatus==='candidate'?'Forslag':'Mangler';
 const mappingLabel=row=>row.mappingStatus==='confirmed'?'Koblet':row.mappingStatus==='review'?'Kontroller':'Uavklart';
 async function json(url){
  const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw Error(url+' (HTTP '+response.status+')');
  return response.json();
 }
 async function init(){
  const [layout,catalog,bus,shared,fly]=await Promise.all([
   json('../network/trondheim-layout.json'),
   json('../../../config/boards/trondheim-city-lines-catalog.json'),
   json('../../../config/boards/trondheim-bus-board.json'),
   json('../../../config/boards/trondheim-shared-stops-board.json'),
   json('../../../config/boards/trondheim-flybuss-live.json')
  ]);
  const boards=[catalog,bus,shared,fly],initialIds=new Set(layout.stops.map(stop=>stop.id));
  if(initialIds.size!==layout.stops.length)throw Error('Originalkartet har dupliserte stopp-ID-er.');
  const key=N.KEY;
  let geo,rows=[],selected='',lastFilter=[];
  const announce=message=>{$('notice').textContent=message;};
  function refreshData(){
   // Never overwrite an incompatible draft. Browsing remains possible but
   // local-name changes will be rejected by the shared bridge.
   try{geo=N.readGeo(layout);announce('Lokal arbeidskopi innlest. Navn og geografi er adskilt fra originalkartet.');}
   catch(error){geo=root.InTransitGeoModel.empty();announce('Kan ikke lese geografisk arbeidskopi: '+error.message+' Visningen bruker originaldata. Eksporter gammel arbeidskopi før redigering.');}
   rows=M.build(layout,boards,geo);
   const stats=M.summary(rows);
   const boxes=[
    [stats.total,'Originale kartstopp'],
    [stats.unconfirmedNames,'Ubekreftede originalnavn'],
    [stats.unresolvedMappings,'Kobling må gjennomgås'],
    [stats.manualCoordinates+' / '+stats.candidateCoordinates,'Manuelle / foreslåtte posisjoner']
   ];
   $('stats').replaceChildren(...boxes.map(([value,label])=>{
    const box=node('div',undefined,'stat');
    box.append(node('strong',value),node('span',label));return box;
   }));
  }
  function showDetails(){
   const row=rows.find(x=>x.id===selected),dl=$('facts');
   $('renameForm').hidden=!row;$('jump').hidden=!row;
   if(!row){$('detailTitle').textContent='Velg en holdeplass';$('detailSubtitle').textContent='Velg en rad for å kontrollere data og redigere lokalt navn.';dl.replaceChildren();return;}
   $('detailTitle').textContent=row.displayName;
   $('detailSubtitle').textContent=row.id+' · '+(row.nameConfirmed?'Originalnavn bekreftet':'Originalnavn ikke bekreftet');
   const facts=[
    ['Originalnavn',row.originalName],
    ['Lokalt visningsnavn',row.alias||'Ingen – viser originalnavnet'],
    ['Navn i originalkilden',row.nameConfirmed?'Bekreftet':'Ikke bekreftet (lokalt navn endrer ikke dette)'],
    ['Kartkobling',mappingLabel(row)+' ('+row.bindingCount+' av '+row.totalBindings+' gyldige plattformkoblinger)'],
    ['Geografisk posisjon',row.geoEvidence],
    ['Koordinat (longitude, latitude)',row.coordinates?row.coordinates.map(x=>x.toFixed(6)).join(', '):'Ikke dokumentert'],
    ['Quay-ID-er',row.quays.length?row.quays.join(' · '):'Ingen verifiserte Quay-koblinger'],
    ['StopPlace-ID-er',row.stopPlaces.length?row.stopPlaces.join(' · '):'Ikke dokumentert'],
    ['Originale skjemakoordinater',row.originalX+', '+row.originalY+' (ikke GPS)']
   ];
   dl.replaceChildren(...facts.map(([term,value])=>{
    const wrapper=node('div');wrapper.append(node('dt',term),node('dd',value));return wrapper;
   }));
   $('alias').value=row.alias;
   $('schematicLink').href='../index.html?view=network&stop='+encodeURIComponent(row.id);
   $('geoLink').href='../geo/?stop='+encodeURIComponent(row.id);
  }
  function draw(){
   lastFilter=M.filter(rows,{term:$('search').value,status:$('filter').value,sort:$('sort').value});
   $('resultCount').textContent=lastFilter.length+' av '+rows.length;
   const fragment=document.createDocumentFragment();
   for(const row of lastFilter){
    const tr=node('tr');tr.dataset.id=row.id;tr.tabIndex=0;tr.setAttribute('aria-selected',String(selected===row.id));
    const name=node('td');name.append(node('b',row.displayName),node('small',row.id));
    const label=node('td');label.append(node('span',row.nameConfirmed?'Bekreftet':'Ubekreftet','status '+(row.nameConfirmed?'ok':'pending')));
    if(row.alias)label.append(node('small','Lokalt navn'));
    const binding=node('td');binding.append(node('span',mappingLabel(row),'status '+(row.mappingStatus==='confirmed'?'ok':'pending')));
    const coords=node('td');coords.append(node('span',statusLabel(row),'status '+(row.geoStatus==='manual'?'ok':'pending')));
    tr.append(name,label,binding,coords);
    const select=()=>{selected=row.id;draw();showDetails();};
    tr.addEventListener('click',select);
    tr.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}});
    fragment.append(tr);
   }
   $('results').replaceChildren(fragment);
  }
  function applyRename(value){
   if(!selected)return;
   try{
    N.rename(layout,selected,value);
    refreshData();draw();showDetails();
    announce('Lokalt navn oppdatert for '+selected+'. Geografiske linjer, koordinater og original-IDs er uendret.');
   }catch(error){announce('Kunne ikke lagre navn: '+error.message);}
  }
  $('renameForm').addEventListener('submit',e=>{e.preventDefault();applyRename($('alias').value);});
  $('reset').addEventListener('click',()=>applyRename(''));
  for(const id of ['search','filter','sort'])$(id).addEventListener(id==='search'?'input':'change',draw);
  $('export').addEventListener('click',()=>{
   const csv=M.csv(lastFilter),blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
   const url=URL.createObjectURL(blob),link=node('a');
   link.href=url;link.download='intransit-holdeplasser.csv';link.click();
   setTimeout(()=>URL.revokeObjectURL(url),1000);
   announce('Eksporterte '+lastFilter.length+' kartstopp. CSV viser status, ikke faktiske bussposisjoner.');
  });
  root.addEventListener('storage',event=>{
   if(event.key!==key)return;
   const keep=selected;refreshData();selected=keep;draw();showDetails();
  });
  refreshData();
  const requested=new URLSearchParams(location.search).get('stop');
  selected=initialIds.has(requested)?requested:'';
  draw();showDetails();
 }
 init().catch(error=>{
  $('notice').textContent='Kunne ikke laste holdeplassadministrasjonen: '+error.message;
  $('export').disabled=true;
 });
})(globalThis);
