// Picks the Astro release the daily update job should move to. It takes only
// stable releases in the current major version, and only once they have been
// out for MIN_AGE_DAYS, so a release that is pulled or patched again in its
// first days never reaches the site. A newer major version is reported, not
// installed, because it can need code changes.
//
// Usage: node scripts/astro-update.mjs
// Prints `update=<version>` and `major=<version>` lines for $GITHUB_OUTPUT;
// either value is empty when there is nothing to do.
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

export const MIN_AGE_DAYS = 3;
const DAY = 86_400_000;

const parse = v => {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v));
  return m ? m.slice(1).map(Number) : null;
};
const newer = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

// `times` is the registry's `time` map: version -> ISO publish date.
export function pickUpdate(current, times, now = Date.now(), minAgeDays = MIN_AGE_DAYS) {
  const base = parse(current);
  if (!base) throw new Error(`Astro is not pinned to an exact version: ${current}`);
  let update = null, major = null;
  for (const [version, date] of Object.entries(times || {})) {
    const v = parse(version), at = Date.parse(date);
    if (!v || !Number.isFinite(at) || now - at < minAgeDays * DAY || newer(v, base) <= 0) continue;
    if (v[0] === base[0]) { if (!update || newer(v, update) > 0) update = v; }
    else if (!major || newer(v, major) > 0) major = v;
  }
  return {update: update ? update.join('.') : '', major: major ? major.join('.') : ''};
}

export function pinnedAstro(pkg) {
  return pkg.devDependencies?.astro || pkg.dependencies?.astro || '';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const res = await fetch('https://registry.npmjs.org/astro', {headers: {accept: 'application/json'}});
  if (!res.ok) throw new Error(`npm registry answered ${res.status}`);
  const {time} = await res.json();
  const {update, major} = pickUpdate(pinnedAstro(pkg), time);
  console.log(`update=${update}`);
  console.log(`major=${major}`);
}
