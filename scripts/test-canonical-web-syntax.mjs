import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
for(const page of ['board','linear','feed','map','preview','lab','network','diagnostics']){
 const html=fs.readFileSync(new URL(`../web/${page}/index.html`,import.meta.url),'utf8');
 for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(match[1].trim())new vm.Script(match[1],{filename:page});
 if(page!=='preview'){assert(html.includes('canonical-frame-client.js'));assert(!/estimatedCalls|vehicleEndpoint|api\.entur/.test(html));}
 else assert(!html.includes('lastStops'));
}
for(const path of ['web/shared/canonical-frame-client.js','web/board/client-diagnostics.js'])new vm.Script(fs.readFileSync(new URL('../'+path,import.meta.url),'utf8'),{filename:path});
const oslo=fs.readFileSync(new URL('../web/oslo/index.html',import.meta.url),'utf8');
for(const match of oslo.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(match[1].trim())new vm.Script(match[1].replace(/^import .*;$/mg,''),{filename:'oslo-module-body'});
assert(oslo.includes('canonical-frame-client.js'));
console.log('Migrated page syntax/source boundaries PASS; browser visual QA still required');
