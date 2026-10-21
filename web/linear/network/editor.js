(function(root){
 'use strict';
 root.InTransitMapEditor=function(initial,onchange){
  let layout=structuredClone(initial),history=[];
  function commit(next){const errors=InTransitMapModel.validate(next);if(errors.length)throw Error(errors.join('\n'));history.push(structuredClone(layout));if(history.length>100)history.shift();layout=structuredClone(next);onchange(layout);}
  return {get:()=>structuredClone(layout),change(fn){const next=structuredClone(layout);fn(next);commit(next);},import:commit,
   undo(){if(history.length){layout=history.pop();onchange(layout);}},discard(){commit(initial);},
   export(){return JSON.stringify(layout,null,2)+'\n';}};
 };
})(globalThis);
