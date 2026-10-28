import {permit} from './security.js';

// A fetch and a Cache API operation consume the same Free-plan allowance.
// Four slots are reserved for cache reads/writes; redirects are never followed.
export const SUBREQUEST_LIMIT = 48;
export const FETCH_LIMIT = 44;
export const CONCURRENCY = 3;
export const UPSTREAM_TIMEOUT_MS = 6000;
export const WORK_TIMEOUT_MS = 24000;
// A Wikimedia edition that keeps failing without a Retry-After (a 5xx outage)
// is paused like a rate-limited one, so a burst of readers cannot keep
// hammering it: three failures in a row pause the host for 5 s, doubling to 60 s.
export const BREAKER_STRIKES = 3;
export const BREAKER_MS = 5000, BREAKER_MAX_MS = 60000;
export function retryDelay(value, now = Date.now()) {
  if (/^\d+(\.\d+)?$/.test(value || '')) return Math.max(1000, Number(value) * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(1000, date - now) : 30000;
}

// Cancelled Worker contexts may leave promises unsettled. Only live jobs
// coalesce requests; late cleanup must also check ownership of the map entry.
export function expireJobs(jobs, now = Date.now()) {
  for (const [key, job] of jobs) if (job.deadline <= now) {
    if ('finished' in job) job.finished = true;
    jobs.delete(key);
  }
}

export function createNetwork(cooldowns = new Map(), strikes = new Map()) {
  const active = new Set();
  const waiting = [];
  // A Worker can cancel background work after a response. Its promise/finally
  // may never settle, so the queue must not retain an expired active lease.
  function expire(job) {
    job.expired=true;clearTimeout(job.timer);active.delete(job);
    job.work?.fail('deadline_exceeded');try{job.cancel?.();}catch{}job.resolve(null);
  }
  function drain() {
    const now=Date.now();
    for(const job of active)if(job.deadline<=now)expire(job);
    for(let i=waiting.length-1;i>=0;i--)if(waiting[i].deadline<=now){const [job]=waiting.splice(i,1);expire(job);}
    while (active.size < CONCURRENCY && waiting.length) {
      // Optional enrichment (maintenance tags) never runs ahead of the text
      // and images a card needs; it takes a slot only when nothing else waits.
      const next = waiting.findIndex(job => !job.optional);
      const [job] = waiting.splice(next < 0 ? 0 : next, 1); if(job.expired)continue; clearTimeout(job.timer);active.add(job);
      Promise.resolve().then(job.run).then(job.resolve, job.reject).finally(() => {active.delete(job);drain();});
    }
  }
  const schedule = (run, work, cancel, optional = false) => new Promise((resolve, reject) => {
    drain();
    if(waiting.length>=128){work?.fail('work_rate_limited',5000);resolve(null);return;}
    const job={run,resolve,reject,work,cancel,optional,expired:false,deadline:Date.now()+(work?.timeLeft()??WORK_TIMEOUT_MS)};
    if(work)job.timer=setTimeout(()=>{job.expired=true;work.fail('deadline_exceeded');const index=waiting.indexOf(job);if(index>=0)waiting.splice(index,1);resolve(null);},work.timeLeft());
    waiting.push(job);drain();
  });
  const delay = host => Math.max(0, (cooldowns.get(host) || 0) - Date.now());
  const recovered = host => strikes.delete(host);
  // Returns the pause in ms once the host has failed BREAKER_STRIKES times in a row.
  function strike(host) {
    const count = (strikes.get(host) || 0) + 1;
    strikes.delete(host); strikes.set(host, count);
    if (strikes.size > 256) strikes.delete(strikes.keys().next().value);
    if (count < BREAKER_STRIKES) return 0;
    const ms = Math.min(BREAKER_MAX_MS, BREAKER_MS * 2 ** (count - BREAKER_STRIKES));
    cooldowns.set(host, Math.max(cooldowns.get(host) || 0, Date.now() + ms));
    return ms;
  }
  return {
    schedule, delay,
    async json(url, work, timeoutMs = UPSTREAM_TIMEOUT_MS, optional = false) {
      const host = new URL(url).hostname;
      const controller = new AbortController();
      return schedule(async () => {
        const pause = delay(host);
        if (pause) { work.fail('upstream_rate_limited', pause); return null; }
        if (!work.available()) return null;
        if (!await permit(work.env, 'WORK_LIMIT', 'upstream:'+host)) { work.fail('work_rate_limited', 60000); return null; }
        if (!work.charge(true)) return null;
        let timer;
        const timeout = new Promise(resolve => { timer = setTimeout(() => { controller.abort(); work.fail('upstream_timeout'); resolve(null); }, Math.min(timeoutMs, work.timeLeft())); });
        try {
          return await Promise.race([timeout, (async () => {
            const response = await fetch(url, {headers: {'User-Agent': 'WikiScroll/4.0 (https://wikiscroll.com; contact@wikiscroll.com)'}, signal: controller.signal, redirect: 'manual'});
            if (response.status === 429 || response.status === 503 && response.headers.has('Retry-After')) {
              const ms = retryDelay(response.headers.get('Retry-After'));
              cooldowns.set(host, Date.now() + ms); work.fail('upstream_rate_limited', ms);
              console.warn('Upstream paused', host, response.status, Math.round(ms / 1000) + 's');
              await response.body?.cancel().catch(() => {}); return null;
            }
            if (!response.ok) {
              const pause = response.status >= 500 ? strike(host) : 0;
              console.warn('Upstream failed', host, response.status, pause ? 'paused ' + pause / 1000 + 's' : '');
              work.fail('upstream_unavailable', pause || 5000); await response.body?.cancel().catch(() => {}); return null;
            }
            const data = await response.json();
            recovered(host);
            if (data?.error) {
              const ms = data.error.code === 'maxlag' ? 5000 : 30000;
              if (data.error.code === 'maxlag' || data.error.code === 'ratelimited') cooldowns.set(host, Date.now() + ms);
              work.fail('upstream_unavailable', ms); return null;
            }
            return data;
          })()]);
        } catch {
          // A refused connection counts toward the breaker; our own timeout does not.
          const pause = controller.signal.aborted ? 0 : strike(host);
          if (!controller.signal.aborted) console.warn('Upstream unreachable', host, pause ? 'paused ' + pause / 1000 + 's' : '');
          work.fail('upstream_unavailable', pause || 5000); return null;
        }
        finally { clearTimeout(timer); }
      }, work,()=>controller.abort(), optional);
    }
  };
}
const priority = {upstream_unavailable: 1, upstream_timeout: 2, deadline_exceeded: 3, budget_exhausted: 4, work_rate_limited: 5, upstream_rate_limited: 6};
export function createWork(env = {}, ctx = {}, network = createNetwork()) {
  const started = Date.now(); let used = 0, fetched = 0, reason = '', retryUntil = 0;
  const work = {
    env, ctx, network,
    get used() { return used; }, get remaining() { return SUBREQUEST_LIMIT - used; },
    get reason() { return reason; }, get retryAt() { return retryUntil; },
    timeLeft: () => Math.max(0, WORK_TIMEOUT_MS - (Date.now() - started)),
    fail(code, ms = 5000) { if ((priority[code] || 0) >= (priority[reason] || 0)) reason = code; retryUntil = Math.max(retryUntil, Date.now() + ms); },
    // A request that joined another invocation's job answers with that job's
    // failure and full retry time, not with its own empty status.
    absorb(other) { if (other && other !== work && other.reason) work.fail(other.reason, other.retryAt - Date.now()); },
    retrySeconds: (minimum = 5) => Math.max(minimum, Math.ceil((retryUntil - Date.now()) / 1000)),
    available() { if (work.timeLeft() > 0) return true; work.fail('deadline_exceeded'); return false; },
    charge(isFetch = false) {
      if (used >= SUBREQUEST_LIMIT || isFetch && fetched >= FETCH_LIMIT) { work.fail('budget_exhausted'); return false; }
      used++; if (isFetch) fetched++; return true;
    },
    upstream: (url, options) => network.json(url, work, options?.timeoutMs, options?.optional),
    // Pipeline fixtures and callers supplying their own query function still
    // get a complete invocation budget and the same concurrency bound.
    request(query, url, options) {
      return network.schedule(async () => {
        if (!work.available() || !work.charge(true)) return null;
        try { const data = await query(url); if (!data || data.error) work.fail('upstream_unavailable'); return data?.error ? null : data; }
        catch { work.fail('upstream_unavailable'); return null; }
      }, work, undefined, options?.optional);
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
