// One read-only Transit Data MCP catalog request, no introspection. The MCP
// tool catalog advertises supported selections/filters. No vehicle data read.
const response=await fetch('https://api.entur.io/transit-data/v1beta/mcp',{
 method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json, text/event-stream',
 'ET-Client-Name':'transitcore-route-sequence-audit'},
 body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'}),signal:AbortSignal.timeout(18000)
});
if(!response.ok)throw Error('Transit Data MCP HTTP '+response.status+'; no retry');
const json=await response.json();
if(json.error)throw Error('Transit Data MCP error '+json.error.code);
const names=['line','journeyPattern','serviceJourney','datedServiceJourney','journeyPatterns','serviceJourneys','datedServiceJourneys'];
const tools=(json.result?.tools||[]).filter(x=>names.includes(x.name));
const fields=tools.map(x=>({name:x.name,description:x.description,inputSchema:x.inputSchema}));
console.log('ENTUR_TRANSIT_DATA_TOOLS '+JSON.stringify(fields));
if(tools.length<5)throw Error('Expected transit reference tools missing');
