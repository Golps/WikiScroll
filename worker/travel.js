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

// Ordering within a page stays Wikivoyage's search relevance. Measured and
// rejected (September 24, 2026): dropping guides that mention the place only
// after their first sentence lost Tokyo, Sapporo, Rio de Janeiro and Kansai;
// moving them to the end of the page pushed English Tokyo behind airports.

// Disambiguation pages, by description (English) or by title in each edition:
// "Goiás (desambiguação)", "Paris (homonymie)", "Georgia (Begriffsklärung)".
const DISAMBIGUATION_DESCRIPTION = /^topics referred to by the same term$/i;
const DISAMBIGUATION_TITLE = /\((?:disambiguation|desambiguaci[oó]n|desambiguação|homonymie|begriffsklärung|disambigua|значения|曖昧さ回避|消歧[义義]|doorverwijspagina|ujednoznacznienie|פירושונים)\)$/iu;
export const isDisambiguation = page => DISAMBIGUATION_DESCRIPTION.test(page?.description || '') || DISAMBIGUATION_TITLE.test(page?.title || '');

// Phrasebooks are language guides, not destinations. Each Wikivoyage edition
// names them its own way (checked against every edition's phrasebook
// category): "Japanese phrasebook", "Sprachführer Englisch", "Guía de
// húngaro", "Guide linguistique basque", "שיחון איטלקי", "Taalgids Deens",
// "Rozmówki czeskie", "Guia de conversação alemão", "Японский разговорник",
// "英語会話集", "丹麦语会话手册". Italian titles them with the language alone
// ("Cinese"), so the category is checked too: phrasebookParams adds it to the
// same request, and a page in it comes back with a categories list.
export const PHRASEBOOK_CATEGORY = {en: 'Category:Phrasebooks', de: 'Kategorie:Sprachführer', es: 'Categoría:Guías de conversación', fr: 'Catégorie:Guides linguistiques', he: 'קטגוריה:שיחונים', it: 'Categoria:Frasari', ja: 'カテゴリ:会話集', nl: 'Categorie:Taalgids', pl: 'Kategoria:Rozmówki', pt: 'Categoria:Guias de conversação', ru: 'Категория:Разговорники', zh: 'Category:会话手册'};
export const PHRASEBOOK = /\bphrasebooks?\b|^Sprachführer\b|^Guías? de conversación\b|^Guides? linguistiques?\b|^שיחו[ןנ]|^Frasari[oi]?\b|会話集$|^Taalgids\b|^Rozmówki\b|^Guias? de conversação\b|разговорник|会话手册|會話手冊/iu;
// Spanish: "Guía de húngaro" (a language, lower case), never "Guía de Madrid".
const SPANISH_GUIDE = /^Guía de \p{Ll}/u;
export const phrasebookParams = lang => PHRASEBOOK_CATEGORY[lang] ? {clcategories: PHRASEBOOK_CATEGORY[lang], cllimit: 'max'} : {};
export const isPhrasebook = page => PHRASEBOOK.test(page?.title || '') || SPANISH_GUIDE.test(page?.title || '') || (Array.isArray(page?.categories) && page.categories.length > 0);

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
