import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import worker from '../worker/led-feed-worker.mjs';
import { boundedFetchJson, boundedOperation } from '../worker/feed-timing.mjs';

const originalFetch = globalThis.fetch;
const originalError = console.error, originalWarn = console.warn;
const logs = [];
console.error = console.warn = message => logs.push(message);
try {
  let signal;
  globalThis.fetch = async (_url, options) => {
    signal = options.signal;
    return new Promise(() => {});
  };
  await assert.rejects(boundedFetchJson('https://provider.test/?secret=hidden', {}, 20), { code: 'FEED_TIMEOUT' });
  assert.equal(signal.aborted, true);
  globalThis.fetch = async () => ({ ok: true, json: () => new Promise(() => {}) });
  await assert.rejects(boundedFetchJson('https://provider.test/', {}, 20), { code: 'FEED_TIMEOUT' });
  assert.ok(logs.every(line => !line.includes('hidden')));
  assert.equal(await boundedOperation('fast', () => 42, 100), 42);

  const root = new URL('../', import.meta.url);
  let blockedMonitor = false;
  const monitors = [];
  const historyWrites = [];
  const externalCalls = [];
  globalThis.fetch = async (url, options) => {
    externalCalls.push(String(url));
    const path = String(url).split('/main/')[1];
    if (path?.startsWith('config/')) {
      try { return new Response(await fs.readFile(new URL(path, root))); }
      catch { return new Response('', { status: 404 }); }
    }
    if (options?.method === 'POST') return Response.json({ data: { vehicles: [] } });
    throw Error(`Unexpected self-fetch: ${url}`);
  };
  const env = { DEVICE_STATUS: {
    idFromName: id => id,
    get: id => ({ fetch: async (url, options) => {
      const body = JSON.parse(options.body);
      if (url.endsWith('/motion')) return Response.json(body.frame);
      if (url.endsWith('/trondheim-history')){
       historyWrites.push(body);
       return Response.json({recorded:true});
      }
      assert.ok(url.endsWith('/monitor'));
      if (blockedMonitor) return new Promise(() => {});
      monitors.push({ id, ...body });
      return Response.json({ ok: true });
    } })
  } };
  await worker.scheduled({ scheduledTime: Date.now() }, env);
  assert.equal(monitors.length, 9);
  assert.equal(monitors.filter(row => row.source === 'scheduled' && row.state === 'OK').length,8);
  assert.equal(monitors.filter(row => row.source === 'history' && row.state === 'OK' &&
    row.id === 'trondheim-city-lines-catalog').length,1);
  assert.equal(historyWrites.length,1,'Cron must save exactly one day-history sample');
  assert.equal(historyWrites[0].action,'record');
  assert.equal(historyWrites[0].frame.boardProfile,'trondheim-city-lines-catalog');
  assert.ok(externalCalls.every(url => !url.includes('workers.dev')));

  // Regression: this catalog mixes GPS vehicle routes and ETA route profiles.
  // It must produce one 1282-point frame rather than fail GPS-profile parity.
  const beforeCatalogCalls=externalCalls.length;
  const catalogResponse = await worker.fetch(
    new Request('https://worker.test/v1/boards/trondheim-city-lines-catalog/frame'), env);
  assert.equal(catalogResponse.status,200,'Full mixed GPS/ETA catalog must render');
  const catalogFrame=await catalogResponse.json();
  assert.equal(catalogFrame.boardProfile,'trondheim-city-lines-catalog');
  assert.equal(catalogFrame.ledCount,1282);
  const catalogRequests=externalCalls.slice(beforeCatalogCalls);
  assert.equal(catalogRequests.filter(url=>url.includes('/config/routes/')).length,0,
   'Virtual catalog must not fetch each of its 48 routes at runtime');
  assert(catalogRequests.filter(url=>url.includes('raw.githubusercontent.com')).length<=1,
   'Cold catalog frame must fetch at most its board JSON (bundled profiles)');

  blockedMonitor = true;
  const started = Date.now();
  const reply = await worker.fetch(new Request('https://worker.test/v1/boards/grakallbanen-prototype-board/frame'), env);
  assert.equal(reply.status, 200, 'monitor storage failure must preserve the successful frame');
  assert.ok(Date.now() - started < 2000);
  assert.equal((await reply.json()).boardProfile, 'grakallbanen-prototype-board');

  globalThis.fetch = async () => new Promise(() => {});
  blockedMonitor = false;
  const failedAt = Date.now();
  const failure = await worker.fetch(new Request('https://worker.test/v1/boards/uncached-test-board/frame'), env);
  assert.equal(failure.status, 503);
  assert.ok(Date.now() - failedAt < 6500, 'return before ESP read timeout');
  assert.equal((await failure.json()).stage, 'configuration');
  assert.equal(monitors.at(-1).state, 'FEED_ERROR');
} finally {
  globalThis.fetch = originalFetch;
  console.error = originalError;
  console.warn = originalWarn;
}
console.log('Feed deadlines, body timeouts, scheduled checks and monitor failure isolation OK');
