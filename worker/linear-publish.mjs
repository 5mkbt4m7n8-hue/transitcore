// Publish an authenticated, confirmed cloud snapshot as a reviewable GitHub PR.
// Never accepts raw map JSON from the browser and never commits to main directly.
import {validateLinearSnapshot,linearDraftCors} from "./linear-draft.mjs";

export const PUBLICATION_PATH="web/linear/network/published-edits.json";
const CANONICAL_PATH="web/linear/network/trondheim-layout.json";
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{
 ...linearDraftCors,"access-control-allow-methods":"POST, OPTIONS"
}});
export function fingerprint(value){
 const source=JSON.stringify(value);
 let hash=2166136261;
 for(let i=0;i<source.length;i++){hash^=source.charCodeAt(i);hash=Math.imul(hash,16777619);}
 return (hash>>>0).toString(16)+"-"+source.length;
}
export function createPublication(snapshot,canonical,publishedAt){
 validateLinearSnapshot(snapshot);
 if(snapshot.baseFingerprint!==fingerprint(canonical))throw Error("canonical_version_mismatch");
 const originalIds=new Set(canonical.stops.map(s=>s.id));
 const editsById=new Map(snapshot.layout.stops.map(s=>[s.id,s]));
 if(snapshot.layout.stops.length<canonical.stops.length)throw Error("original_stop_removed");
 for(const source of canonical.stops){
  const changed=editsById.get(source.id);
  if(!changed)throw Error("original_stop_removed");
  const protectedFields=record=>{
   const {x,y,label,radius,diodeMode,platformSides,...protectedPart}=record;
   return protectedPart;
  };
  // NSR/Quay IDs, verification and official names are never re-authored
  // by publishing geometry or a display-name alias.
  if(JSON.stringify(protectedFields(changed))!==JSON.stringify(protectedFields(source)))
   throw Error("official_stop_mapping_modified");
 }
 for(const stop of snapshot.layout.stops){
  if(!originalIds.has(stop.id)&&!stop.id.startsWith("custom-stop-"))throw Error("invalid_custom_stop");
 }
 const originalPaths=new Set(canonical.paths.map(p=>p.id));
 for(const id of originalPaths)if(!snapshot.layout.paths.some(p=>p.id===id))throw Error("original_path_removed");
 // Keep source reference, original photo details, geographic identifiers and
 // map coverage immutable. Only schematic stops and paths are publishable.
 const meta=layout=>{const {stops,paths,...other}=layout;return other;};
 if(JSON.stringify(meta(snapshot.layout))!==JSON.stringify(meta(canonical)))throw Error("immutable_layout_metadata_modified");
 const publication={
  version:1,baseFingerprint:snapshot.baseFingerprint,sourceRevision:snapshot.revision,
  publishedAt,layout:snapshot.layout,names:snapshot.names
 };
 const previousStopIds=new Map(canonical.stops.map(s=>[s.id,s]));
 const movedStops=snapshot.layout.stops.filter(s=>{
  const old=previousStopIds.get(s.id);
  return !old||old.x!==s.x||old.y!==s.y||
   JSON.stringify(old.label)!==JSON.stringify(s.label);
 }).length;
 const sourcePaths=new Map(canonical.paths.map(p=>[p.id,p]));
 const editedPaths=snapshot.layout.paths.filter(p=>{
  const old=sourcePaths.get(p.id);
  return !old||JSON.stringify(old)!==JSON.stringify(p);
 }).length;
 return {publication,changes:{movedOrAddedStops:movedStops,editedOrAddedPaths:editedPaths,renamedStops:Object.keys(snapshot.names).length}};
}
function decodeGithubFile(value){
 if(!value?.content||value.encoding!=="base64")throw Error("github_file_encoding_unknown");
 const binary=atob(value.content.replace(/\s/g,""));
 const bytes=Uint8Array.from(binary,s=>s.charCodeAt(0));
 return JSON.parse(new TextDecoder().decode(bytes));
}
function encodeGithubFile(text){
 const bytes=new TextEncoder().encode(text);
 let binary="";
 for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
 return btoa(binary);
}
export async function publishLinearDraft({expectedRevision,storage,githubApi,repository="5mkbt4m7n8-hue/transitcore",now=()=>new Date()}){
 if(!Number.isSafeInteger(expectedRevision)||expectedRevision<1) return {status:400,body:{error:"invalid_revision"}};
 if(!/^[a-zA-Z\d_.-]+\/[a-zA-Z\d_.-]+$/.test(repository))return {status:500,body:{error:"invalid_repository_config"}};
 const response=await storage.fetch("https://status.internal/linear-draft");
 if(!response.ok)return {status:503,body:{error:"draft_storage_unavailable"}};
 const {snapshot,revision}=await response.json();
 if(!snapshot)return {status:409,body:{error:"no_saved_cloud_draft"}};
 if(revision!==expectedRevision)return {status:409,body:{error:"revision_conflict",revision}};
 const branchRef=await githubApi(`/repos/${repository}/git/ref/heads/main`);
 const sha=branchRef.object.sha;
 const apiPath=path=>`/repos/${repository}/contents/${path}?ref=${encodeURIComponent(sha)}`;
 const canonicalFile=await githubApi(apiPath(CANONICAL_PATH));
 const canonical=decodeGithubFile(canonicalFile);
 const {publication,changes}=createPublication(snapshot,canonical,now().toISOString());
 let existing=null;
 try{existing=await githubApi(apiPath(PUBLICATION_PATH));}
 catch(error){if(error.status!==404)throw error;}
 if(existing){
  const previous=decodeGithubFile(existing);
  if(Number(previous.sourceRevision)>revision)return {status:409,body:{error:"published_newer_revision"}};
  if(JSON.stringify({layout:previous.layout,names:previous.names})===
    JSON.stringify({layout:publication.layout,names:publication.names}))
   return {status:200,body:{ok:true,noChanges:true,revision,message:"Kartet er allerede likt den publiserte versjonen."}};
 }
 const branch=`publish/trondheim-linear-${revision}-${Date.now()}`;
 await githubApi(`/repos/${repository}/git/refs`,{method:"POST",body:JSON.stringify({
  ref:`refs/heads/${branch}`,sha
 })});
 const content=JSON.stringify(publication,null,2)+"\n";
 await githubApi(`/repos/${repository}/contents/${PUBLICATION_PATH}`,{
  method:"PUT",body:JSON.stringify({
   message:`Publish Trondheim Linear map draft r${revision}`,
   branch,content:encodeGithubFile(content),
   ...(existing?.sha?{sha:existing.sha}:{})
  })
 });
 const pull=await githubApi(`/repos/${repository}/pulls`,{
  method:"POST",body:JSON.stringify({
   title:`Publiser Trondheim Linear-kart (revisjon ${revision})`,head:branch,base:"main",draft:true,
   body:`## Forslag til publisering av Trondheim Linear\n\nHentet fra skyarbeidskopi **revisjon ${revision}**.\n\n- Nye/flyttede stopp: ${changes.movedOrAddedStops}\n- Nye/endrede skjemalinjer: ${changes.editedOrAddedPaths}\n- Lokale visningsnavn: ${changes.renamedStops}\n\nOriginaltegningen, NSR/Quay-koblingene og grunnfilen beholdes uendret. Endringene legges kun i \`${PUBLICATION_PATH}\`.\n\n**Kontroller kartet og GitHub Actions før denne PR-en merges til main.**`
  })
 });
 return {status:201,body:{ok:true,pullRequestUrl:pull.html_url,pullRequestNumber:pull.number,branch,revision,changes}};
}
export async function handleLinearPublish(request,env,authenticate,githubApi){
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{
  ...linearDraftCors,"access-control-allow-methods":"POST, OPTIONS"
 }});
 if(request.method!=="POST")return json({error:"method_not_allowed"},405);
 const origin=request.headers.get("origin");
 if(origin&&origin!=="https://5mkbt4m7n8-hue.github.io")return json({error:"invalid_origin"},403);
 if(!env.PUBLISH_ADMIN_TOKEN)return json({error:"admin_key_not_configured"},503);
 const bearer=request.headers.get("authorization")||"";
 if(!bearer.startsWith("Bearer ")||!await authenticate(bearer.slice(7),env.PUBLISH_ADMIN_TOKEN))
  return json({error:"unauthorized"},401);
 if(!env.DEVICE_STATUS||!env.GITHUB_PUBLISH_TOKEN)return json({error:"publishing_not_configured"},503);
 const len=Number(request.headers.get("content-length")||0);
 if(len>500)return json({error:"invalid_request_size"},413);
 let body;
 try{body=await request.json();}catch{return json({error:"invalid_json"},400);}
 try{
  const storage=env.DEVICE_STATUS.get(env.DEVICE_STATUS.idFromName("__trondheim-linear-cloud-draft__"));
  const result=await publishLinearDraft({
   expectedRevision:body?.expectedRevision,storage,githubApi,
   repository:env.GITHUB_REPOSITORY||"5mkbt4m7n8-hue/transitcore"
  });
  return json(result.body,result.status);
 }catch(error){
  console.error("schematic publish failed",error);
  return json({error:"publish_failed",message:error.message},error.message==="canonical_version_mismatch"?409:400);
 }
}
