'use strict';
const params=new URLSearchParams(location.search),boardId=params.get('board')||'trondheim-bus-1-visual-test';
const deviceId=params.get('device')||'',origin='https://transitcore-led-feed.lgb84.workers.dev';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let model,board,nodes=[],timer,statusTimer,busy=false,algorithm='Ikke rapportert';
const millis=()=>Math.floor(performance.now())>>>0;
async function json(url){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error(`HTTP ${r.status}`);return r.json();}
function paint(){if(!model)return;const s=model.sample(Date.now(),millis());
  $('frame').textContent=`Frame ${s.sequence??'–'} · ${s.generatedAt??'–'}\nAlder ${s.ageSeconds==null?'–':s.ageSeconds.toFixed(1)+' s'} · ${s.status}${s.error?' · '+s.error:''}`;
  $('algorithm').textContent=`Algoritme rapportert av Worker: ${algorithm}`;
  $('rows').innerHTML=s.leds.map(l=>`<tr><td>${l.id}</td><td>${esc(nodes[l.id]?.name)}</td><td>${esc(l.vehicleIds.join(', ')||'–')}</td><td>${l.state}</td><td>${l.logicalLevel}</td><td>${esc(l.changedAt||'Ikke observert')}</td></tr>`).join('');
  for(const l of s.leds){const el=$('pixel-'+l.id);el.querySelector('.lamp').style.opacity=Math.min(1,l.logicalLevel/32);el.querySelector('.state').textContent=l.state;}
}
async function refresh(){clearTimeout(timer);if(document.hidden||busy||!model)return;busy=true;
  try{const r=await fetch(`${origin}/api/v1/frame/${encodeURIComponent(boardId)}`,{cache:'no-store'});if(!r.ok)throw Error(`HTTP ${r.status}`);
    const frame=await r.json();if(model.accept(frame,Date.now(),millis()))algorithm=r.headers.get('x-transitcore-stop-algorithm')||'Ikke rapportert (eldre backend)';
  }catch(e){model.failed(e.message);}finally{busy=false;paint();if(!document.hidden)timer=setTimeout(refresh,10000);}
}
async function status(){clearTimeout(statusTimer);if(document.hidden||!deviceId)return;
  try{const data=await json(`${origin}/v1/devices/${encodeURIComponent(deviceId)}/status`),s=data.latest;
    $('esp').textContent=s?`Device: ${deviceId}\nRapport mottatt: ${s.receivedAt??'Ikke rapportert'}\nFrame-sekvens: ${s.lastFrameSequence??s.lastSequence??'Ikke rapportert'} · frame-alder ved rapport: ${s.lastFrameAgeSeconds??s.frameAgeSeconds??'Ikke rapportert'}\nTilstand per LED: Ikke rapportert. Ingen målt web/ESP-differanse tilgjengelig.`:'Ingen lagret status';
  }catch(e){$('esp').textContent=`Status utilgjengelig: ${e.message}. Ingen målt ESP-tilstand.`;}finally{if(!document.hidden)statusTimer=setTimeout(status,60000);}
}
async function init(){if(!/^[a-z0-9-]{3,120}$/.test(boardId))throw Error('Ugyldig board-id');
  board=await json(`../../config/boards/${boardId}.json`);const h=await json(`../../config/hardware/${boardId}-hardware.json`);
  if(h.boardProfile!==boardId||h.leds.count!==board.leds.count||h.assignments.length!==board.nodes.length)throw Error('Hardwareprofil samsvarer ikke');
  const seen=new Set();for(const a of h.assignments){const n=board.nodes.find(n=>n.led===a.logicalLed);if(!n||!Number.isInteger(a.physicalLed)||a.physicalLed<0||a.physicalLed>=h.leds.count||seen.has(a.physicalLed))throw Error('Ugyldig mapping');seen.add(a.physicalLed);nodes[a.physicalLed]=n;}
  model=TransitCoreBoardClient.create({boardProfile:boardId,ledCount:h.leds.count,visual:board.render?.visual});
  $('name').textContent=`${board.name} · fysisk indeks 0–${h.leds.count-1}`;
  $('source').textContent=`Kilde: ${origin}/api/v1/frame/${boardId} · polling 10 s · profilvisual ${JSON.stringify(board.render?.visual||{})}`;
  $('leds').innerHTML=nodes.map((n,i)=>`<article class="led" id="pixel-${i}"><div class="lamp"></div>LED ${i}<br>${esc(n.name)}<br><small class="state"></small></article>`).join('');
  setInterval(paint,40);await refresh();status();
}
$('refresh').onclick=refresh;document.addEventListener('visibilitychange',()=>{clearTimeout(timer);clearTimeout(statusTimer);if(!document.hidden){refresh();status();paint();}});
init().catch(e=>{$('frame').textContent=e.message;$('frame').className='error';});
