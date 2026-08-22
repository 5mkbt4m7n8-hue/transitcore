export const MTA_LINE7_FEED = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs";

export const MTA_LINE7_STATIONS = [
  ["701","Flushing-Main St",40.759600,-73.830030], ["702","Mets-Willets Point",40.754622,-73.845625],
  ["705","111 St",40.751730,-73.855334], ["706","103 St-Corona Plaza",40.749865,-73.862700],
  ["707","Junction Blvd",40.749145,-73.869527], ["708","90 St-Elmhurst Av",40.748408,-73.876613],
  ["709","82 St-Jackson Hts",40.747659,-73.883697], ["710","74 St-Broadway",40.746848,-73.891394],
  ["711","69 St",40.746325,-73.896403], ["712","61 St-Woodside",40.745630,-73.902984],
  ["713","52 St",40.744149,-73.912549], ["714","46 St-Bliss St",40.743132,-73.918435],
  ["715","40 St-Lowery St",40.743781,-73.924016], ["716","33 St-Rawson St",40.744587,-73.930997],
  ["718","Queensboro Plaza",40.750582,-73.940202], ["719","Court Sq",40.747023,-73.945264],
  ["720","Hunters Point Av",40.742216,-73.948916], ["721","Vernon Blvd-Jackson Av",40.742626,-73.953581],
  ["723","Grand Central-42 St",40.751431,-73.976041], ["724","5 Av",40.753821,-73.981963],
  ["725","Times Sq-42 St",40.755477,-73.987691], ["726","34 St-Hudson Yards",40.755882,-74.001910]
].map(([id,name,lat,lon],index)=>({id,name,lat,lon,index}));

function fields(bytes) {
  let offset = 0;
  const result = [];
  const readVarint = () => {
    let value = 0, shift = 0;
    while (offset < bytes.length) {
      const byte = bytes[offset++];
      value += (byte & 127) * 2 ** shift;
      if (!(byte & 128)) return value;
      shift += 7;
      if (shift > 56) throw Error("protobuf varint too large");
    }
    throw Error("truncated protobuf varint");
  };
  while (offset < bytes.length) {
    const tag = readVarint(), number = Math.floor(tag / 8), wire = tag & 7;
    if (wire === 0) result.push([number, wire, readVarint()]);
    else if (wire === 2) {
      const length = readVarint(), end = offset + length;
      if (end > bytes.length) throw Error("truncated protobuf field");
      result.push([number, wire, bytes.subarray(offset, end)]); offset = end;
    } else if (wire === 1) offset += 8;
    else if (wire === 5) offset += 4;
    else throw Error(`unsupported protobuf wire type ${wire}`);
    if (offset > bytes.length) throw Error("truncated protobuf value");
  }
  return result;
}

const nested = (bytes, number) => fields(bytes).filter(field => field[0] === number && field[1] === 2).map(field => field[2]);
const text = (bytes, number) => {
  const value = fields(bytes).find(field => field[0] === number && field[1] === 2)?.[2];
  return value ? new TextDecoder().decode(value) : "";
};
const integer = (bytes, number) => fields(bytes).find(field => field[0] === number && field[1] === 0)?.[2] ?? null;

export function decodeMtaLine7(bytes, now = Date.now()) {
  const arrivals = [];
  for (const entity of nested(bytes, 2)) {
    const update = nested(entity, 3)[0];
    if (!update) continue;
    const trip = nested(update, 1)[0];
    if (!trip || !["7","7X"].includes(text(trip, 5))) continue;
    const tripId = text(trip, 1);
    for (const stopUpdate of nested(update, 2)) {
      const stopId = text(stopUpdate, 4);
      if (!/^7\d\d[NS]$/.test(stopId)) continue;
      const event = nested(stopUpdate, 2)[0] || nested(stopUpdate, 3)[0];
      const epoch = event ? integer(event, 2) : null;
      if (!epoch) continue;
      const etaSeconds = Math.round(epoch - now / 1000);
      if (etaSeconds < -45 || etaSeconds > 20 * 60) continue;
      arrivals.push({tripId,routeId:text(trip,5),stopId,stationId:stopId.slice(0,3),direction:stopId.at(-1),etaSeconds,arrivalTime:new Date(epoch*1000).toISOString()});
    }
  }
  return arrivals.sort((a,b)=>a.etaSeconds-b.etaSeconds);
}

export async function mtaLine7Response(_env, now = Date.now()) {
  const response = await fetch(MTA_LINE7_FEED, { headers: { "user-agent":"TransitCore/1.0" } });
  if (!response.ok) return { status: 502, body: { error:"mta_feed_unavailable", upstreamStatus:response.status } };
  const arrivals = decodeMtaLine7(new Uint8Array(await response.arrayBuffer()), now);
  const nearest = new Map();
  for (const arrival of arrivals) {
    const key = arrival.stopId;
    if (!nearest.has(key)) nearest.set(key, arrival);
  }
  return { status:200, body:{schemaVersion:1,route:"7",generatedAt:new Date(now).toISOString(),source:"MTA GTFS-Realtime",stations:MTA_LINE7_STATIONS,arrivals:[...nearest.values()]} };
}
