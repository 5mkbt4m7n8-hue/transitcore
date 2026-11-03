(function(root){
 'use strict';
 const D=root.InTransitStudioDocument||(typeof require==='function'?require('./studio-document.js'):null),clone=v=>structuredClone(v),eps=1e-8;
 function parameter(line,p){if(!p||!Number.isInteger(p.segment)||p.segment<0||p.segment>=line.points.length-1||!Number.isFinite(p.t)||p.t<0||p.t>1)throw Error('Velg to punkter på linjen');return p.segment+p.t;}
 function pointAt(line,u){if(Math.abs(u-Math.round(u))<eps)return clone(line.points[Math.round(u)]);const i=Math.floor(u),t=u-i,a=line.points[i],b=line.points[i+1];return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};}
 function portion(line,a,b){if(b-a<eps)return null;const points=[pointAt(line,a)];for(let i=Math.floor(a)+1;i<b-eps;i++)points.push(clone(line.points[i]));points.push(pointAt(line,b));return points;}
 function sectionRange(d,id,from,to){const line=d.artwork.lines.find(l=>l.id===id);if(!line)throw Error('Velg en linje');const ends=[parameter(line,from),parameter(line,to)].sort((a,b)=>a-b),[a,b]=ends;if(b-a<eps)throw Error('Velg to forskjellige punkter');return {a,b,points:portion(line,a,b),before:portion(line,0,a),after:portion(line,b,line.points.length-1)};}
 function sectionStations(d,id,from,to){const line=d.artwork.lines.find(l=>l.id===id),range=sectionRange(d,id,from,to);return d.artwork.stops.filter(s=>{if(s.lineIds.length&&!s.lineIds.includes(id))return false;const location=s.anchor?D.stationLayout(d,s).points.find(p=>p.lineId===id)||s:s,p=D.project(location,line),u=p.segment+p.t;return (s.lineIds.includes(id)||p.dist<=12)&&u>=range.a-eps&&u<=range.b+eps;}).map(s=>({id:s.id,name:s.name,linked:s.lineIds.includes(id)}));}
 function editSection(d,id,from,to,{operation,stationPolicy,name,newIds}={}){
  const line=d.artwork.lines.find(l=>l.id===id);if(!line||line.locked||!['extract','remove'].includes(operation))throw Error('Velg en ulåst linje og en handling');const range=sectionRange(d,id,from,to);if(!range.before&&!range.after)throw Error('Velg en del av linjen. Bruk Slett linje for hele linjen.');
  const affected=sectionStations(d,id,from,to),affectedIds=new Set(affected.map(s=>s.id));if(affected.length&&!['keep','extract'].includes(stationPolicy)||operation==='remove'&&stationPolicy==='extract')throw Error('Velg uttrykkelig hvordan stasjonene skal beholdes');if(affected.some(s=>d.artwork.stops.find(o=>o.id===s.id).locked&&(stationPolicy==='extract'||s.linked)))throw Error('Lås opp stasjonene før de knyttes til en ny strekning');
  const saved=d.artwork.stops.map(s=>({id:s.id,layout:s.anchor?clone(D.stationLayout(d,s)):null,point:s.anchor?clone(D.stationLayout(d,s).points.find(p=>p.lineId===id)||s):clone(s)})),group=D.groupFor(d,id);if(group)D.detachGroup(d,group.id);
  const pieces=[],make=(role,points,pieceId)=>{if(!points)return;const piece={...clone(line),id:pieceId,name:role==='extracted'?(name||line.name+' · utskilt').slice(0,200):line.name,points,sectionOf:{rootId:line.sectionOf?.rootId||line.id,parentId:line.id,role}};pieces.push(piece);return piece;};
  const before=make('before',range.before,id),extracted=operation==='extract'?make('extracted',range.points,newIds?.section):null,after=make('after',range.after,before?newIds?.after:id);if(pieces.some(p=>typeof p.id!=='string'||!p.id)||new Set(pieces.map(p=>p.id)).size!==pieces.length||pieces.some(p=>p.id!==id&&d.artwork.lines.some(l=>l.id===p.id)))throw Error('Ugyldige identiteter for delstrekninger');
  d.artwork.lines.splice(d.artwork.lines.findIndex(l=>l.id===id),1,...pieces);const addLeds=[];
  for(const s of d.artwork.stops){const was=saved.find(v=>v.id===s.id);if(!s.lineIds.includes(id)){if(affectedIds.has(s.id)&&stationPolicy==='extract'){s.lineIds.push(extracted.id);addLeds.push(s.id);}continue;}
   const p=D.project(was.point,line),u=p.segment+p.t,inSection=u>=range.a-eps&&u<=range.b+eps,target=inSection?(stationPolicy==='extract'?extracted:null):u<range.a?before:after;
   s.lineIds=s.lineIds.flatMap(v=>v===id?(target?[target.id]:[]):[v]);if(target)for(const led of s.leds||[])if(led.lineId===id)led.lineId=target.id;
   if(s.anchor){if(!target){delete s.anchor;continue;}if(s.anchor.lineId===id){const q=D.project(was.layout.points.find(p=>p.lineId===id),target);Object.assign(s.anchor,{lineId:target.id,segment:q.segment,t:q.t});delete s.anchor.progress;}
    s.anchor.fixedPoints=was.layout.points.map(p=>({...p,lineId:p.lineId===id?target.id:p.lineId}));s.anchor.fixedAngle=was.layout.angle;
   }
  }
  for(const id of addLeds){const s=d.artwork.stops.find(s=>s.id===id);D.setStationSymbol(d,id,s.symbol||'circle');}D.validate(d);return {selectedId:extracted?.id||before?.id||after.id,pieceIds:pieces.map(p=>p.id),affected};
 }
 const baseValidate=D.validate,baseHistory=D.history;
 function validateEditing(d){baseValidate(d);for(const l of d.artwork.lines)if(l.sectionOf&&(!['before','after','extracted'].includes(l.sectionOf.role)||typeof l.sectionOf.rootId!=='string'||typeof l.sectionOf.parentId!=='string'))throw Error('Ugyldig grafisk delstrekning');return d;}
 D.validate=validateEditing;D.history=initial=>{validateEditing(initial);const h=baseHistory(initial),change=h.change;h.change=fn=>change(d=>{fn(d);validateEditing(d);});return h;};
 Object.assign(D,{sectionRange,sectionStations,editSection,pointAt});root.InTransitStudioDocument=D;if(typeof module!=='undefined')module.exports=D;
})(globalThis);
