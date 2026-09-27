const text=value=>typeof value==='string'?value:null;
const number=(value,min,max)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max?value:null;

// Keep a raw reference for lossless transition. Neither consumers nor adapters
// may mutate observations; no raw object is added to the public PixelFrame.
export function normalizeEnturVehicle(raw) {
  let latitude=number(raw?.location?.latitude,-90,90);
  let longitude=number(raw?.location?.longitude,-180,180);
  if(latitude===null||longitude===null)latitude=longitude=null;
  const timestamp=text(raw?.lastUpdated);
  return {
    id:text(raw?.vehicleId),provider:'entur',mode:null,lineId:null,
    publicCode:text(raw?.line?.publicCode),destination:text(raw?.destinationName),
    latitude,longitude,heading:null,speed:null,
    timestamp:timestamp&&/(Z|[+-]\d\d:\d\d)$/.test(timestamp)&&Number.isFinite(Date.parse(timestamp))?timestamp:null,
    state:null,raw,observationType:'vehicle-position'
  };
}

export function toLegacyEnturVehicles(vehicles) {
  return vehicles.map(vehicle=>{
    if(vehicle.provider!=='entur'||vehicle.observationType!=='vehicle-position'||!Object.hasOwn(vehicle,'raw'))
      throw new TypeError('Expected Entur vehicle-position observation with raw data');
    return vehicle.raw;
  });
}
