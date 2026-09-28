import {STATUSES,value,date,escape,status,summary,filterDevices,listRows,details,errorRows,historyRows} from "./model.mjs";
import {createClient,FleetStore,REFRESH_MS} from "./client.mjs";
const $=id=>document.getElementById(id),client=createClient(),store=new FleetStore(client);
let connected=false,listRequest=null,detailRequest=null,selected=null,listTimer=null,detailTimer=null,session=0;
const filters=()=>({search:$("search").value,status:$("status").value,board:$("board").value,firmware:$("firmware").value});
function options(id,values){const previous=$(id).value;$(id).replaceChildren(new Option("Alle",""),...[...new Set(values.filter(Boolean)),...(previous?[previous]:[])].filter((v,i,a)=>a.indexOf(v)===i).sort().map(v=>new Option(v,v)));$(id).value=previous;}
function render(){
 const s=summary(store.devices),known=store.devices.length+store.unavailable.length;
 $("scope").textContent=(store.nextCursor?"Minst ":"")+known+" registrerte enheter"+(store.nextCursor?" — flere sider finnes.":" — alle sider er lastet.")+" Oppsummering og filtre gjelder kun innlastede, lesbare enheter.";
 $("summary").innerHTML=[["Innlastet",s.total],...Object.entries(s.counts)].map(([k,v])=>'<div class="card '+(STATUSES.includes(k)?k:"")+'">'+escape(k)+'<strong>'+v+'</strong></div>').join("");
 for(const [id,distribution] of [["firmwares",s.firmware],["boards",s.boards]])$(id).innerHTML=Object.entries(distribution).map(([k,v])=>"<li>"+escape(k)+" · "+v+"</li>").join("");
 options("board",store.devices.map(d=>d.boardProfile));options("firmware",store.devices.map(d=>d.firmwareVersion));
 const rows=filterDevices(store.devices,filters());$("rows").innerHTML=listRows(rows);
 $("empty").textContent=rows.length?"":store.devices.length?"Ingen treff i innlastede enheter.":store.unavailable.length?"Ingen enhetsrapporter kunne leses.":"Ingen registrerte enheter.";
 $("list-note").textContent=rows.length+" av "+store.devices.length+" lesbare enheter."+ (store.unavailable.length?" Kunne ikke lese: "+store.unavailable.join(", ")+". Dette betyr ikke OFFLINE.":"");
 $("more").hidden=!store.nextCursor;
 $("updated").textContent="Liste hentet: "+date(store.generatedAt);
}
function abort(){listRequest?.abort();detailRequest?.abort();clearTimeout(listTimer);clearTimeout(detailTimer);}
function logout(message="Frakoblet."){
 session++;connected=false;abort();client.clear();store.reset();selected=null;
 listRequest=detailRequest=null;$("token").value="";$("workspace").hidden=true;$("login").hidden=false;
 for(const id of ["rows","summary","boards","firmwares","detail-body","errors","history"])$(id).replaceChildren();
 for(const id of ["scope","updated","list-note","empty","detail-message","errors-note","history-note"])$(id).textContent="";
 $("search").value=$("status").value="";
 for(const id of ["board","firmware"])$(id).replaceChildren(new Option("Alle",""));
 $("detail-title").textContent="Enhetsdetaljer";
 $("detail").hidden=true;$("message").textContent=message;
}
function failure(error,target){
 if(error.name==="AbortError")return;
 if(error.status===401||error.status===403){logout(error.message);return;}
 // Never echo response bodies, raw URLs, fetch errors or credentials into the page.
 $(target).textContent="Oppdateringen feilet. Viste data kan være utdaterte. "+(error.status?"HTTP "+error.status+". ":"")+"Prøv igjen.";
}
function scheduleList(){clearTimeout(listTimer);if(connected&&!document.hidden)listTimer=setTimeout(()=>loadList(),REFRESH_MS);}
function scheduleDetail(){clearTimeout(detailTimer);if(connected&&selected&&!document.hidden)detailTimer=setTimeout(()=>loadDetail(),REFRESH_MS);}
async function loadList(more=false){
 if(!connected||document.hidden||listRequest)return;
 const request=listRequest=new AbortController(),generation=session;
 $("refresh").disabled=$("more").disabled=true;
 try{
  await (more?store.more(request.signal):store.refresh(request.signal));
  if(generation!==session||request.signal.aborted)return;
  render();$("message").textContent="Tilkoblet · Kun lesing. Ingen polling i skjulte faner.";
 }catch(e){if(generation===session)failure(e,"message");}
 finally{if(listRequest===request){listRequest=null;$("refresh").disabled=$("more").disabled=false;scheduleList();}}
}
async function loadDetail(){
 if(!connected||!selected||document.hidden||detailRequest)return;
 const id=selected,request=detailRequest=new AbortController(),generation=session;
 $("detail-refresh").disabled=true;
 try{
  const d=await store.detail(id,request.signal);
  if(generation!==session||selected!==id||request.signal.aborted)return;
  $("detail-body").innerHTML=details(d);
  $("errors").innerHTML=errorRows(d.errors||[]);$("errors-note").textContent=Array.isArray(d.errors)?d.errors.length+" lagrede feil (aktive og nylige).":"Feilhistorikk ikke rapportert.";
  $("history").innerHTML=historyRows(d.history||[]);$("history-note").textContent=Array.isArray(d.history)?d.history.length+" lagrede prøver. Manglende målinger fylles ikke inn.":"Historikk ikke rapportert.";
  $("detail-message").textContent="Detaljer hentet: "+date(new Date().toISOString())+" · "+status(d.status);
 }catch(e){if(generation===session&&selected===id)failure(e,"detail-message");}
 finally{if(detailRequest===request){detailRequest=null;$("detail-refresh").disabled=false;scheduleDetail();}}
}
function closeDetail(){
 detailRequest?.abort();detailRequest=null;clearTimeout(detailTimer);selected=null;$("detail").hidden=true;
 for(const id of ["detail-body","errors","history"])$(id).replaceChildren();
}
const form=$("auth");
const connect=e=>{
 e.preventDefault();const token=$("token").value.trim();if(!token)return;
 logout();client.setToken(token);connected=true;$("login").hidden=true;$("workspace").hidden=false;
 $("message").textContent="Henter fleet …";loadList();
};
form.onsubmit=connect;
$("logout").onclick=()=>logout();$("refresh").onclick=()=>loadList();$("more").onclick=()=>loadList(true);
for(const id of ["search","status","board","firmware"])$(id).addEventListener("input",render);
$("rows").onclick=e=>{
 const button=e.target.closest("[data-device]");if(!button)return;
 closeDetail();selected=button.dataset.device;$("detail").hidden=false;$("detail-title").textContent=selected;
 $("detail-message").textContent="Henter detaljer …";$("errors-note").textContent=$("history-note").textContent="";
 $("detail-title").focus();loadDetail();
};
$("close-detail").onclick=closeDetail;$("detail-refresh").onclick=loadDetail;
document.addEventListener("visibilitychange",()=>{
 if(document.hidden){abort();}else if(connected){loadList();loadDetail();}
});
window.addEventListener("pagehide",()=>logout());
