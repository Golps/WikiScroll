// Publication runs under the workflow-wide lock, one language at a time.
// Build jobs must never invoke this concurrently against the same bucket.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';

export const RETAIN_MS = 24 * 60 * 60 * 1000;
const buildName = value => typeof value === 'string' && /^\d{8}(?:-\d+)?$/.test(value);
export function publicationPlan({objects, retired, current, build, lang, bytes, writes, cost, storageLimit, writeLimit, now}) {
  if (!/^[a-z]{2,3}$/.test(lang) || !buildName(build) || current && !buildName(current)) throw new Error('Invalid library identity');
  if (current === build) throw new Error('Refusing to overwrite a published build; use a new build ID');
  if (!Array.isArray(objects) || !retired || typeof retired !== 'object' || Array.isArray(retired)) throw new Error('Invalid bucket accounting');
  for (const n of [bytes, writes, cost, storageLimit, writeLimit, now]) if (!Number.isSafeInteger(n) || n < 0) throw new Error('Invalid budget value');
  const prefix = `v1/${lang}/`, sizes = new Map(); let used = 0;
  for (const o of objects) {
    if (typeof o.Key !== 'string' || !Number.isSafeInteger(o.Size) || o.Size < 0) throw new Error('Invalid object listing');
    used += o.Size;
    if (o.Key.startsWith(prefix)) {
      const id = o.Key.slice(prefix.length).split('/')[0];
      if (buildName(id)) sizes.set(id, (sizes.get(id) || 0) + o.Size);
    }
  }
  for (const [id, at] of Object.entries(retired)) if (!buildName(id) || !Number.isSafeInteger(at) || at < 0) throw new Error('Invalid retirement journal');
  const remove = [...sizes.keys()].filter(id => id !== current && id !== build && retired[id] !== undefined && now - retired[id] >= RETAIN_MS);
  // Conservative: count the entire incoming build, including partially uploaded
  // retry files already listed. Never subtract the currently published version.
  const peak = used - remove.reduce((n, id) => n + sizes.get(id), 0) + bytes + 65536;
  if (peak > storageLimit) throw new Error('Storage guard: not enough room for old and new libraries');
  if (writes + cost > writeLimit) throw new Error('Write guard: monthly upload allowance reached');
  const journal = {...retired};
  for (const id of sizes.keys()) if (id !== build && journal[id] === undefined) journal[id] = now;
  // The active build's grace period starts at this switch, not its build date
  // or an earlier failed publication attempt.
  if (current) journal[current] = now;
  for (const id of remove) delete journal[id];
  delete journal[build];
  return {remove, peak, writes: writes + cost, journal};
}

export function publishLibrary(directory, env = process.env, run = execFileSync) {
  const {R2_BUCKET: bucket, R2_ENDPOINT: endpoint, LANG_CODE: lang, LIBRARY_BUILD: build} = env;
  if (!bucket || !endpoint || !/^[a-z]{2,3}$/.test(lang || '') || !buildName(build)) throw new Error('Missing publication configuration');
  const aws = (args, input) => {
    try { return run('aws', [...args, '--endpoint-url', endpoint], {input, maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe']}); }
    catch { throw new Error('R2 operation failed; publication stopped'); } // Never print endpoint or credential-bearing stderr.
  };
  const listing = JSON.parse(aws(['s3api', 'list-objects-v2', '--bucket', bucket, '--output', 'json']).toString());
  if (!listing || typeof listing !== 'object' || listing.IsTruncated === true || (!Array.isArray(listing.Contents) && listing.KeyCount !== 0)) throw new Error('Incomplete bucket listing');
  const objects = listing.Contents || [];
  const present = new Set(objects.map(o => o.Key));
  const read = key => {
    if (!present.has(key)) return null;
    const data = aws(['s3', 'cp', `s3://${bucket}/${key}`, '-']);
    return JSON.parse((data[0] === 0x1f && data[1] === 0x8b ? gunzipSync(data) : data).toString());
  };
  const now = Date.now(), month = new Date(now).toISOString().slice(0, 7);
  const ledgerKey = `usage/writes-${month}.json`, journalKey = `usage/retired-${lang}.json`;
  const ledger = read(ledgerKey), oldKey = `v1/${lang}/current.json`, old = read(oldKey);
  const retired = present.has(journalKey) ? read(journalKey) : {};
  if (present.has(ledgerKey) && (!ledger || !Number.isSafeInteger(ledger.writes) || ledger.writes < 0)) throw new Error('Invalid write ledger');
  if (present.has(oldKey) && (!old || !buildName(old.build))) throw new Error('Invalid live manifest');
  const manifestFile = path.join(directory, 'current.json');
  const manifest = JSON.parse(gunzipSync(fs.readFileSync(manifestFile)).toString());
  if (manifest.build !== build || manifest.base !== `${build}/`) throw new Error('Build does not match its manifest');
  let bytes = fs.statSync(manifestFile).size, files = 1;
  const walk = dir => { for (const e of fs.readdirSync(dir, {withFileTypes:true})) {
    const file = path.join(dir,e.name);
    if (e.isDirectory()) walk(file);
    else if (e.isFile()) { bytes += fs.statSync(file).size; files++; }
    else throw new Error('Unsupported library file');
  }};
  walk(path.join(directory, build));
  const plan = publicationPlan({objects, retired, current:old?.build, build, lang, bytes, writes:ledger?.writes ?? 0,
    cost:files + 2000, storageLimit:Number(env.STORAGE_LIMIT), writeLimit:Number(env.WRITE_LIMIT), now});
  const putJSON = (key, value) => aws(['s3','cp','-',`s3://${bucket}/${key}`,'--only-show-errors','--content-type','application/json','--cache-control','no-store'], JSON.stringify(value));
  // Reserve writes before any mutation. Failed uploads conservatively keep the reservation.
  putJSON(ledgerKey, {writes:plan.writes});
  for (const id of plan.remove) aws(['s3','rm',`s3://${bucket}/v1/${lang}/${id}/`,'--recursive','--only-show-errors']);
  aws(['s3','sync',path.join(directory,build),`s3://${bucket}/v1/${lang}/${build}/`,'--only-show-errors',
    '--content-type','application/json','--content-encoding','gzip','--cache-control','public, max-age=31536000, immutable']);
  // Save retirement state before switching. Cleanup always excludes the live manifest's build.
  putJSON(journalKey, plan.journal);
  aws(['s3','cp',manifestFile,`s3://${bucket}/v1/${lang}/current.json`,'--only-show-errors',
    '--content-type','application/json','--content-encoding','gzip','--cache-control','public, max-age=300']);
  console.log(`Library ${lang} ${build} published; previous files retained for at least 24 hours. Peak budget: ${plan.peak} bytes.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { publishLibrary(process.argv[2]); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
