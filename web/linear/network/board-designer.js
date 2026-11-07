(function(root){
 'use strict';
 // This layer changes navigation and presentation only. All edits still use
 // the physical-board transaction/validation and per-format storage below it.
 root.InTransitBoardDesigner={create(host,api){
  const q=r=>host.querySelector(`[data-role="${r}"]`),panel=q('boardPanel');
  let active=false,tool='move',selected=null,zoom=1,baseWidth=null;
  const nav=document.createElement('nav');nav.className='designer-nav';
  nav.setAttribute('aria-label','Kart eller tavledesign');
  nav.innerHTML='<button type="button" data-view="live" aria-pressed="true">Sanntidskart</button><button type="button" data-view="board" aria-pressed="false">Tavledesigner</button>';
  host.prepend(nav);
  const intro=document.createElement('section');intro.className='designer-intro';
  intro.innerHTML='<h2>Lag din InTransit-tavle</h2><p><a href="studio.html">Åpne Map Studio · lag nye kart og linjer</a></p><p>1. Velg størrelse. 2. Velg en stasjon eller linje. 3. Dra for å forme tavlen.</p><p>Du arbeider med en egen tegning for hvert tavleformat. Originalkart og holdeplasskoblinger beholdes.</p>';
  panel.querySelector('summary').after(intro);
  const controls=panel.querySelector('.map-board-controls');
  const primary=document.createElement('div');primary.className='designer-primary';
  const tools=document.createElement('div');tools.className='designer-tools';tools.setAttribute('aria-label','Tavleverktøy');
  tools.innerHTML='<button type="button" data-tool="move">Flytt stasjon / navn</button><button type="button" data-tool="route">Form linje</button><button type="button" data-tool="preview">Se tavlen</button><button type="button" data-save>Lagre prosjekt</button><button type="button" data-open>Åpne prosjekt</button>';
  tools.insertAdjacentHTML('beforeend','<label>Forstørrelse <select data-zoom aria-label="Forstørr tavlen"><option value="1">Hele tavlen</option><option value="1.5">150 %</option><option value="2">200 %</option><option value="3">300 %</option></select></label><span data-role="designerStatus" role="status"></span>');
  tools.querySelector('[data-role=designerStatus]').textContent=q('draftStatus').textContent;
  const help=document.createElement('p');help.className='designer-help';help.setAttribute('role','status');
  const route=document.createElement('div');route.className='designer-route';
  const advanced=document.createElement('details');advanced.className='designer-advanced';
  advanced.innerHTML='<summary>Flere innstillinger</summary><div class="designer-settings"></div>';
  advanced.open=true;
  controls.before(primary,tools,help,route,advanced);
  const move=(role,target)=>{const item=q(role);target.append(item.closest('label')||item);};
  for(const role of ['boardPreset','boardWidth','boardHeight','boardUndo','boardExport'])move(role,primary);
  for(const role of ['boardPath','boardSegment','boardAddBend','boardBendSelect','boardRemoveBend'])move(role,route);
  for(const child of [...controls.children])advanced.lastElementChild.append(child);
  controls.remove();
  const body=document.createElement('div');body.className='designer-body';
  for(const child of [...panel.children])if(child.tagName!=='SUMMARY')body.append(child);
  panel.append(body);
  // Existing selectors and handlers are retained for the technical editor.
  for(const node of [primary,route,advanced.lastElementChild])node.classList.add('map-board-controls');
  q('boardAddBend').textContent='+ Legg til punkt';
  q('boardRemoveBend').textContent='Fjern ekstra punkt';
  q('boardExport').textContent='Last ned tavlen (SVG)';
  function sync(){
   if(!active)return;
   q('boardMove').checked=tool==='move';q('boardRouteEdit').checked=tool==='route';
   panel.dataset.tool=tool;
   tools.querySelectorAll('[data-tool]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tool===tool)));
   help.textContent=tool==='move'?'Klikk på en stasjon eller et navn for å velge det. Dra for å flytte. Piltaster finjusterer.':tool==='route'?'Klikk på en linje. Dra de blå punktene for å forme den. Velg en delstrekning og «Legg til punkt» for en ny knekk.':'Forhåndsvisning: prøv et annet format, eller last ned tavlen.';
   primary.querySelectorAll('label').forEach(label=>{const r=label.querySelector('input')?.dataset.role;if(r==='boardWidth'||r==='boardHeight')label.hidden=q('boardPreset').value!=='custom';});
   api.render();
  }
  function enter(value){
   active=value;selected=null;
   advanced.open=!value;
   if(!value)primary.querySelectorAll('label').forEach(label=>label.hidden=false);
   if(value)api.enableEditing();
   else {q('boardMove').checked=false;q('boardRouteEdit').checked=false;api.disableEditing();}
   document.body.classList.toggle('board-designer-mode',value);
   host.classList.toggle('board-designer',value);panel.open=value;
   nav.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String((b.dataset.view==='board')===value)));
   if(value)sync();
  }
  nav.onclick=e=>{if(e.target.dataset.view)enter(e.target.dataset.view==='board');};
  tools.onclick=e=>{if(e.target.dataset.tool){tool=e.target.dataset.tool;selected=null;sync();}if(e.target.hasAttribute('data-save'))api.save();if(e.target.hasAttribute('data-open'))api.open();};
  tools.querySelector('[data-zoom]').onchange=e=>{zoom=Number(e.target.value);decorate();};
  q('boardPreset').addEventListener('change',sync);
  const board=q('boardSvgHost');
  board.addEventListener('pointerdown',e=>{
   if(!active||tool==='preview')return;
   const node=e.target.closest('[data-board-key],[data-board-label],[data-board-group],[data-board-route-path],polyline[data-route]');
   if(!node)return;
   if(tool==='route'){
    const path=node.dataset.boardRoutePath||node.dataset.route;
    if(!path)return;
    q('boardPath').value=path;
    if(node.matches('polyline'))q('boardPath').onchange();
    selected={attribute:'data-route',value:path};
    help.textContent='Linje valgt. Dra et blått punkt, eller velg delstrekning og legg til et punkt.';
   }else{
    const attribute=['data-board-label','data-board-group','data-board-key'].find(a=>node.hasAttribute(a));
    if(!attribute)return;
    selected={attribute,value:node.getAttribute(attribute)};
    const stopId=node.dataset.boardLabel||node.dataset.stop;
    help.textContent=(api.name(stopId)||'Stasjon')+' valgt. Dra for å flytte. Angre gjenoppretter siste endring.';
   }
   decorate();
  },true);
  function decorate(){
   if(!active)return;
   const svg=board.querySelector('svg');
   if(svg){const vb=svg.viewBox.baseVal;if(baseWidth===null)baseWidth=Math.max(80,Math.min(board.clientWidth-24,innerHeight*.70*vb.width/vb.height));svg.style.width=baseWidth*zoom+'px';svg.style.maxWidth='none';svg.style.maxHeight='none';}
   board.querySelectorAll('[data-selected]').forEach(n=>n.removeAttribute('data-selected'));
   if(selected)board.querySelectorAll('['+selected.attribute+']').forEach(n=>{if(n.getAttribute(selected.attribute)===selected.value)n.dataset.selected='true';});
   if(tool==='route')board.querySelectorAll('[data-board-route-path]').forEach(n=>{n.style.display=n.dataset.boardRoutePath===q('boardPath').value?'':'none';});
  }
  root.addEventListener('resize',()=>{baseWidth=null;decorate();});
  return {enter,decorate,isActive:()=>active};
 }};
})(globalThis);
