import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const M=require('../web/mini/model.js');
const binary=process.argv[2];
assert(binary,'Usage: node scripts/test-mini-firmware-parity.mjs <compiled-mini-core-binary>');
const rows=execFileSync(binary,['--geometry'],{encoding:'utf8'}).trim().split('\n');
assert.equal(rows.length,9);
for(const raw of rows){
 const [id,hdr,foot,rowheight,rowsShown,font,compact]=raw.split(',');
 const p=id==='custom'?M.profile('custom',96,48):M.profile(id);
 const expected=M.geometry(p);
 assert.deepEqual([+hdr,+foot,+rowheight,+rowsShown,+font,+compact],
  [expected.header,expected.footer,expected.rowHeight,expected.rows,
   expected.fontSize,expected.compact?1:0],
  'ESP32 geometry must match web simulator for '+id);
}
console.log('Mini renderer layout parity: all 8 hardware presets + custom 96x48 match web geometry PASS');
