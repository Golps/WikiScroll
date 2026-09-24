import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Guard against leftovers: every stylesheet rule must be able to match
// something. A class or id that appears in no page or script can never be
// present, so a rule that REQUIRES it is dead code. Names inside :not(),
// :is(), :where() or :has() are ignored (":not(.old)" still matches).
// Leaflet adds its own leaflet-* classes at runtime.
const pub = new URL('../public/', import.meta.url);
const read = file => fs.readFileSync(new URL(file, pub), 'utf8');
const sources = ['index.html', 'about/index.html', 'app.js', 'atlas.js', 'features.js', 'discovery.js', 'i18n.js', 'about.js', 'sw.js'].map(read).join('\n');
const names = new Set(sources.match(/[A-Za-z_][\w-]*/g));
const runtime = name => name.startsWith('leaflet-');

export function deadRules(css) {
  const dead = [];
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  // Every selector prelude: text before "{" that is not an at-rule or keyframe step.
  for (const match of text.matchAll(/(^|[{};])\s*([^{};@]+?)\s*\{/g)) {
    const prelude = match[2].trim();
    if (!prelude || /^(from|to|\d[\d.]*%)(\s*,\s*(from|to|\d[\d.]*%))*$/.test(prelude)) continue;
    const selectors = [];
    let depth = 0, start = 0;
    for (let i = 0; i < prelude.length; i++) {
      const c = prelude[i];
      if (c === '(') depth++; else if (c === ')') depth--;
      else if (c === ',' && depth === 0) { selectors.push(prelude.slice(start, i)); start = i + 1; }
    }
    selectors.push(prelude.slice(start));
    const required = s => {
      let out = '', level = 0;
      for (const c of s) { if (c === '(') level++; else if (c === ')') level--; else if (level === 0) out += c; }
      return [...out.matchAll(/[.#](-?[A-Za-z_][\w-]*)/g)].map(m => m[1]);
    };
    const live = selectors.filter(s => required(s).every(n => names.has(n) || runtime(n)));
    if (live.length === 0) dead.push(prelude);
  }
  return dead;
}

test('the stylesheet has no rules for classes or ids the site no longer uses', () => {
  const dead = deadRules(read('styles.css'));
  assert.deepEqual(dead, [], `Remove these unused rules (their class or id appears in no page or script):\n${dead.join('\n')}`);
});

test('the dead-rule check catches leftovers but keeps negations and live alternatives', () => {
  assert.deepEqual(deadRules('.gone-feature{color:red}'), ['.gone-feature']);
  assert.deepEqual(deadRules('.act:not(.gone-feature){color:red}.gone-feature, .card{color:red}.card :is(.gone-feature,.act){x:y}@keyframes k{0%{x:y}to{x:y}}'), []);
});
