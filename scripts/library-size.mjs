// Refuses a card-library build that is much smaller than the one it would
// replace. A build's own minimums (build-library.mjs MINIMUM) only catch a
// nearly empty library; a build from part of a dump can pass them and still
// drop most of a language's cards. Compared set by set, so a short topic or
// Help set can't hide behind the large depth sets.
//
//   node scripts/library-size.mjs <live current.json> <new current.json>
//
// Both files may be gzipped, as they are stored. Exit 1: the new build shrank.
import fs from 'node:fs';
import zlib from 'node:zlib';
import {fileURLToPath} from 'node:url';

// A set (or the whole library) may lose up to 30% of its shards between builds.
export const KEEP = 0.7;
// Small sets move by whole shards from week to week; only larger ones are compared.
export const MIN_SHARDS = 50;

const count = value => Number.isSafeInteger(value) && value > 0 ? value : 0;
const total = sets => Object.values(sets).reduce((sum, n) => sum + count(n), 0);

// Returns the reasons the new build is too small ([] when it may be published).
export function shrunk(live, next, keep = KEEP, minShards = MIN_SHARDS) {
  const before = live?.sets, after = next?.sets;
  if (!after || typeof after !== 'object') return ['The new build has no manifest of sets.'];
  // Nothing to compare with: a language's first build, or an unreadable manifest.
  if (!before || typeof before !== 'object') return [];
  const share = (a, b) => Math.round(a * 100 / b) + '%';
  const reasons = [];
  const was = total(before), is = total(after);
  if (was >= minShards && is < was * keep) reasons.push(`The library has ${share(is, was)} of the live build's files (${is} of ${was}).`);
  for (const [set, n] of Object.entries(before)) {
    const old = count(n), now = count(after[set]);
    if (old >= minShards && now < old * keep) reasons.push(`${set} has ${share(now, old)} of the live build's files (${now} of ${old}).`);
  }
  return reasons;
}

export function readManifest(file) {
  const bytes = fs.readFileSync(file);
  return JSON.parse(bytes[0] === 0x1f && bytes[1] === 0x8b ? zlib.gunzipSync(bytes) : bytes);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [liveFile, nextFile] = process.argv.slice(2);
  let live = null, next = null;
  try { live = readManifest(liveFile); } catch {}
  try { next = readManifest(nextFile); } catch {}
  const reasons = shrunk(live, next);
  if (reasons.length) {
    console.error('Not uploading: the new build is much smaller than the live one, keeping the current library.\n' + reasons.join('\n') + '\nIf the smaller library is intended, run the workflow by hand with "force".');
    process.exitCode = 1;
  } else console.log(live ? 'The new build is as large as the live one, within the allowed change.' : 'No live build to compare with.');
}
