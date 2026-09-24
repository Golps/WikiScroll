// Wikivoyage travel search (/api/travel): how the place filter is read and how
// results are ranked. The request handling itself lives in index.js.

// "Japan, Tuscany", "Japan / Tuscany" and "Japan or Tuscany" each mean either
// place. Punctuation works in every language; the word "or" is recognized in
// English and in the reader's own language. "and" is never a separator, so
// "Trinidad and Tobago" stays one place.
const OR_WORDS = {en: 'or', es: 'o', it: 'o', pt: 'ou|o', fr: 'ou', de: 'oder', pl: 'lub', ru: 'или', he: 'או', ar: 'أو'};
export const MAX_PLACES = 3;

export function parsePlaces(input, lang = 'en') {
  const words = [...new Set(['or', ...(OR_WORDS[lang] || '').split('|')].filter(Boolean))].join('|');
  const parts = String(input || '').split(new RegExp(`[,;/|、，；،]|\\s(?:${words})\\s`, 'iu'));
  const seen = new Set(), places = [];
  for (const part of parts) {
    const clean = part.replace(/[^\p{L}\p{N}\s'-]/gu, ' ').replace(/\s+/g, ' ').trim();
    if (clean && !seen.has(fold(clean))) { seen.add(fold(clean)); places.push(clean); }
  }
  return places.slice(0, MAX_PLACES);
}

// Case, accents, apostrophes and hyphens don't matter when comparing names:
// "Cote d’Azur" matches "Côte d'Azur", "Saint Tropez" matches "Saint-Tropez".
export function fold(text) {
  return String(text || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[’‘`´]/g, "'").replace(/[-‐–—]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Full-text search also finds guides that mention the place only in passing
// (a Korean city with a ferry to Japan). A guide belongs to the place when its
// title or its introduction names it.
export function namesPlace(page, place) {
  const name = fold(place);
  return fold(page.title).includes(name) || fold(page.extract).includes(name);
}

// Phrasebooks are language guides, not destinations.
export const PHRASEBOOK = /\bphrasebook\b/i;

// Alternate between places so one never crowds out another. A guide that
// matches two places appears once.
export function interleave(lists) {
  const out = [], seen = new Set();
  for (let i = 0; lists.some(list => i < list.length); i++)
    for (const list of lists) if (i < list.length && !seen.has(list[i].pageid)) { seen.add(list[i].pageid); out.push(list[i]); }
  return out;
}

// The pagination cursor holds one search offset per place: "20" for one place,
// "20.12" for two, with "-" for a place that has no more results.
export function parseCursor(value, count) {
  const slots = Math.max(count, 1);
  if (value == null || value === '') return Array(slots).fill(0);
  if (!/^(\d{1,5}|-)(\.(\d{1,5}|-)){0,2}$/.test(value)) return null;
  const parts = value.split('.').map(v => v === '-' ? null : Number(v));
  if (parts.length > slots || parts.some(v => v !== null && v > 10000)) return null;
  while (parts.length < slots) parts.push(0);
  return parts;
}
export function formatCursor(parts) {
  if (parts.every(part => part === null)) return null;
  return parts.length === 1 ? parts[0] : parts.map(part => part === null ? '-' : part).join('.');
}
