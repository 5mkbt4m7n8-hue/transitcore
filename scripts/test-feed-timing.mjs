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
      assert.ok(url.endsWith('/monitor'));
      if (blockedMonitor) return new Promise(() => {});
      monitors.push({ id, ...body });
      return Response.json({ ok: true });
    } })
  } };
  await worker.scheduled({ scheduledTime: Date.now() }, env);
  assert.equal(monitors.length, 8);
  assert.ok(monitors.every(row => row.source === 'scheduled' && row.state === 'OK'), JSON.stringify(monitors));
  assert.ok(externalCalls.every(url => !url.includes('workers.dev')));

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
