// Trip styles for Wikivoyage guides: what kind of place each guide is about,
// read once a week while the card library is built. Facts about the place
// come from Wikidata (what it is, how many people live there, the water it
// lies on, its elevation, World Heritage status), and each edition adds what
// it records itself: article types, UNESCO categories and section headings
// such as "Beaches" or "Diving". States, provinces and countries never count
// as a city, a town or a beach, which is what made the old keyword styles
// answer "City breaks" with Connecticut.
import fs from 'node:fs';
import zlib from 'node:zlib';
import {TRAVEL_STYLES} from '../worker/travel.js';

// Wikidata classes the styles read. A place counts as one when its "instance
// of" (P31) is the class or any subclass of it; "located next to" (P206)
// is read the same way for the water classes.
export const CLASSES = {
  settlement: 'Q486972', city: 'Q515', town: 'Q3957', village: 'Q532',
  island: 'Q23442', archipelago: 'Q33837',
  protected: 'Q473972', nationalPark: 'Q46169',
  mountain: 'Q8502', range: 'Q46831', skiResort: 'Q130003', volcano: 'Q8072', glacier: 'Q35666', hillStation: 'Q1149652',
  beach: 'Q40080', reef: 'Q184358',
  archaeological: 'Q839954', castle: 'Q23413', monastery: 'Q44613', oldTown: 'Q676050',
  airport: 'Q1248784',
  country: 'Q6256', firstLevel: 'Q10864048', state: 'Q107390', province: 'Q34876',
  sea: 'Q165', ocean: 'Q9430', bay: 'Q39594', gulf: 'Q1322134', lagoon: 'Q187223', strait: 'Q37901'
};
const WORLD_HERITAGE = 'Q9259';
const SETTLEMENT = ['settlement', 'city', 'town', 'village'], REGION = ['country', 'firstLevel', 'state', 'province'];
const SEA = ['sea', 'ocean', 'bay', 'gulf', 'lagoon', 'strait'];
// Thresholds, checked against the English export of October 25, 2026.
export const BIG_CITY = 1_000_000, SMALL_TOWN = 30_000, BEACH_TOWN = 150_000, MOUNTAIN_TOWN = 100_000, MOUNTAIN_ELEVATION = 1000, SKI_TOWN = 60_000;

// What each edition records itself. Category names are without their
// namespace, as the search dump lists them; headings are compared in lower case.
const TYPES = {
  en: {city: ['City articles'], huge: ['Huge city articles'], region: ['Region articles', 'Country articles', 'Continent articles'], park: ['Park articles'], dive: ['Dive guide articles'], unesco: ['UNESCO World Heritage Sites']},
  fr: {city: ['Ville'], region: ['Région', 'Pays'], unesco: ["Site inscrit à la liste du patrimoine mondial de l'UNESCO"]},
  it: {city: ['Città'], region: ['Regione', 'Regione nazionale', 'Stato']},
  es: {city: ['Wikiviajes:Artículos ciudad'], region: ['Wikiviajes:Artículos región', 'Wikiviajes:Artículos país']},
  pt: {city: ['Cidades'], region: ['Regiões', 'Países'], park: ['Parques']},
  ru: {city: ['Статьи о городах'], region: ['Статьи о регионах', 'Статьи о странах'], park: ['Статьи о парках']},
  ja: {city: ['都市'], region: ['国', '地域']},
  zh: {city: ['城市条目'], region: ['地区条目', '国家条目'], park: ['公园条目'], unesco: ['联合国教科文组织世界遗产']},
  he: {unesco: ['אתרי מורשת עולמית']},
  pl: {unesco: ['Obiekty z listy światowego dziedzictwa UNESCO']}
};
const HEADINGS = {
  beach: {en: ['beach', 'beaches'], de: ['strand', 'strände', 'strandbäder'], fr: ['plage', 'plages', 'les plages'], it: ['spiagge', 'vita da spiaggia'], es: ['playas'], pt: ['praias'], ru: ['пляжи', 'пляжный отдых'], ja: ['ビーチ', '海水浴場'], zh: ['海滩', '沙滩', '海灘'], he: ['חופים'], nl: ['stranden', 'strandvertier'], pl: ['plaże']},
  hiking: {en: ['hiking', 'hike', 'trekking', 'hiking and trekking'], de: ['wandern', 'wanderungen', 'wanderwege', 'wandern und bergsteigen', 'bergwandern', 'trekking'], fr: ['randonnée', 'randonnées', 'sentiers de randonnées', 'randonnée pédestre', 'randonnées pédestres'], it: ['escursioni', 'escursionismo', 'trekking'], es: ['senderismo', 'senderos'], pt: ['trilhas', 'caminhadas'], ru: ['походы', 'треккинг'], ja: ['登山', 'ハイキング'], zh: ['徒步', '登山'], he: ['טיולי הליכה', 'מסלולי טיול', 'טיולים רגליים'], nl: ['wandelen'], pl: ['szlaki turystyczne', 'wędrówki', 'szlaki']},
  diving: {en: ['diving', 'scuba diving', 'dive sites', 'diving and snorkeling', 'diving and snorkelling', 'snorkeling', 'snorkelling'], de: ['tauchen', 'tauchen und schnorcheln', 'schnorcheln und tauchen', 'tauchbasen', 'tauchplätze'], fr: ['plongée', 'plongée sous-marine'], it: ['immersioni', 'immersioni subacquee'], es: ['buceo'], pt: ['mergulho'], ru: ['дайвинг'], ja: ['ダイビング'], zh: ['潜水'], he: ['צלילה'], nl: ['duiken'], pl: ['nurkowanie']},
  ski: {en: ['ski', 'skiing', 'skiing and snowboarding', 'winter sports'], de: ['wintersport', 'ski alpin', 'skifahren', 'skigebiete', 'ski nordisch'], fr: ['ski', 'ski alpin', 'stations de ski', 'ski de fond'], it: ['sci', 'sciare', 'sci e snowboard'], es: ['esquí'], pt: ['esqui'], ru: ['горнолыжные курорты'], ja: ['スキー'], zh: ['滑雪'], he: ['סקי'], nl: ['skiën'], pl: ['warunki narciarskie']}
};

const has = (list, values) => list.some(value => values.has(value));
// Styles of one guide: doc is its search-dump document, place its Wikidata
// facts (placeFacts) or undefined.
export function tripStyles(doc, place, lang = 'en') {
  const categories = new Set(Array.isArray(doc.category) ? doc.category : []), types = TYPES[lang] || {};
  const headings = new Set((Array.isArray(doc.heading) ? doc.heading : []).map(h => String(h).trim().toLowerCase()));
  const heading = style => (HEADINGS[style][lang] || []).some(h => headings.has(h));
  const typed = name => (types[name] || []).some(c => categories.has(c));
  const kinds = new Set(place?.kinds || []), water = new Set(place?.water || []), pop = place?.population || 0, elevation = place?.elevation ?? null;
  const district = String(doc.title || '').includes('/');
  const region = has(REGION, kinds) || typed('region');
  const settlement = !region && (has(SETTLEMENT, kinds) || typed('city'));
  const park = has(['protected', 'nationalPark'], kinds) || typed('park');
  // Topics ("Hiking in the Nordic countries") are about no place, so a
  // heading alone tags only a guide that is about one.
  const aboutPlace = settlement || park || kinds.size > 0 || typed('city') || Array.isArray(doc.coordinates) && doc.coordinates.length > 0;
  // An airport is a way in, not a trip (Chubu Centrair sits on an island).
  if (kinds.has('airport')) return [];
  const styles = new Set();
  if (settlement && (pop >= BIG_CITY || typed('huge'))) styles.add('city');
  if (settlement && !district && pop > 0 && pop < SMALL_TOWN) styles.add('town');
  if (has(['island', 'archipelago'], kinds) && !kinds.has('country')) styles.add('island');
  if (!region && aboutPlace && (kinds.has('beach') || heading('beach') && (pop < BEACH_TOWN || has(SEA, water)) || settlement && pop > 0 && pop < BEACH_TOWN && has(SEA, water))) styles.add('beach');
  if (!region && (has(['mountain', 'range', 'skiResort', 'volcano', 'glacier', 'hillStation'], kinds) || settlement && pop < SKI_TOWN && heading('ski') || settlement && pop > 0 && pop < MOUNTAIN_TOWN && elevation !== null && elevation >= MOUNTAIN_ELEVATION)) styles.add('mountain');
  if (park) styles.add('park');
  if ((!region || park) && aboutPlace && heading('hiking')) styles.add('hiking');
  if (typed('dive') || !region && aboutPlace && (heading('diving') || kinds.has('reef'))) styles.add('diving');
  if (place?.heritage || typed('unesco') || has(['archaeological', 'castle', 'monastery', 'oldTown'], kinds)) styles.add('heritage');
  return TRAVEL_STYLES.filter(style => styles.has(style));
}

// ── Wikidata facts ──────────────────────────────────────────────────────────
// Free and public: the Wikidata Query Service, a few hundred polite requests a
// week. Class ancestry barely changes, so the classes already resolved last
// week are reused and only new ones are asked about. A batch the service
// can't answer is split and asked again, down to single entries, which are
// then skipped. If the service is down, the facts saved by the last good build
// (at most FACTS_MAX_AGE old) stand in, and without those the build tags from
// the edition's own categories and headings only: a Wikidata outage never
// stops a build.
export const FACTS_MAX_AGE = 42 * 86400000, ITEMS_PER_QUERY = 300, CLASSES_PER_QUERY = 60;
// Most entries skipped (unanswerable even alone) before the facts count as failed.
const MAX_SKIPPED = 0.02;
const ENDPOINT = 'https://query.wikidata.org/sparql';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function sparql(query, {userAgent, fetchImpl = fetch, pause = 1000, sleep = wait, attempts = 4}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetchImpl(ENDPOINT, {method: 'POST', headers: {'User-Agent': userAgent, Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams({query}), signal: AbortSignal.timeout(70000)});
      // 429: wait as asked. A 500 is usually the query timing out: retry once, then split.
      if (response.status === 429) { await sleep(Math.min(120, Number(response.headers.get('Retry-After')) || 2 ** attempt * 5) * 1000); continue; }
      if (response.status >= 500) { await sleep(2 ** attempt * 3000); if (attempt >= 1) return null; continue; }
      if (!response.ok) return null;
      const data = await response.json();
      await sleep(pause);
      return data?.results?.bindings || null;
    } catch { await sleep(2 ** attempt * 2000); }
  }
  return null;
}
// Runs query over ids in batches; a batch without an answer is halved and
// asked again. Returns {rows, skipped}, or null once MAX_MISSES requests in a
// row went unanswered (the service is down, not one query too heavy).
const MAX_MISSES = 12;
async function batched(ids, size, query, options) {
  const rows = [], skipped = [], queue = [];
  let misses = 0;
  for (let i = 0; i < ids.length; i += size) queue.push(ids.slice(i, i + size));
  while (queue.length) {
    const batch = queue.shift(), answer = await sparql(query(batch.map(id => 'wd:' + id).join(' ')), options);
    if (answer) { rows.push(...answer); misses = 0; continue; }
    if (++misses >= MAX_MISSES) return null;
    if (batch.length > 1) queue.unshift(batch.slice(0, batch.length >> 1), batch.slice(batch.length >> 1));
    else skipped.push(batch[0]);
  }
  return {rows, skipped};
}
const qid = value => /\/(Q\d+)$/.exec(String(value || ''))?.[1];
// Item → {kinds, water, population, elevation, heritage}, and the class
// ancestry used ({class: [style class names]}), or null when the service
// didn't answer. known: ancestry resolved before, reused as is.
export async function fetchPlaceFacts(items, {known = new Map(), log = () => {}, ...options}) {
  const ids = [...new Set(items)].filter(id => /^Q\d+$/.test(id)).sort(), raw = new Map();
  const found = await batched(ids, ITEMS_PER_QUERY, values => `SELECT ?item ?p ?v WHERE { VALUES ?item { ${values} } VALUES ?p { wdt:P31 wdt:P206 wdt:P1082 wdt:P2044 wdt:P1435 } ?item ?p ?v }`, options);
  if (!found || found.skipped.length > Math.max(1, ids.length * MAX_SKIPPED)) return null;
  for (const row of found.rows) {
    const item = qid(row.item?.value), property = /\/(P\d+)$/.exec(row.p?.value || '')?.[1], value = row.v?.value;
    if (!item || !property || value == null) continue;
    let entry = raw.get(item);
    if (!entry) raw.set(item, entry = {P31: [], P206: [], P1082: [], P2044: [], P1435: []});
    entry[property]?.push(value);
  }
  const classes = [...new Set([...raw.values()].flatMap(entry => [...entry.P31, ...entry.P206].map(qid)).filter(Boolean))].sort();
  const names = new Map(Object.entries(CLASSES).map(([name, id]) => [id, name])), targets = [...names.keys()].map(id => 'wd:' + id).join(' ');
  const ancestry = new Map(classes.filter(c => known.has(c)).map(c => [c, known.get(c)])), asked = classes.filter(c => !known.has(c));
  log(`Wikidata: ${raw.size} of ${ids.length} items have facts; ${classes.length} classes, ${asked.length} new`);
  const resolved = await batched(asked, CLASSES_PER_QUERY, values => `SELECT ?c ?t WHERE { VALUES ?c { ${values} } VALUES ?t { ${targets} } ?c wdt:P279* ?t }`, options);
  if (!resolved || resolved.skipped.length > Math.max(1, asked.length * MAX_SKIPPED)) return null;
  const skipped = new Set(resolved.skipped);
  for (const c of asked) if (!skipped.has(c)) ancestry.set(c, []);
  for (const row of resolved.rows) {
    const c = qid(row.c?.value), name = names.get(qid(row.t?.value));
    if (c && name && ancestry.has(c) && !ancestry.get(c).includes(name)) ancestry.get(c).push(name);
  }
  for (const list of ancestry.values()) list.sort();
  const kindsOf = values => [...new Set(values.flatMap(value => ancestry.get(qid(value)) || []))].sort();
  const numbers = values => values.map(Number).filter(Number.isFinite);
  const facts = new Map();
  for (const [item, entry] of raw) {
    const fact = {}, kinds = kindsOf(entry.P31), water = kindsOf(entry.P206).filter(k => SEA.includes(k)), population = Math.max(0, ...numbers(entry.P1082)), elevations = numbers(entry.P2044);
    if (kinds.length) fact.kinds = kinds;
    if (water.length) fact.water = water;
    if (population > 0) fact.population = Math.round(population);
    // The lowest elevation: a town's listed peaks don't make it a mountain town.
    if (elevations.length) fact.elevation = Math.round(Math.min(...elevations));
    if (entry.P1435.some(value => qid(value) === WORLD_HERITAGE)) fact.heritage = 1;
    if (Object.keys(fact).length) facts.set(item, fact);
  }
  return {facts, classes: ancestry};
}

// The saved file: {v, fetchedAt, items, classes}. The class list in CLASSES is
// part of it, so a changed list starts the ancestry afresh.
const CLASS_KEY = Object.values(CLASSES).join(',');
export function readFactsFile(file, now = Date.now()) {
  try {
    const saved = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)));
    const age = now - Date.parse(saved.fetchedAt);
    if (saved.v !== 2 || saved.classKey !== CLASS_KEY || !(age >= 0 && age <= FACTS_MAX_AGE) || typeof saved.items !== 'object') return null;
    return {facts: new Map(Object.entries(saved.items)), classes: new Map(Object.entries(saved.classes || {})), fetchedAt: saved.fetchedAt};
  } catch { return null; }
}
export function writeFactsFile(file, {facts, classes = new Map()}, fetchedAt = new Date().toISOString()) {
  fs.writeFileSync(file, zlib.gzipSync(JSON.stringify({v: 2, fetchedAt, classKey: CLASS_KEY, items: Object.fromEntries(facts), classes: Object.fromEntries(classes)}) + '\n'));
}
// Fresh facts when Wikidata answers (saved for next week), else the saved ones.
export async function placeFacts(items, {cacheFile, log = () => {}, ...options}) {
  const saved = cacheFile ? readFactsFile(cacheFile) : null;
  const fresh = await fetchPlaceFacts(items, {known: saved?.classes, log, ...options});
  if (fresh) {
    if (cacheFile) writeFactsFile(cacheFile, fresh);
    log(`Wikidata place facts: ${fresh.facts.size} of ${new Set(items).size} items`);
    return {facts: fresh.facts, source: 'wikidata'};
  }
  if (saved) { log(`Warning: Wikidata did not answer; using the place facts saved ${saved.fetchedAt}.`); return {facts: saved.facts, source: 'saved'}; }
  log('Warning: Wikidata did not answer and no recent saved facts exist; trip styles come from Wikivoyage categories and headings only this week.');
  return {facts: new Map(), source: 'none'};
}
