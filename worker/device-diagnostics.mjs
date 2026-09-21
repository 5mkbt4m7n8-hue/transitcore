// Diagnostics stay separate from public device health history.
export const SESSION_MS = 15 * 60 * 1000;
export function cleanLog(value, now = Date.now()) {
  if (!/^[0-9a-f]{2,16}$/.test(value?.bootId || '') || !Array.isArray(value.lines) || value.lines.length > 24)
    throw Error('invalid log batch');
  if (!Number.isInteger(value.uptimeSeconds) || value.uptimeSeconds < 0 || value.uptimeSeconds > 0xffffffff)
    throw Error('invalid uptime');
  let previous = 0;
  const lines = value.lines.map(row => {
    if (!Number.isInteger(row.seq) || row.seq <= previous || row.seq > 0xffffffff ||
        typeof row.text !== 'string' || row.text.length > 191 || /[\u0000-\u001f\u007f]/.test(row.text))
      throw Error('invalid log line');
    previous = row.seq;
    const uptimeSeconds = row.uptimeSeconds ?? value.uptimeSeconds;
    if (!Number.isInteger(uptimeSeconds) || uptimeSeconds<0 || uptimeSeconds>0xffffffff) throw Error('invalid line time');
    return { bootId:value.bootId, seq:row.seq, text:row.text, uptimeSeconds, receivedAt:new Date(now).toISOString() };
  });
  return lines;
}
export async function diagnosticsRequest(storage, request, now = Date.now()) {
  const path = new URL(request.url).pathname;
  let until = Number(await storage.get('logUntil') || 0);
  const reply = (body, status=200) => new Response(JSON.stringify(body), {status, headers:{'content-type':'application/json','cache-control':'no-store'}});
  if (path === '/logs/session' && request.method === 'POST') {
    let command;
    try { command = await request.json(); } catch { return reply({error:'invalid_session'},400); }
    if (typeof command.active !== 'boolean') return reply({error:'invalid_session'},400);
    until = command.active ? now+SESSION_MS : 0;
    await storage.put('logUntil',until);
    return reply({logSeconds:Math.max(0,Math.ceil((until-now)/1000))});
  }
  if (path === '/logs' && request.method === 'POST') {
    if (until <= now) return reply({logSeconds:0},403);
    let incoming;
    try { incoming=cleanLog(await request.json(),now); } catch { return reply({error:'invalid_log'},400); }
    const stored = await storage.get('diagnosticLog') || [];
    const keys = new Set(stored.map(row=>`${row.bootId}:${row.seq}`));
    for (const row of incoming) if (!keys.has(`${row.bootId}:${row.seq}`)) stored.push(row);
    await storage.put('diagnosticLog',stored.slice(-300));
    return reply({logSeconds:Math.max(0,Math.ceil((until-now)/1000))});
  }
  if (path === '/logs' && request.method === 'GET') {
    return reply({logSeconds:Math.max(0,Math.ceil((until-now)/1000)),lines:await storage.get('diagnosticLog') || []});
  }
  return reply({error:'method_not_allowed'},405);
}

// A compiled prototype binary contains device identity and GPIO configuration.
// Never serve a board-wide/wildcard binary to these clients.
export function selectOtaRelease(releases, deviceId, boardProfile, headers) {
  const release = releases?.devices?.[deviceId];
  if (!release) return null;
  if (release.deviceId !== deviceId || release.boardProfile !== boardProfile ||
      !/^\d+\.\d+\.\d+$/.test(release.version || '') ||
      !['esp32','esp32s3'].includes(release.chip) ||
      !/^[0-9a-f]{32}$/i.test(release.md5 || '') ||
      !Number.isInteger(release.size) || release.size < 1 || release.size > 16*1024*1024)
    throw Error('invalid device release');
  const url = new URL(release.url);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw Error('invalid binary URL');
  for (const key of ['gpio','ledCount','physicalLedCount'])
    if (!Number.isInteger(release[key]) || release[key] < (key==='gpio'?0:1)) throw Error('invalid hardware');
  if (release.physicalLedCount < release.ledCount) throw Error('invalid strip size');
  const expected = {'x-transitcore-chip':release.chip,'x-transitcore-gpio':release.gpio,
    'x-transitcore-leds':release.ledCount,'x-transitcore-physical-leds':release.physicalLedCount};
  if (Object.entries(expected).some(([key,value])=>headers.get(key)!==String(value))) return null;
  const version = headers.get('x-transitcore-firmware') || '';
  if (!/^\d+\.\d+\.\d+$/.test(version)) return null;
  const current=version.split('.').map(Number), next=release.version.split('.').map(Number);
  const changed=next.findIndex((part,index)=>part!==current[index]);
  if (changed<0 || next[changed]<current[changed]) return null;
  return {version:release.version,deviceId,boardProfile,chip:release.chip,gpio:release.gpio,
    ledCount:release.ledCount,physicalLedCount:release.physicalLedCount,size:release.size,md5:release.md5,url:url.href};
}
