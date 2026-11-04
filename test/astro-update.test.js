import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pickUpdate, pinnedAstro, MIN_AGE_DAYS} from '../scripts/astro-update.mjs';

const now = Date.parse('2026-11-10T12:00:00Z');
const ago = days => new Date(now - days * 86_400_000).toISOString();

test('the Astro update takes the newest settled release in the same major', () => {
  const times = {created: ago(900), modified: ago(0), '7.4.4': ago(13), '7.4.5': ago(8), '7.5.0': ago(4), '7.5.1': ago(1)};
  assert.deepEqual(pickUpdate('7.4.4', times, now), {update: '7.5.0', major: ''});
});

test('the Astro update skips prereleases, older versions and fresh releases', () => {
  const times = {'7.4.3': ago(20), '7.4.4': ago(10), '7.4.5-beta.0': ago(9), '7.4.5': ago(MIN_AGE_DAYS - 1)};
  assert.deepEqual(pickUpdate('7.4.4', times, now), {update: '', major: ''});
});

test('a new Astro major is reported, not installed', () => {
  const times = {'7.4.4': ago(10), '8.0.0': ago(5), '8.0.1': ago(4), '8.1.0-beta.1': ago(4)};
  assert.deepEqual(pickUpdate('7.4.4', times, now), {update: '', major: '8.0.1'});
});

test('the Astro update needs an exact pin', () => {
  assert.throws(() => pickUpdate('^7.4.4', {}, now), /exact version/);
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(pinnedAstro(pkg), /^\d+\.\d+\.\d+$/);
});
