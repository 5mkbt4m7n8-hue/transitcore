// Leave time for the response to reach clients with a seven-second read timeout.
export const FRAME_BUDGET_MS = 5500;
export const UPSTREAM_TIMEOUT_MS = 3500;
export const MONITOR_TIMEOUT_MS = 500;

export async function boundedOperation(stage, operation, timeoutMs, context = {}) {
  const started = Date.now();
  const controller = new AbortController();
  let timer;
  const timeout = Object.assign(new Error(`${stage} timed out`), { code: 'FEED_TIMEOUT', stage });
  try {
    if (timeoutMs <= 0) throw timeout;
    return await Promise.race([
      Promise.resolve().then(() => operation(controller.signal)),
      new Promise((_, reject) => {
        timer = setTimeout(() => { reject(timeout); controller.abort(); }, timeoutMs);
      })
    ]);
  } catch (error) {
    console.error(JSON.stringify({ event: 'feed_step_failed', ...context, stage,
      elapsedMs: Date.now() - started, code: error.code || 'FEED_STEP_ERROR' }));
    throw error;
  } finally {
    clearTimeout(timer);
    const elapsedMs = Date.now() - started;
    if (elapsedMs >= 1000) console.warn(JSON.stringify({ event: 'feed_step_slow', ...context, stage, elapsedMs }));
  }
}

export function boundedFetchJson(url, options, timeoutMs = UPSTREAM_TIMEOUT_MS) {
  // Host only: never log query strings, credentials or response bodies.
  return boundedOperation('upstream_json', async signal => {
    const result = await fetch(url, { ...options, signal });
    if (!result.ok) throw Object.assign(new Error(`Upstream HTTP ${result.status}`), { code: `HTTP_${result.status}` });
    return result.json(); // The deadline includes reading the response body.
  }, timeoutMs, { host: new URL(url).hostname });
}
