import {permit} from './security.js';

// A fetch and a Cache API operation consume the same Free-plan allowance.
// Four slots are reserved for cache reads/writes; redirects are never followed.
export const SUBREQUEST_LIMIT = 48;
export const FETCH_LIMIT = 44;
export const CONCURRENCY = 3;
export const UPSTREAM_TIMEOUT_MS = 6000;
export const WORK_TIMEOUT_MS = 24000;
export function retryDelay(value, now = Date.now()) {
  if (/^\d+(\.\d+)?$/.test(value || '')) return Math.max(1000, Number(value) * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(1000, date - now) : 30000;
}

export function createNetwork() {
  let active = 0;
  const waiting = [], cooldowns = new Map();
  function drain() {
    while (active < CONCURRENCY && waiting.length) {
      const job = waiting.shift(); if(job.expired)continue; clearTimeout(job.timer); active++;
      Promise.resolve().then(job.run).then(job.resolve, job.reject).finally(() => { active--; drain(); });
    }
  }
  const schedule = (run, work) => new Promise((resolve, reject) => {
    if(waiting.length>=128){work?.fail('work_rate_limited',5000);resolve(null);return;}
    const job={run,resolve,reject,expired:false};
    if(work)job.timer=setTimeout(()=>{job.expired=true;work.fail('deadline_exceeded');const index=waiting.indexOf(job);if(index>=0)waiting.splice(index,1);resolve(null);},work.timeLeft());
    waiting.push(job);drain();
  });
  const delay = host => Math.max(0, (cooldowns.get(host) || 0) - Date.now());
  return {
    schedule, delay,
    async json(url, work, timeoutMs = UPSTREAM_TIMEOUT_MS) {
      const host = new URL(url).hostname;
      return schedule(async () => {
        const pause = delay(host);
        if (pause) { work.fail('upstream_rate_limited', pause); return null; }
        if (!work.available()) return null;
        if (!await permit(work.env, 'WORK_LIMIT', 'upstream:'+host)) { work.fail('work_rate_limited', 60000); return null; }
        if (!work.charge(true)) return null;
        const controller = new AbortController(); let timer;
        const timeout = new Promise(resolve => { timer = setTimeout(() => { controller.abort(); work.fail('upstream_timeout'); resolve(null); }, Math.min(timeoutMs, work.timeLeft())); });
        try {
          return await Promise.race([timeout, (async () => {
            const response = await fetch(url, {headers: {'User-Agent': 'WikiScroll/4.0 (https://wikiscroll.com; contact@wikiscroll.com)'}, signal: controller.signal, redirect: 'manual'});
            if (response.status === 429 || response.status === 503 && response.headers.has('Retry-After')) {
              const ms = retryDelay(response.headers.get('Retry-After'));
              cooldowns.set(host, Date.now() + ms); work.fail('upstream_rate_limited', ms);
              await response.body?.cancel().catch(() => {}); return null;
            }
            if (!response.ok) { work.fail('upstream_unavailable'); await response.body?.cancel().catch(() => {}); return null; }
            const data = await response.json();
            if (data?.error) {
              const ms = data.error.code === 'maxlag' ? 5000 : 30000;
              if (data.error.code === 'maxlag' || data.error.code === 'ratelimited') cooldowns.set(host, Date.now() + ms);
              work.fail('upstream_unavailable', ms); return null;
            }
            return data;
          })()]);
        } catch { work.fail('upstream_unavailable'); return null; }
        finally { clearTimeout(timer); }
      }, work);
    }
  };
}
const defaultNetwork = createNetwork();
const priority = {upstream_unavailable: 1, upstream_timeout: 2, deadline_exceeded: 3, budget_exhausted: 4, work_rate_limited: 5, upstream_rate_limited: 6};
export function createWork(env = {}, ctx = {}, network = defaultNetwork) {
  const started = Date.now(); let used = 0, fetched = 0, reason = '', retryUntil = 0;
  const work = {
    env, ctx, network,
    get used() { return used; }, get remaining() { return SUBREQUEST_LIMIT - used; },
    get reason() { return reason; },
    timeLeft: () => Math.max(0, WORK_TIMEOUT_MS - (Date.now() - started)),
    fail(code, ms = 5000) { if ((priority[code] || 0) >= (priority[reason] || 0)) reason = code; retryUntil = Math.max(retryUntil, Date.now() + ms); },
    retrySeconds: (minimum = 5) => Math.max(minimum, Math.ceil((retryUntil - Date.now()) / 1000)),
    available() { if (work.timeLeft() > 0) return true; work.fail('deadline_exceeded'); return false; },
    charge(isFetch = false) {
      if (used >= SUBREQUEST_LIMIT || isFetch && fetched >= FETCH_LIMIT) { work.fail('budget_exhausted'); return false; }
      used++; if (isFetch) fetched++; return true;
    },
    upstream: (url, options) => network.json(url, work, options?.timeoutMs),
    // Pipeline fixtures and callers supplying their own query function still
    // get a complete invocation budget and the same concurrency bound.
    request(query, url) {
      return network.schedule(async () => {
        if (!work.available() || !work.charge(true)) return null;
        try { const data = await query(url); if (!data || data.error) work.fail('upstream_unavailable'); return data?.error ? null : data; }
        catch { work.fail('upstream_unavailable'); return null; }
      }, work);
    },
    keep(promise) { ctx.waitUntil?.(promise.catch(() => {})); return promise; }
  };
  const cache = globalThis.caches?.default;
  work.cache = cache ? {
    async match(key) { if (!work.charge()) return undefined; try { return await cache.match(key); } catch { return undefined; } },
    async put(key, value) { if (!work.charge()) return; try { await cache.put(key, value); } catch {} }
  } : undefined;
  return work;
}
export function unavailable(work, message = 'Wikimedia is temporarily unavailable.') {
  return Response.json({articles: [], error: message, code: work?.reason || 'upstream_unavailable'}, {status: work?.reason === 'work_rate_limited' ? 429 : 503, headers: {'Cache-Control': 'no-store', 'Retry-After': String(work?.retrySeconds() || 5)}});
}
