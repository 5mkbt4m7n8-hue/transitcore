// The 1282-LED virtual Trondheim catalog exceeds the free Worker subrequest
// allowance if it loads 48 separate route JSON files at request time.
// Bundle these immutable route profiles at Worker build time instead.
// Update this allowlist when the catalog changes; validate exact parity.
import bus1 from "../config/routes/atb-bus-1-live.json" with {type:"json"};
import bus2 from "../config/routes/atb-bus-2-live.json" with {type:"json"};
import bus3 from "../config/routes/atb-bus-3-live.json" with {type:"json"};
import bus10 from "../config/routes/atb-bus-10-live.json" with {type:"json"};
import bus11 from "../config/routes/atb-bus-11-live.json" with {type:"json"};
import bus12 from "../config/routes/atb-bus-12-live.json" with {type:"json"};
import bus13 from "../config/routes/atb-bus-13-live.json" with {type:"json"};
import bus14 from "../config/routes/atb-bus-14-live.json" with {type:"json"};
import bus15 from "../config/routes/atb-bus-15-live.json" with {type:"json"};
import bus16 from "../config/routes/atb-bus-16-live.json" with {type:"json"};
import bus18 from "../config/routes/atb-bus-18-live.json" with {type:"json"};
import bus20 from "../config/routes/atb-bus-20-live.json" with {type:"json"};
import bus21 from "../config/routes/atb-bus-21-live.json" with {type:"json"};
import bus22 from "../config/routes/atb-bus-22-live.json" with {type:"json"};
import bus23 from "../config/routes/atb-bus-23-live.json" with {type:"json"};
import bus25 from "../config/routes/atb-bus-25-live.json" with {type:"json"};
import bus28 from "../config/routes/atb-bus-28-live.json" with {type:"json"};
import bus40 from "../config/routes/atb-bus-40-live.json" with {type:"json"};
import bus41 from "../config/routes/atb-bus-41-live.json" with {type:"json"};
import bus42 from "../config/routes/atb-bus-42-live.json" with {type:"json"};
import bus43 from "../config/routes/atb-bus-43-live.json" with {type:"json"};
import bus44 from "../config/routes/atb-bus-44-live.json" with {type:"json"};
import bus45 from "../config/routes/atb-bus-45-live.json" with {type:"json"};
import bus46 from "../config/routes/atb-bus-46-live.json" with {type:"json"};
import bus50 from "../config/routes/atb-bus-50-live.json" with {type:"json"};
import bus51 from "../config/routes/atb-bus-51-live.json" with {type:"json"};
import bus52 from "../config/routes/atb-bus-52-live.json" with {type:"json"};
import bus53 from "../config/routes/atb-bus-53-live.json" with {type:"json"};
import bus54 from "../config/routes/atb-bus-54-live.json" with {type:"json"};
import bus70 from "../config/routes/atb-bus-70-live.json" with {type:"json"};
import bus71 from "../config/routes/atb-bus-71-live.json" with {type:"json"};
import bus72 from "../config/routes/atb-bus-72-live.json" with {type:"json"};
import bus73 from "../config/routes/atb-bus-73-live.json" with {type:"json"};
import bus74 from "../config/routes/atb-bus-74-live.json" with {type:"json"};
import bus75 from "../config/routes/atb-bus-75-live.json" with {type:"json"};
import bus76 from "../config/routes/atb-bus-76-live.json" with {type:"json"};
import bus77 from "../config/routes/atb-bus-77-live.json" with {type:"json"};
import bus78 from "../config/routes/atb-bus-78-live.json" with {type:"json"};
import bus79 from "../config/routes/atb-bus-79-live.json" with {type:"json"};
import bus80 from "../config/routes/atb-bus-80-live.json" with {type:"json"};
import bus81 from "../config/routes/atb-bus-81-live.json" with {type:"json"};
import bus82 from "../config/routes/atb-bus-82-live.json" with {type:"json"};
import bus83 from "../config/routes/atb-bus-83-live.json" with {type:"json"};
import bus85 from "../config/routes/atb-bus-85-live.json" with {type:"json"};
import bus86 from "../config/routes/atb-bus-86-live.json" with {type:"json"};
import bus91 from "../config/routes/atb-bus-91-live.json" with {type:"json"};
import bus92 from "../config/routes/atb-bus-92-live.json" with {type:"json"};
import flybuss from "../config/routes/flybuss-trondheim-fb73-live.json" with {type:"json"};

const all=[bus1,bus2,bus3,bus10,bus11,bus12,bus13,bus14,bus15,bus16,bus18,bus20,bus21,bus22,bus23,bus25,bus28,bus40,bus41,bus42,bus43,bus44,bus45,bus46,bus50,bus51,bus52,bus53,bus54,bus70,bus71,bus72,bus73,bus74,bus75,bus76,bus77,bus78,bus79,bus80,bus81,bus82,bus83,bus85,bus86,bus91,bus92,flybuss];
const byId=new Map(all.map(profile=>[profile.id,profile]));
if(byId.size!==48)throw Error('Duplicate Trondheim catalog route profile');

export function trondheimCatalogProfiles(board){
 if(board?.id!=='trondheim-city-lines-catalog')throw Error('Unexpected Trondheim catalog board');
 if(!Array.isArray(board.routes)||board.routes.length!==byId.size)throw Error('Trondheim catalog profile count mismatch');
 const profiles=board.routes.map(id=>byId.get(id));
 if(profiles.some(profile=>!profile))throw Error('Trondheim catalog route missing from Worker bundle');
 if(new Set(board.routes).size!==byId.size)throw Error('Duplicate Trondheim catalog route ID');
 return profiles;
}
