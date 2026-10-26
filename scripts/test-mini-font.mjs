import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url),F=require('../web/mini/pixel-font.js');
execFileSync(process.execPath,['scripts/generate-mini-font.mjs','--check'],{stdio:'inherit'});
for(const [c,rows] of Object.entries(F.glyphs)){
 assert.equal(rows.length,5);assert(rows.every(r=>Number.isInteger(r)&&r>=0&&r<8),c);
}
assert.equal(F.normalize('æøå'),'ÆØÅ');
assert.equal(F.width('123'),11);
assert.equal(F.fit('Prinsens gate',47),'PRINSENS GT.');
assert.equal(F.fit('Ranheim via Strindheim',27),'RANHEIM');
for(const text of ['ÆØÅ','Dragvoll via Strindheim','Prinsens gate','123','99m','🙂']){
 for(const s of [1,2,3])for(let w=0;w<65;w++)assert(F.width(F.fit(text,w,s),s)<=w);
}
const temp=mkdtempSync(join(tmpdir(),'mini-font-'));
try{
 const input=Object.keys(F.glyphs).join('')+'æøåabc🙂';
 const cpp='#include <iostream>\n#include "mini_font.hpp"\nint main(){\n'+
  [1,2,3].map(s=>'mini::font::draw(u8"'+input+'",2,3,'+s+
   ',[](int x,int y,int w,int h){std::cout<<x<<","<<y<<","<<w<<","<<h<<"\\n";});').join('\n')+
  '\n}';
 const source=join(temp,'font.cpp'),binary=join(temp,'font-test');
 writeFileSync(source,cpp);
 execFileSync('g++',['-std=c++11','-Wall','-Wextra','-Werror',
  '-I',fileURLToPath(new URL('../firmware/mini/include',import.meta.url)),source,'-o',binary]);
 const actual=execFileSync(binary,{encoding:'utf8'}).trim();
 const expected=[];
 for(const s of [1,2,3])F.draw({fillRect:(...r)=>expected.push(r.join(','))},input,2,3,s);
 assert.equal(actual,expected.join('\n'),'Every rendered glyph pixel must match compiled ESP32 font');
}finally{rmSync(temp,{recursive:true,force:true});}
console.log('Mini bitmap font: bounds, Norwegian glyphs, generated header and compiled C++ pixel parity PASS');
