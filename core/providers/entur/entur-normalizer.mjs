const text=value=>typeof value==='string'?value:null;
const number=(value,min,max)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max?value:null;

// Keep a raw reference for lossless transition. Neither consumers nor adapters
// may mutate observations; no raw object is added to the public PixelFrame.
export function normalizeEnturVehicle(raw) {
  let latitude=number(raw?.location?.latitude,-90,90);
  let longitude=number(raw?.location?.longitude,-180,180);
  if(latitude===null||longitude===null)latitude=longitude=null;
  const timestamp=text(raw?.lastUpdated);
  const value = {
    id:text(raw?.vehicleId),provider:'entur',mode:null,lineId:null,
    publicCode:text(raw?.line?.publicCode),destination:text(raw?.destinationName),
    latitude,longitude,heading:null,speed:null,
    timestamp:timestamp&&/(Z|[+-]\d\d:\d\d)$/.test(timestamp)&&Number.isFinite(Date.parse(timestamp))?timestamp:null,
    state:null,raw,observationType:'vehicle-position'
  };
  // Preserve pre-platform treatment of malformed observations at the provider
  // boundary. Valid observations need no compatibility view. Engines never
  // access raw; this can be retired only with an explicit data-quality policy.
  const legacy = {id: raw?.vehicleId, publicCode: raw?.line?.publicCode,
    destination: raw?.destinationName, timestamp: raw?.lastUpdated,
    latitude: raw?.location?.latitude, longitude: raw?.location?.longitude};
  if (Object.entries(legacy).some(([key, field]) => field !== value[key])) {
    value.frameCompatibility = legacy;
  }
  return value;
}

export function toLegacyEnturVehicles(vehicles) {
  return vehicles.map(vehicle=>{
    if(vehicle.provider!=='entur'||vehicle.observationType!=='vehicle-position'||!Object.hasOwn(vehicle,'raw'))
      throw new TypeError('Expected Entur vehicle-position observation with raw data');
    return vehicle.raw;
  });
}
