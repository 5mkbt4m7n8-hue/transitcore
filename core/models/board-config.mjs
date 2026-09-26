import {isObject,isId,positiveInteger,byte,hexColor,issue,result} from './common.mjs';

/** @typedef {Object} BoardConfig
 * @property {number} modelVersion Internal model version, separate from legacy schemaVersion.
 * @property {string} id
 * @property {string} name
 * @property {string} productType Existing layout unless explicitly supplied.
 * @property {string|Object|Array|null} provider Null if not resolved; never inferred from board ID.
 * @property {string|null} hardwareProfile
 * @property {number} ledCount Frame LED count, NOT total connected strip length.
 * @property {number} ttlSeconds Base TTL; runtime hold policy is still separate.
 * @property {number} refreshIntervalSeconds
 * @property {Array} nodes Existing stop/platform/virtual mapping, preserved verbatim.
 * @property {Object} hardware Logical-to-physical mapping.
 */
export function normalizeBoardConfig(rawConfig, {hardware, routeProfiles} = {}) {
  if(!isObject(rawConfig)) throw new TypeError('BoardConfig must be an object');
  const b=structuredClone(rawConfig);
  const resolved=hardware===undefined?b.hardware:structuredClone(hardware);
  const count=b.ledCount??b.leds?.count;
  return {...b, modelVersion:1, productType:b.productType??b.layout,
    provider:b.provider??null, hardwareProfile:b.hardwareProfile??resolved?.id??null,
    ledCount:count, ttlSeconds:b.ttlSeconds??30, refreshIntervalSeconds:b.refreshIntervalSeconds??10,
    brightnessDefault:b.brightnessDefault??b.leds?.brightnessLimit??32,
    featureFlags:b.featureFlags??{},
    routeProfiles:routeProfiles===undefined?(b.routeProfiles??[]):structuredClone(routeProfiles),
    hardware:resolved??{schemaVersion:1,boardProfile:b.id,leds:{count,brightnessLimit:b.leds?.brightnessLimit??32},
      assignments:Array.isArray(b.nodes)?b.nodes.map(n=>({logicalLed:n?.led,physicalLed:n?.led})):[]}
  };
}

export function validateBoardConfig(c, {allowIncompleteExample=false} = {}) {
  const errors=[],warnings=[];
  const check=(ok,path,msg)=>{if(!ok)issue(errors,path,msg);};
  if(!isObject(c)) return result([{path:'config',message:'Expected normalized object'}]);
  check(c.modelVersion===1,'modelVersion','Normalize BoardConfig first');
  check(isId(c.id),'id','Invalid board/profile identity');
  check(typeof c.name==='string'&&!!c.name.trim(),'name','Required nonempty name');
  check([1,2].includes(c.schemaVersion),'schemaVersion','Supported legacy schema versions are 1 and 2');
  check(typeof c.productType==='string'&&!!c.productType,'productType','Required layout/product type');
  check(positiveInteger(c.ledCount),'ledCount','Expected positive integer');
  if(c.leds) check(c.leds.count===c.ledCount,'leds.count','Conflicts with canonical ledCount');
  for(const key of ['ttlSeconds','refreshIntervalSeconds']) check(typeof c[key]==='number'&&Number.isFinite(c[key])&&c[key]>0,key,'Expected positive finite number');
  check(byte(c.brightnessDefault),'brightnessDefault','Expected integer 0..255');
  check(isObject(c.featureFlags),'featureFlags','Expected object');
  if(c.hardwareProfile!=null) check(isId(c.hardwareProfile),'hardwareProfile','Invalid reference');
  const provider=(p,path)=>{
    if(typeof p==='string') check(isId(p),path,'Invalid provider reference');
    else if(isObject(p)) {
      check(typeof p.codespaceId==='string'&&/^[A-Za-z0-9_-]+$/.test(p.codespaceId),path+'.codespaceId','Invalid codespace');
      try { const u=new URL(p.vehicleEndpoint); check(u.protocol==='https:'&&!u.username&&!u.password,path+'.vehicleEndpoint','Expected HTTPS URL without credentials'); } catch {issue(errors,path+'.vehicleEndpoint','Invalid URL');}
    } else issue(errors,path,'Expected provider reference or descriptor');
  };
  if(c.provider!=null) (Array.isArray(c.provider)?c.provider:[c.provider]).forEach((p,i)=>provider(p,`provider[${i}]`));
  const routes=Array.isArray(c.routes)?c.routes:[];
  check(Array.isArray(c.routes)&&routes.length>0&&routes.every(isId)&&new Set(routes).size===routes.length,'routes','Expected unique route references');
  const nodes=Array.isArray(c.nodes)?c.nodes:[];
  check(Array.isArray(c.nodes),'nodes','Expected array');
  if(nodes.length!==c.ledCount) {
    const target=allowIncompleteExample&&c.status==='example-only'?warnings:errors;
    issue(target,'nodes','Node count differs from ledCount; incomplete example is not deployable');
  }
  const ids=new Set(),nodeNames=new Set();
  nodes.forEach((n,i)=>{
    const path=`nodes[${i}]`;
    if(!isObject(n)){issue(errors,path,'Expected object');return;}
    check(Number.isInteger(n.led)&&n.led>=0&&n.led<c.ledCount,path+'.led','LED out of range');
    check(!ids.has(n.led),path+'.led','Duplicate logical LED');ids.add(n.led);
    check(typeof n.id==='string'&&!!n.id&&!nodeNames.has(n.id),path+'.id','Missing or duplicate node identity');nodeNames.add(n.id);
    if(n.routes===undefined&&allowIncompleteExample&&c.status==='example-only') issue(warnings,path+'.routes','Example lacks node route mapping; not deployable');
    else check(Array.isArray(n.routes)&&n.routes.every(r=>routes.includes(r)),path+'.routes','Unknown route reference');
    if(n.routeDirections!=null){
      check(isObject(n.routeDirections),path+'.routeDirections','Expected object');
      for(const [r,d] of Object.entries(n.routeDirections||{})) check(routes.includes(r)&&isObject(d)&&Array.isArray(d.directionIds)&&d.directionIds.every(v=>typeof v==='string'),path+'.routeDirections.'+r,'Invalid direction mapping');
    }
  });
  const h=c.hardware;
  if(!isObject(h)) issue(errors,'hardware','Expected hardware profile');
  else {
    check(h.schemaVersion===1&&h.boardProfile===c.id,'hardware.boardProfile','Board/hardware identity mismatch');
    check(h.leds?.count===c.ledCount,'hardware.leds.count','Must equal frame LED count, not connected strip length');
    if(h.leds?.brightnessLimit!=null)check(byte(h.leds.brightnessLimit),'hardware.leds.brightnessLimit','Expected integer 0..255');
    const assignments=Array.isArray(h.assignments)?h.assignments:[];
    check(Array.isArray(h.assignments)&&assignments.length===nodes.length,'hardware.assignments','One assignment per logical node required');
    const logical=new Set(),physical=new Set();
    assignments.forEach((a,i)=>{
      if(!isObject(a)){issue(errors,`hardware.assignments[${i}]`,'Expected object');return;}
      check(ids.has(a.logicalLed)&&!logical.has(a.logicalLed),`hardware.assignments[${i}].logicalLed`,'Unknown or duplicate logical LED');logical.add(a.logicalLed);
      check(Number.isInteger(a.physicalLed)&&a.physicalLed>=0&&a.physicalLed<c.ledCount&&!physical.has(a.physicalLed),`hardware.assignments[${i}].physicalLed`,'Out of range or duplicate physical LED');physical.add(a.physicalLed);
    });
  }
  if(c.render?.lineColors!=null)check(isObject(c.render.lineColors),'render.lineColors','Expected object');
  for(const [key,value] of Object.entries(c.render?.lineColors??{})) check(hexColor(value),'render.lineColors.'+key,'Expected #RRGGBB');
  check(Array.isArray(c.routeProfiles),'routeProfiles','Expected array');
  if(Array.isArray(c.routeProfiles)&&c.routeProfiles.length)check(c.routeProfiles.length===routes.length&&new Set(c.routeProfiles.map(p=>p?.id)).size===routes.length,'routeProfiles','Resolved profiles must cover every route exactly once');
  if(Array.isArray(c.routeProfiles)) c.routeProfiles.forEach((p,i)=>{
    const path=`routeProfiles[${i}]`;
    if(!isObject(p)){issue(errors,path,'Expected object');return;}
    check(routes.includes(p.id),path+'.id','Unknown route profile');
    provider(p.provider,path+'.provider');
    if(p.line?.color!=null)check(hexColor(p.line.color),path+'.line.color','Expected #RRGGBB');
    check(Array.isArray(p.directions),path+'.directions','Expected array');
    if(Array.isArray(p.directions))p.directions.forEach((d,j)=>check(isObject(d)&&typeof d.id==='string'&&(d.color==null||hexColor(d.color)),`${path}.directions[${j}]`,'Invalid direction/color'));
  });
  return result(errors,warnings);
}
