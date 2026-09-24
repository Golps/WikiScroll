const atlasIcon = {"bookmark": "<svg class=\"atlas-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M6 3h12v18l-6-4-6 4z\"/></svg>", "share": "<svg class=\"atlas-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M12 16V3m-5 5 5-5 5 5M5 13v7h14v-7\"/></svg>", "arrow": "<svg class=\"atlas-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M5 12h14m-6-6 6 6-6 6\"/></svg>", "branch": "<svg class=\"atlas-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"6\" cy=\"5\" r=\"2\"/><circle cx=\"18\" cy=\"6\" r=\"2\"/><circle cx=\"6\" cy=\"19\" r=\"2\"/><path d=\"M6 7v10m0-4h5a7 7 0 0 0 7-5\"/></svg>", "globe": "<svg class=\"atlas-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"9\"/><ellipse cx=\"12\" cy=\"12\" rx=\"4\" ry=\"9\"/><path d=\"M3 12h18\"/></svg>", "grid": "<svg class=\"atlas-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"3\" y=\"3\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"14\" y=\"3\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"3\" y=\"14\" width=\"7\" height=\"7\" rx=\"1\"/><rect x=\"14\" y=\"14\" width=\"7\" height=\"7\" rx=\"1\"/></svg>", "settings": "<svg class=\"atlas-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M3 6h6m4 0h8M3 12h12m4 0h2M3 18h2m4 0h12\"/><circle cx=\"11\" cy=\"6\" r=\"2\"/><circle cx=\"17\" cy=\"12\" r=\"2\"/><circle cx=\"7\" cy=\"18\" r=\"2\"/></svg>", "eye": "<svg class=\"atlas-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/></svg>"};
'use strict';

// ── CONSTANTS ──────────────────────────────────────────────────────────────
const LANGS = [
  {c:'en',n:'English',f:'🇬🇧'},{c:'es',n:'Español',f:'🇪🇸'},
  {c:'fr',n:'Français',f:'🇫🇷'},{c:'de',n:'Deutsch',f:'🇩🇪'},
  {c:'it',n:'Italiano',f:'🇮🇹'},{c:'pt',n:'Português',f:'🇵🇹'},
  {c:'ru',n:'Русский',f:'🇷🇺'},{c:'ja',n:'日本語',f:'🇯🇵'},
  {c:'zh',n:'中文',f:'🇨🇳'},{c:'ar',n:'العربية',f:'🇸🇦'},
  {c:'hi',n:'हिन्दी',f:'🇮🇳'},{c:'ko',n:'한국어',f:'🇰🇷'},
  {c:'he',n:'עברית',f:'🇮🇱'},{c:'nl',n:'Nederlands',f:'🇳🇱'},{c:'pl',n:'Polski',f:'🇵🇱'},
];

const TOPICS = [
 {id:'space',label:'Space',emoji:'🪐',cats:[],vCats:[],valid:/\b(astronomy|astronomer|galaxy|galaxies|asteroid|exoplanet|spacecraft|nebula|cosmology)\b/i},
 {id:'architecture',label:'Architecture',emoji:'🏛️',cats:[],vCats:[],valid:/\b(architect|architecture|architectural|cathedral|skyscraper|basilica)\b/i},
 {id:'music',label:'Music',emoji:'🎵',cats:[],vCats:[],valid:/\b(composer|symphony|musician|musical|orchestra|concerto|sonata)\b/i},
  {id:'biology',label:'Biology',emoji:'🧬',cats:[],vCats:[],valid:/\b(species|genus|organism|bacterium|fungus|protein|genetics|botany|zoology)\b/i},
  {
    id:'food',label:'Food',emoji:'🍽️',
    cats:['Category:Cheeses','Category:Cocktails','Category:Soups','Category:Breads','Category:Noodle dishes','Category:Rice dishes','Category:Chocolate','Category:Coffee','Category:Tea','Category:Sushi','Category:Stews','Category:Salads','Category:Cakes','Category:Cookies','Category:Pies','Category:Sauces','Category:Fermented foods','Category:Street food'],
    valid:/\b(dish|food|cuisine|ingredient|flavor|flavour|taste|cooked|eaten|recipe|meal|snack|drink|beverage|served|baked|fried|grilled|brewed|fermented|cheese|bread|pasta|meat|vegetable|fruit|spice|herb|sauce|soup|dessert|sweet|savoury|savory)\b/i,
    vCats:['Category:Food and drink','Category:Restaurants'],
  },
  {
    id:'science',label:'Science',emoji:'🔬',
    cats:['Category:Chemical elements','Category:Constellations','Category:Exoplanets','Category:Minerals','Category:Mammals','Category:Birds','Category:Insects','Category:Fish','Category:Reptiles','Category:Amphibians','Category:Spiders','Category:Viruses','Category:Bacteria','Category:Fungi','Category:Mosses','Category:Orchids','Category:Subatomic particles','Category:Comets','Category:Asteroids'],
    valid:/\b(species|genus|family|order|class|element|compound|molecule|atom|particle|planet|star|galaxy|nebula|cell|protein|dna|rna|organism|native to|found in|named after|discovered|described by|scientific name|biology|chemistry|physics|astronomy|ecology|habitat|distribution)\b/i,
    vCats:['Category:Natural attractions','Category:National parks'],
  },
  {
    id:'history',label:'History',emoji:'🏛️',
    cats:['Category:Battles of World War II','Category:Battles of World War I','Category:Battles of the Napoleonic Wars','Category:Battles of the American Civil War','Category:Ancient Rome','Category:Ancient Egypt','Category:Ancient Greece','Category:Medieval castles','Category:Viking Age','Category:Crusades','Category:Byzantine Empire','Category:Ottoman Empire','Category:Mughal Empire','Category:Aztec','Category:Inca Empire','Category:Cold War'],
    valid:/\b(battle|war|siege|empire|kingdom|dynasty|ruled|conquered|revolt|revolution|treaty|medieval|ancient|century|\bbc\b|\bad\b|reign|fought|defeated|founded|established|occupation|invasion|rebellion|republic|pharaoh|emperor|general|army|navy|troops)\b/i,
    vCats:['Category:Historical sites','Category:Castles','Category:UNESCO World Heritage Sites'],
  },
  {
    id:'geo',label:'Geography',emoji:'🌍',
    cats:['Category:Islands of the Pacific Ocean','Category:Islands of the Atlantic Ocean','Category:Islands of the Indian Ocean','Category:Active volcanoes','Category:Mountain ranges','Category:Waterfalls','Category:Glaciers','Category:Deserts','Category:Caves','Category:Canyons','Category:Lagoons','Category:Atolls','Category:Peninsulas','Category:Straits','Category:Bays','Category:Rivers of Africa','Category:Rivers of Asia','Category:Rivers of South America'],
    valid:/\b(island|volcano|mountain|lake|river|ocean|sea|coast|peninsula|valley|glacier|desert|forest|national park|range|peak|summit|elevation|metres|meters|feet|kilometres|km|miles|located|situated|geography|terrain|climate|landscape|inlet|bay|strait|atoll|lagoon|cave|canyon|waterfall)\b/i,
    vCats:['Category:Islands','Category:National parks','Category:Natural attractions','Category:Mountains'],
  },
  {
    id:'arts',label:'Arts',emoji:'🎨',
    cats:['Category:Baroque paintings','Category:Renaissance paintings','Category:Impressionist paintings','Category:Operas','Category:Symphonies','Category:String quartets','Category:Gothic cathedrals','Category:Art Nouveau architecture','Category:Neoclassical architecture','Category:Modernist architecture','Category:Ancient Greek sculptures','Category:Ballet','Category:Silent films','Category:Jazz standards'],
    valid:/\b(painting|sculpture|architecture|composer|symphony|opera|ballet|novel|poem|film|director|musician|artist|gallery|museum|style|movement|genre|performed|written|painted|composed|concerto|sonata|fresco|mosaic|cathedral|palace|artwork|canvas|oil paint|watercolour|watercolor)\b/i,
    vCats:['Category:Museums','Category:Theatres','Category:Art galleries'],
  },
  {
    id:'tech',label:'Technology',emoji:'💻',
    cats:['Category:Inventions by country','Category:Computing','Category:Aviation','Category:Spacecraft','Category:Rockets','Category:Bridges','Category:Tunnels','Category:Locomotives','Category:Motorcycles','Category:Cameras','Category:Telescopes','Category:Particle accelerators','Category:Nuclear reactors','Category:Radio telescopes','Category:Submarines'],
    valid:/\b(invented|invention|patent|engineer|machine|computer|software|hardware|technology|device|system|design|developed|processor|algorithm|network|digital|electric|mechanical|built|manufactured|aircraft|spacecraft|rocket|engine|motor|circuit|semiconductor|satellite|telescope|bridge|tunnel|locomotive)\b/i,
    vCats:['Category:Airports','Category:Bridges'],
  },
  {
    id:'people',label:'People',emoji:'👤',
    cats:['Category:16th-century scientists','Category:17th-century scientists','Category:18th-century scientists','Category:19th-century scientists','Category:20th-century scientists','Category:Renaissance humanists','Category:Enlightenment philosophers','Category:Explorers of Africa','Category:Explorers of Asia','Category:Explorers of the Americas','Category:Women scientists','Category:Nobel laureates in Physics','Category:Nobel laureates in Chemistry','Category:Nobel laureates in Medicine'],
    valid:/\b(born|died|nationality|known for|notable|scientist|artist|philosopher|explorer|writer|inventor|leader|served as|worked as|educated|studied|mathematician|physician|biologist|chemist|physicist|astronomer|naturalist|theologian|statesman|admiral|general|discoverer)\b/i,
    vCats:[],
  },
  {
    id:'sports',label:'Sports',emoji:'⚽',
    cats:['Category:Athletics (track and field)','Category:Swimming','Category:Gymnastics','Category:Cycling','Category:Rowing','Category:Fencing','Category:Archery','Category:Weightlifting','Category:Wrestling','Category:Judo','Category:Karate','Category:Equestrian sports','Category:Sailing','Category:Shooting sports','Category:Bobsleigh','Category:Skiing','Category:Ice skating'],
    valid:/\b(sport|game|team|player|championship|tournament|league|match|athlete|olympic|medal|race|competition|played|competed|won|defeated|ranked|season|record|event|discipline|gold|silver|bronze|competing|coach|club|federation|world cup|grand prix)\b/i,
    vCats:['Category:Sports venues','Category:Stadiums'],
  },
];

const TOPIC_MAP     = Object.fromEntries(TOPICS.map(t => [t.id, t]));
// Wikivoyage editions large enough for a feed (Arabic and Korean have none,
// Hindi about 200 guides). Matches VOYAGE_LANGS in worker/index.js.
const VOYAGE_LANGS  = new Set(['en','es','fr','de','it','pt','ru','ja','zh','he','nl','pl']);
const VOYAGE_NOTE   = "Wikivoyage isn't available in this language, so travel guides are shown in English.";
// Help Wikipedia: Wikipedia editions with reliable maintenance categories
// (identical to HELP_LANGS in worker/needs.js). Labels follow NEED_ORDER.
const HELP_LANGS    = new Set(['en','de','fr','es']);
const NEED_LABELS   = {sources:'No sources', citations:'Needs citations', unsourced:'Citation needed', outdated:'Needs updating', incomplete:'Needs more detail', stub:'Short article'};
function helpAvailable(lang = curLang) { return HELP_LANGS.has(lang); }
// Help Wikipedia: 'off', 'tags' (label cards), or 'only' (feed of articles that need work).
const HELP_MODES = ['off', 'tags', 'only'];
function helpOnly() { return helpMode === 'only' && helpAvailable(); }
function voyageLang(lang = curLang) { return VOYAGE_LANGS.has(lang) ? lang : 'en'; }
const BAD_TITLE_RE  = /^(list of|lists of|timeline|history of|geography of|demographics|economy of|culture of|politics of|education in|deaths in|events of|index of|outline of|glossary|bibliography|filmography|discography|category:|talk:|wikipedia:)/i;

// ── STATE ──────────────────────────────────────────────────────────────────
let curMode = 'wiki', curLang = 'en';
let curTopics = new Set();
let travelFilters = lsGet('ws_travel_filters') || {place:'',style:''};
let travelOffset=0, travelExhausted=false;
let swipeEnabled = true, kbBarEnabled = true, helpMode = 'off';
let lightMode = false, depthLevel = 3;
let history = [];
let collections = []; // [{name:'Favorites', ids:['w123','w456']}, ...]
let activeCollection = null; // null = show all
let articles = [], liked = new Map(), queue = [];
let filling = false, hinted = false, sentinel = null;
let fillGeneration = 0;

// ── LOCALSTORAGE ───────────────────────────────────────────────────────────
function lsGet(k)    { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

function loadPersistedState() {
  const savedLikes = lsGet('ws_liked');
  if (Array.isArray(savedLikes)) { savedLikes.forEach(a => liked.set(a.id, a)); updateBadge(); }
  // Hydrate from IDB as fallback (e.g. localStorage cleared but IDB survives)
  IDB.getAll().then(items => {
    let changed = false;
    items.forEach(a => { if (!liked.has(a.id)) { liked.set(a.id, a); changed = true; } });
    if (changed) { saveLiked(); updateBadge(); }
  });
  const savedTopics = lsGet('ws_topics');
  // Older versions stored Help Wikipedia as a topic; it is now a setting.
  const helpTopic = Array.isArray(savedTopics) && savedTopics.includes('help');
  if (Array.isArray(savedTopics)) { curTopics = new Set(savedTopics.filter(id => Object.hasOwn(TOPIC_MAP,id))); syncTopicUI(); }
  const settings = lsGet('ws_settings') || {};
  swipeEnabled = settings.swipe !== false;
  kbBarEnabled = settings.kbBar !== false;
  helpMode = helpTopic ? 'only' : HELP_MODES.includes(settings.helpMode) ? settings.helpMode : settings.help === true ? 'tags' : 'off';
  lightMode = settings.lightMode === true;
  depthLevel = settings.depth || 3;
  // Restore language: ?lang= URL param wins, then saved setting
  const urlLang = new URLSearchParams(window.location.search).get('lang');
  const wantLang = urlLang || settings.lang;
  if (wantLang && LANGS.some(l => l.c === wantLang)) curLang = wantLang;
  applyLangUI();
  history = lsGet('ws_history') || [];
  collections = lsGet('ws_collections') || [];
  // Popular and Known no longer use the daily chart; drop its old caches.
  try { Object.keys(localStorage).filter(k => k.startsWith('ws_topchart_')).forEach(k => localStorage.removeItem(k)); } catch {}
  if (helpTopic || typeof settings.help === 'boolean') { saveTopics(); saveSettings(); }
  applyTheme();
  syncAllToggles();
}
function saveLiked()    { lsSet('ws_liked',    [...liked.values()]); }
function saveTopics()   { lsSet('ws_topics',   [...curTopics]); }
function saveSettings() { lsSet('ws_settings', { swipe: swipeEnabled, kbBar: kbBarEnabled, helpMode: helpMode, lightMode: lightMode, depth: depthLevel, lang: curLang }); }
function saveHistory()     { lsSet('ws_history', history.slice(0, 50)); }
function saveCollections() { lsSet('ws_collections', collections); }

// ── INDEXEDDB (offline cache for liked articles) ───────────────────────────
const IDB = (() => {
  let db = null;
  const open = () => new Promise((res, rej) => {
    if (db) return res(db);
    const req = indexedDB.open('wikiscroll', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('articles', {keyPath:'id'});
    req.onsuccess = e => { db = e.target.result; res(db); };
    req.onerror   = () => rej();
  });
  const tx = async (mode, fn) => {
    try { const d = await open(); fn(d.transaction('articles', mode).objectStore('articles')); } catch(e) { console.warn('IDB operation failed:', e); }
  };
  return {
    put:    a  => tx('readwrite', s => s.put(a)),
    delete: id => tx('readwrite', s => s.delete(id)),
    getAll: () => open().then(d => new Promise((res) => {
        const req = d.transaction('articles','readonly').objectStore('articles').getAll();
        req.onsuccess = () => res(req.result || []);
        req.onerror   = () => res([]);
      })).catch(() => []),
  };
})();

// ── HELPERS ────────────────────────────────────────────────────────────────
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function stripHtml(s) { return String(s||'').replace(/<[^>]+>/g,''); }
function toast(msg, ms = 2200) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), ms);
}
function shuffled(items) {
  const values=[...items];
  for(let i=values.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[values[i],values[j]]=[values[j],values[i]];}
  return values;
}

// ── CATEGORY LABELS ───────────────────────────────────────────────────────
// Labels come from Wikipedia's one-line short description ("American
// politician", "species of beetle") or the matching "is a …" phrase from the
// opening sentence. When nothing is conclusive the card keeps the neutral
// Discovery label instead of a wrong guess.
const CATEGORY_RULES = [
  ['biology', /\b(species|breed|subspecies|genus|family of (?:plants|insects|birds|fish|fungi|moths|beetles|snails|flowering plants)|plant|tree|shrub|grass|fungus|fungi|lichen|moss|algae?|bacteri\w*|virus|moth|beetle|butterfly|snail|slug|frog|toad|salamander|fish|shark|bird|mammal|rodent|reptile|lizard|snake|turtle|insect|wasp|spider|crustacean|moll?usc|coral|orchid|flowering plant|organism|protein|gene|enzyme|cultivar)\b/],
  ['sports', /\b(footballer|football|soccer|basketball|baseball|softball|cricketer|cricket|rugby|tennis|golfer|golf|ice hockey|hockey|hurler|hurling|volleyball|handball|olympics?|athlete|sprinter|swimmer|cyclist|boxer|wrestler|martial artist|racing driver|motorsport|racehorse|jockey|runner|judoka|player|sports?|sportsperson|championships?|tournament|league|referee|stadium|racecourse)\b/, /\b(television|tv|film|video game|novel)\b/],
  ['people', /\b(born \d{3,4}|politician|prime minister|president|minister|statesman|attorney|senator|legislator|mayor|governor|civil servant|administrator|official|stateswoman|actor|actress|singer|rapper|musician|composer|conductor|pianist|guitarist|violinist|writer|author|poet|novelist|playwright|screenwriter|journalist|painter|sculptor|artist|illustrator|photographer|architect|scientist|physicist|chemist|biologist|botanist|zoologist|entomologist|mathematician|astronomer|philosopher|historian|economist|sociologist|psychologist|anthropologist|linguist|scholar|academic|professor|engineer|inventor|explorer|bishop|archbishop|prelate|priest|cardinal|pope|rabbi|imam|monk|nun|saint|missionary|theologian|king|queen|emperor|empress|prince|princess|duke|duchess|countess|earl|baron|baroness|monarch|pharaoh|sultan|nobleman|noblewoman|aristocrat|general(?! (?:election|assembly|hospital|store|secretary|manager))|admiral|officer|soldier|judge|lawyer|jurist|diplomat|activist|businessman|businesswoman|businessperson|entrepreneur|executive|director|producer|comedian|fashion model|dancer|chef|physician|surgeon|nurse|teacher|educator|presenter|broadcaster|youtuber|socialite|spy|pirate|person)\b/],
  ['music', /\b(album|song|single|ep by|extended play|mixtape|soundtrack|band|musical group|orchestra|choir|opera|operetta|symphony|concerto|sonata|string quartet|musical instrument|record label|music festival|musical composition|hymn|anthem|discography|music genre|genre of music|musical genre)\b/],
  ['arts', /\b(film|movie|documentary|television|tv series|tv program|tv programme|sitcom|miniseries|telenovela|web series|soap opera|talk show|game show|novel|novella|book|short story|poem|poetry|play|stage play|musical|painting|sculpture|fresco|mosaic|comic|comics|webcomic|manga|anime|video game|artwork|mural|literary|magazine|periodical|newspaper|art museum|museum|art gallery|gallery|theatre|theater|ballet|dance|art movement)\b/],
  ['space', /\b(star|galaxy|galaxies|asteroid|minor planet|comet|exoplanet|nebula|constellation|moon of|natural satellite|dwarf planet|planet|crater|spacecraft|space probe|space telescope|space station|space mission|observatory|telescope|astronomical|meteorite|meteor shower)\b/],
  ['food', /\b(dish|dishes|cuisine|food|foods|beverage|drink|cocktail|liqueur|beer|wine|brewery|winery|distillery|cheese|bread|soup|stew|dessert|pastry|cake|cookie|biscuit|sauce|condiment|spice|restaurant|pub|bar|saloon|tavern|café|cafe|snack|confectionery|candy|noodles?|dumplings?|sausage|salad)\b/],
  ['architecture', /\b(building|church|cathedral|basilica|chapel|mosque|temple|synagogue|shrine|monastery|abbey|priory|convent|castle|palace|fort|fortress|citadel|tower|bridge|viaduct|skyscraper|house|mansion|manor|villa|lighthouse|windmill|watermill|mill|dam|historic district|architectural|mausoleum|monument|memorial|courthouse|city hall|town hall|hotel)\b/],
  ['history', /\b(battle|war|siege|uprising|revolt|rebellion|revolution|coup|treaty|dynasty|empire|(?<!united )kingdom|caliphate|military unit|regiment|battalion|brigade|(?:infantry|army|armou?red|airborne|cavalry|military) division|army|navy|air force|squadron|fleet|historical|ancient|medieval|archaeological|massacre|expedition)\b/],
  ['geo', /\b(city|town|village|hamlet|municipality|commune|parish|county|district|region|province|prefecture|canton|state of|census-designated place|unincorporated community|neighbou?rhood|suburb|locality|settlement|island|islands|archipelago|atoll|river|tributary|stream|creek|lake|lagoon|mountain|mountain range|peak|hill|volcano|glacier|valley|canyon|gorge|desert|cave|bay|gulf|strait|peninsula|cape|national park|protected area|nature reserve|forest|waterfall|beach|reservoir|country|capital|road|highway|state route|motorway|street)\b/],
  ['tech', /\b(software|computer|programming language|operating system|website|web browser|mobile app|smartphone|electronic|device|aircraft|airliner|helicopter|glider|drone|locomotive|railway station|train station|metro station|station|bus route|bus|train|tram|automobile|car|motorcycle|vehicle|truck|engine|ship|boat|submarine|warship|cutter|frigate|destroyer|rocket|missile|weapon|firearm|rifle|pistol|knife|tool|machine|robot|technology|semiconductor|microprocessor|protocol|algorithm|file format|codec|satellite|camera)\b/],
  ['science', /\b(chemical|compound|molecule|molecular formula|element|isotope|mineral|disease|disorder|syndrome|infection|medical|medicine|drug|medication|surgery|surgical|dentistry|anatomy|anatomical|theorem|conjecture|equation|mathematical|mathematics|physics|chemistry|scientific|phenomenon|biology|ecology|geology|geological|particle|hypothesis|field of study|academic discipline|branch of)\b/],
];
function categoryPhrase(a) {
  if (typeof a?.desc === 'string' && a.desc.trim()) return a.desc.trim().slice(0, 160);
  const first = String(a?.body || '').replace(/\([^()]*\)/g, ' ').replace(/\s+/g, ' ').split(/(?<=[.!?])\s/)[0] || '';
  const match = first.match(/\b(?:is|was|are|were)\s+(?:(?:a|an|the|one of the|one of several|any of several)\s+)?([^.;:]{3,140})/i);
  // Keep the head phrase ("an American attorney"), not later clauses such as
  // "a village where the poet was born".
  return match ? match[1].split(/,|\b(?:who|which|that|where|whose|known|located|situated|founded|named|born in)\b/i)[0] : '';
}
// The head noun decides: "1996 single by a singer" is music and "American film
// director" is a person. Within the head phrase the right-most match wins;
// rule order breaks ties and covers phrases without a recognized head.
function lastMatchEnd(rule, text) {
  const pattern = new RegExp(rule.source, 'g');
  let match, end = -1;
  while ((match = pattern.exec(text))) { end = match.index + match[0].length; if (!match[0]) pattern.lastIndex++; }
  return end;
}
function detectCategory(a) {
  const raw = categoryPhrase(a).toLowerCase();
  if (!raw || /^topics referred to by the same term|may refer to/.test(raw)) return null;
  const phrase = raw.replace(/\([^()]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const head = phrase.split(/\s(?:by|of|in|from|for|on|at|with|to|and|near|based|who|which|that)\s|[,;]/)[0];
  const rules = CATEGORY_RULES.filter(([, , exclude]) => !(exclude && exclude.test(phrase)));
  let best = null, bestEnd = -1;
  for (const [id, match] of rules) { const end = lastMatchEnd(match, head); if (end > bestEnd) { best = id; bestEnd = end; } }
  if (!best) for (const [id, match] of rules) if (match.test(phrase)) { best = id; break; }
  if (!best && /\(\d{3,4}\s*[–-]|\(born \d{4}\)/.test(raw)) best = 'people';
  return best ? TOPIC_MAP[best] || null : null;
}

// ── READING ACTIVITY ─────────────────────────────────────────────────
function todayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function loadStats(mode = curMode) {
  const s=lsGet('ws_stats_'+mode)||{date:'',count:0};
  const today=todayKey();
  if(s.date!==today){
    s.date=today;s.count=0;lsSet('ws_stats_'+mode,s);
  }
  return s;
}
function bumpStat(mode = curMode) {
  const s=loadStats(mode);
  s.count++;lsSet('ws_stats_'+mode,{date:s.date,count:s.count});
  const today=todayKey(),wk=lsGet('ws_weekly_'+mode)||{};
  wk[today]=(wk[today]||0)+1;
  const cutoff=new Date();cutoff.setDate(cutoff.getDate()-14);
  for(const key of Object.keys(wk))if(key<todayKey(cutoff))delete wk[key];
  lsSet('ws_weekly_'+mode,wk);syncActivityDisplay();
}
function renderWeekHeatmap(containerId) {
  const el=document.getElementById(containerId);if(!el)return;
  const wk=lsGet('ws_weekly_'+curMode)||{};
  const days=['M','T','W','T','F','S','S'];
  const today=new Date(),todayStr=todayKey(today),monday=new Date(today);
  monday.setHours(12,0,0,0);monday.setDate(monday.getDate()-(monday.getDay()+6)%7);
  el.innerHTML=days.map((label,i)=>{
    const date=new Date(monday);date.setDate(monday.getDate()+i);
    const key=todayKey(date),count=wk[key]||0;
    const level=count===0?'':count<=3?'lvl-1':count<=8?'lvl-2':count<=20?'lvl-3':'lvl-4';
    const description=`${date.toLocaleDateString(curLang,{weekday:'long',month:'short',day:'numeric'})}: ${count} articles`;
    return `<div class="week-day${key>todayStr?' future':''}" data-date="${key}" title="${description}">
      <div ${key===todayStr?'aria-current="date"':''} class="week-day-cell ${level}${key===todayStr?' today':''}" role="img" aria-label="${description}"></div>
      <div class="week-day-lbl">${curLang==='en'?label:date.toLocaleDateString(curLang,{weekday:'narrow'})}</div><div class="week-day-cnt">${count||'&nbsp;'}</div>
      <div class="week-day-today">${key===todayStr?new Intl.RelativeTimeFormat(curLang,{numeric:'auto'}).format(0,'day'):'&nbsp;'}</div>
    </div>`;
  }).join('');
}
function syncActivityDisplay() {
  document.querySelectorAll('.stats-source').forEach(el => el.textContent = curMode === 'how' ? 'Wikivoyage · destinations explored' : 'Wikipedia · articles explored');
  const s = loadStats();
  ['streakCount','dkStreakCount'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = s.count;
  });
  // Grammatical number follows the reader's language (Russian and Polish have a "few" form).
  let form = 'other'; try { form = new Intl.PluralRules(curLang).select(s.count); } catch {}
  const unit = form === 'one' ? 'article today' : form === 'few' && window.WS_TRANSLATIONS?.[curLang]?.['articles today (few)'] ? 'articles today (few)' : 'articles today';
  document.querySelectorAll('.streak-unit').forEach(el => { el.textContent = unit; });
  // Weekly heatmap
  renderWeekHeatmap('weekHeatmap');
  renderWeekHeatmap('dkWeekHeatmap');
}

// ── THEME ──────────────────────────────────────────────────────────────────
function applyTheme() {
  document.body.classList.toggle('light', lightMode);
}

// ── HISTORY TRACKING ──────────────────────────────────────────────────────
function trackHistory(a) {
  // Remove duplicate if exists
  history = history.filter(h => h.id !== a.id);
  history.unshift({ id:a.id, src:a.src, title:a.title, body:a.body?.slice(0,150)||'', url:a.url, img:a.img||'', time:Date.now() });
  if (history.length > 50) history.length = 50;
  saveHistory();
}
function renderHistory() {
  const c = document.getElementById('historyList');
  if (!history.length) {
    c.innerHTML = '<div class="empty"><div class="empty-ico">📜</div><div class="empty-ttl">No history yet</div><div class="empty-txt">Articles you view will appear here so you can find them again.</div></div>';
    return;
  }
  const now = Date.now();
  c.innerHTML = history.map(h => {
    const image = h.img || liked.get(h.id)?.img || articles.find(a => a.id === h.id)?.img || '';
    const ago = now - h.time;
    // Localized by the browser ("5 min ago", "hace 3 h", "vor 2 Tagen").
    let timeStr = 'Just now';
    if (ago >= 60000) {
      const [value, unit] = ago < 3600000 ? [Math.floor(ago/60000), 'minute'] : ago < 86400000 ? [Math.floor(ago/3600000), 'hour'] : [Math.floor(ago/86400000), 'day'];
      try { timeStr = new Intl.RelativeTimeFormat(curLang, {numeric: 'auto', style: 'short'}).format(-value, unit); } catch { timeStr = value + unit[0] + ' ago'; }
    }
    return `<button type="button" class="hi" data-url="${esc(h.url)}">
      ${image && /^https:\/\//i.test(image) ? `<span class="saved-image"><img src="${esc(image)}" alt="" loading="lazy" decoding="async" onerror="this.parentElement.remove()"></span>` : ''}
      <div class="hi-time">${h.src==='wiki'?'📖':'🗺️'} ${timeStr}</div>
      <div class="hi-ttl">${esc(h.title)}</div>
      <span class="history-read">${atlasIcon.arrow}<span>Read</span></span>
    </button>`;
  }).join('');
}

// ── COLLECTIONS ────────────────────────────────────────────────────────────
function renderCollTabs() {
  const c = document.getElementById('collTabs');
  const tabs = [{name:'All',id:null}].concat(collections.map((col,i) => ({name:col.name,id:i})));
  c.innerHTML = tabs.map(t => `<button class="coll-tab${activeCollection===t.id?' on':''}" data-cid="${t.id}">${esc(t.name)}${t.id!==null?' ('+collections[t.id].ids.length+')':''}</button>`).join('');
}
function createCollection(name) {
  name = name.trim();
  if (!name || collections.some(c => c.name.toLowerCase()===name.toLowerCase())) return;
  collections.push({name, ids:[]});
  saveCollections();
  renderLikedList();
  toast('📁 Collection "'+name+'" created');
}
function addToCollection(colIdx, articleId) {
  const col = collections[colIdx];
  if (!col || col.ids.includes(articleId)) return;
  col.ids.push(articleId);
  saveCollections();
  renderLikedList();
  toast('Added to "'+col.name+'"');
}
function deleteCollection(colIdx) {
  collections.splice(colIdx, 1);
  activeCollection = null;
  saveCollections();
  renderCollTabs();
  renderLikedList();
  toast('Collection deleted');
}

// ── DEPTH ENGINE ──────────────────────────────────────────────────────────
// Depth is never excerpt length.
//   1 Popular / 2 Known: the Worker samples Wikipedia's vital articles
//     (Level 3, about 1,000 essential topics / Level 4, about 9,000 more).
//   3-5: random articles by average daily views over 14 days:
//     3 Balanced ≥10/day · 4 Niche 2-30/day · 5 Obscure ≤2/day (English;
//     smaller editions are scaled by VIEW_SCALE).
//   Wikimedia returns views for only five pages per request, so every
//   sampler completes the rest (see worker/pageviews.js).
const MIN_EXTRACT = 80; // readability floor only — no longer the depth proxy
// Identical to worker/pageviews.js VIEW_SCALE (checked by the test suite).
const VIEW_SCALE = {en:1, ja:1, ru:0.6, de:0.5, he:0.4, fr:0.3, it:0.25, pt:0.25, es:0.25, pl:0.2, zh:0.2, ko:0.2, hi:0.15, ar:0.15, nl:0.1};
const DEPTH_LABELS = {1:'Popular', 2:'Known', 3:'Balanced', 4:'Niche', 5:'Obscure'};

// Mirrors worker/pageviews.js: a null day inside the window is a zero-view
// day, days null for every page are publication lag, and a page with no
// counted day stays unknown.
function viewLag(pages) {
  const days = new Set(), live = new Set();
  for (const p of pages) for (const [day, v] of Object.entries(p?.pageviews || {})) {
    days.add(day); if (typeof v === 'number' && Number.isFinite(v) && v >= 0) live.add(day);
  }
  return new Set([...days].filter(day => !live.has(day)));
}
function avgDailyViews(p, lag = new Set()) {
  const pv = p?.pageviews;
  if (!pv || typeof pv !== 'object') return null;
  let sum = 0, days = 0, known = false;
  for (const [day, v] of Object.entries(pv)) {
    if (lag.has(day)) continue;
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) { sum += v; days++; known = true; }
    else if (v === null) days++;
  }
  return known && days ? sum / days : null;
}

// Browser fallback when the Worker is unreachable: random sampling within a
// pageview band (levels 1-2 use their view floors here).
function selectDepthPages(pages,depth,lang='en') {
  const lag=viewLag(pages),views=new Map(pages.map(p=>[p.pageid,avgDailyViews(p,lag)]));
  const known=pages.filter(p=>views.get(p.pageid)!==null);
  // Missing pageviews cannot establish obscurity, but still provide a last-resort readable card.
  if(!known.length)return shuffled(pages).slice(0,3);
  const scale=VIEW_SCALE[lang]??1;
  const bounds=(depth===5?[0,2]:depth===4?[2,30]:depth===2?[100,300]:[depth===1?300:10,Infinity]).map(v=>v*scale);
  const eligible=shuffled(known.filter(p=>views.get(p.pageid)>=bounds[0]&&views.get(p.pageid)<=bounds[1]));
  if(eligible.length>=5)return eligible.slice(0,20);
  const selected=new Set(eligible.map(p=>p.pageid));
  const distance=p=>{const n=views.get(p.pageid);return n<bounds[0]?bounds[0]-n:Math.max(0,n-bounds[1]);};
  const fallback=shuffled(known.filter(p=>!selected.has(p.pageid))).sort((a,b)=>distance(a)-distance(b)).slice(0,Math.min(3,5-eligible.length));
  return shuffled([...eligible,...fallback]).slice(0,20);
}
async function fetchWikiRandom() {
  const requestGen=fillGeneration,lang=curLang,api=`https://${lang}.wikipedia.org/w/api.php?action=query&format=json&origin=*`;
  const data=await fetchOne(api+'&generator=random&grnnamespace=0&grnlimit=20&prop=pageviews%7Cextracts%7Cpageimages%7Cdescription&pvipdays=14&exintro=1&exchars=800&explaintext=1&exlimit=max&piprop=thumbnail&pithumbsize=640&pilimit=max');
  if(requestGen!==fillGeneration||!data?.query?.pages)return [];
  const renderable=Object.values(data.query.pages).filter(p=>p?.thumbnail?.source&&isValidTitle(p.title)&&stripHtml(p.extract||'').length>=MIN_EXTRACT&&!/^topics referred to by the same term$/i.test(p.description||''));
  // Views arrive for only five pages per request; complete up to ten more.
  const missing=renderable.filter(p=>!p.pageviews).slice(0,10);
  await Promise.all(Array.from({length:Math.ceil(missing.length/5)},async(_,i)=>{
    const chunk=missing.slice(i*5,i*5+5);
    const views=await fetchOne(api+'&prop=pageviews&pvipdays=14&pageids='+chunk.map(p=>p.pageid).join('%7C'));
    for(const p of chunk){const v=views?.query?.pages?.[p.pageid]?.pageviews;if(v&&typeof v==='object')p.pageviews=v;}
  }));
  if(requestGen!==fillGeneration)return [];
  return selectDepthPages(renderable,depthLevel,lang).map(p=>wikiPageToArticle(p,lang));
}

// ── OFFLINE DETECTION ─────────────────────────────────────────────────────
function updateOfflineBanner() {
  document.getElementById('offlineBanner')?.classList.toggle('show', !navigator.onLine);
}
window.addEventListener('online', updateOfflineBanner);
window.addEventListener('offline', updateOfflineBanner);

// ── SERVICE WORKER ────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js', {scope:'/'}).catch(error => console.warn('Offline cache unavailable', error));
}

// ── NETWORK ────────────────────────────────────────────────────────────────
// Rate-limit awareness: when Wikimedia answers 429, ALL API calls pause for
// the cooldown window instead of piling on and extending the block. Retries
// during cooldown resolve instantly to null, so the supply watchdog keeps
// backing off cheaply until the window clears.
let apiCooldownUntil = 0;
let fillBudget = null;
function fetchOne(url) {
  if (Date.now() < apiCooldownUntil) return Promise.resolve(null);
  if (fillBudget) { if (fillBudget.remaining <= 0) return Promise.resolve(null); fillBudget.remaining--; }
  const requestGen=fillGeneration;
  const ac = new AbortController(), id = setTimeout(() => ac.abort(), 6000);
  supplyControllers.add(ac);
  return fetch(url, {signal:ac.signal}).then(r => {
    if(requestGen!==fillGeneration)return null;
    if (r.status === 429) {
      const value = r.headers.get('Retry-After') || '';
      const delay = /^\d+(\.\d+)?$/.test(value) ? Number(value)*1000 : Date.parse(value)-Date.now();
      apiCooldownUntil = Date.now() + (Number.isFinite(delay) ? Math.max(1000,delay) : 30000);
      return null;
    }
    return r.ok ? r.json() : null;
  }).catch(() => null).finally(() => {clearTimeout(id);supplyControllers.delete(ac);});
}

// ── ARTICLE VALIDATORS ────────────────────────────────────────────────────
function isValidTitle(t) { return t && !BAD_TITLE_RE.test(t.trim()); }
function wikiPageToArticle(p, lang='en') {
  const desc = typeof p.description === 'string' ? stripHtml(p.description).slice(0,160) : '';
  return { id:'w'+p.pageid, src:'wiki', title:p.title, body:stripHtml(p.extract||''), img:p.thumbnail.source, url:`https://${lang}.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g,'_'))}`, ...(desc ? {desc} : {}) };
}

// ── FETCH FUNCTIONS ────────────────────────────────────────────────────────
async function fetchWiki() {
  // Direct fallback only: the Worker normally supplies every depth.
  return fetchWikiRandom();
}

async function fetchWikiByTopic() {
  return fetchWorkerBatch(fillGeneration);
}

async function fetchVoyage() {
  const requestGen=fillGeneration;
  if (travelFilters.place || travelFilters.style) return fetchFilteredTravel();
  const langs = [voyageLang()];
  for (const lang of langs) {
    // Random fallback — ONE Action API call for 20 candidates. The previous
    // REST approach fired 16 parallel requests per call (up to 80 per fill),
    // which tripped Wikimedia's per-IP rate limiting and killed the feed.
    const url = [`https://${lang}.wikivoyage.org/w/api.php`,'?action=query','&generator=random','&grnnamespace=0','&grnlimit=20','&prop=extracts%7Cpageimages','&exintro=1','&exchars=600','&explaintext=1','&exlimit=max','&piprop=thumbnail','&pithumbsize=640','&pilimit=max','&format=json','&origin=*'].join('');
    const data = await fetchOne(url);
    if(requestGen!==fillGeneration)return [];
    if (data?.query?.pages) {
      const good = Object.values(data.query.pages).filter(p => {
        if (!Number.isSafeInteger(p.pageid) || p.pageid<1 || !isValidTitle(p.title)) return false;
        const s = stripHtml(p.extract||'').slice(0,500);
        return s.length >= 40 && !/^(phrasebooks?|travel topics?|itineraries)(?:[ :/]|$)/i.test(p.title);
      }).slice(0,20).map(p => ({
        id:'v'+p.pageid, src:'how', title:p.title, body:stripHtml(p.extract||''), img:p.thumbnail?.source||'',
        url:`https://${lang}.wikivoyage.org/wiki/${encodeURIComponent(p.title.replace(/ /g,'_'))}`,
      }));
      if (good.length) return good;
    }
  }
  return [];
}

// ── PREFETCH QUEUE ─────────────────────────────────────────────────────────
// Data reserve is deliberately much larger than the rendered window.
const QUEUE_MIN = 60, QUEUE_TARGET = 100, CARDS_AHEAD = 16;
let supplyTask = null, reserveTimer = null, pendingDeepGeneration = -1;
let workerBatch = Math.floor(Math.random()*64), workerCooldownUntil = 0;
const supplyControllers = new Set(), feedSeen = new Set();
const _imgCache = new Map();
function preloadImg(url) {
  if (!url || _imgCache.has(url)) return;
  const img = new Image(); img.decoding='async'; img.src=url;
  _imgCache.set(url,img);
  if (_imgCache.size>100) _imgCache.delete(_imgCache.keys().next().value);
}
function preloadQueueImages() { queue.slice(0,24).forEach(a=>preloadImg(a.img)); }
function feedContextKey() {
  return ['topics-v4',curMode,curLang,curMode==='wiki'?depthLevel:3,curMode==='wiki'?[...curTopics,...(helpOnly()?['help']:[])].sort().join(','):'',curMode==='how'?JSON.stringify(travelFilters):''].join('|');
}
function validReserveArticle(a) {
  return a && /^[wv][1-9]\d{0,11}$/.test(a.id) && typeof a.title==='string' && typeof a.body==='string' && a.body.length>30 && /^https:\/\//.test(a.url||'') && (!a.img || /^https:\/\//.test(a.img));
}
function persistFeedReserve() {
  clearTimeout(reserveTimer);
  const key=feedContextKey(),gen=fillGeneration;
  reserveTimer=setTimeout(()=>{
    if(gen!==fillGeneration)return;
    const feed=document.getElementById('feed');
    const current=getCurrentFeedCard();
    const nodes=Array.from(feed.querySelectorAll('.card[data-id]'));
    const start=Math.max(0,nodes.indexOf(current));
    const ids=new Set(nodes.slice(start).map(c=>c.dataset.id));
    const remaining=[...articles.filter(a=>ids.has(a.id)),...queue].slice(0,160);
    const stored=lsGet('ws_feed_reserves')||{};
    stored[key]={at:Date.now(),items:remaining};
    const kept=Object.fromEntries(Object.entries(stored).sort((a,b)=>b[1].at-a[1].at).slice(0,4));
    lsSet('ws_feed_reserves',kept);
  },200);
}
function restoreFeedReserve() {
  const saved=lsGet('ws_feed_reserves')?.[feedContextKey()];
  return saved && Date.now()-saved.at<7*864e5 && Array.isArray(saved.items) ? saved.items.filter(validReserveArticle) : [];
}
function acceptSupply(batch,gen,randomize=true) {
  if(gen!==fillGeneration)return 0;
  let added=0;
  for(const a of randomize?shuffled(batch||[]):batch||[]) {
    if(!validReserveArticle(a)||feedSeen.has(a.id))continue;
    feedSeen.add(a.id);queue.push(a);added++;
  }
  if(added){refillAttempts=0;preloadQueueImages();persistFeedReserve();}
  return added;
}
let starterPromise;
function loadStarterLibrary(gen) {
  // Never silently replace language, topic, or destination choices with English random cards.
  if((curMode==='how'?voyageLang():curLang)!=='en'||curMode==='wiki'&&(curTopics.size||helpOnly()||depthLevel!==3)||curMode==='how'&&(travelFilters.place||travelFilters.style))return Promise.resolve();
  const mode=curMode;
  starterPromise ||= (async()=>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4000);
    try {const response=await fetch('/data/starter-en.json',{signal:controller.signal});return response.ok?await response.json():null;}
    catch {return null;} finally {clearTimeout(timer);}
  })();
  return starterPromise.then(data=>{
    if(!data){starterPromise=null;return;}
    if(gen!==fillGeneration)return;
    const items=shuffled(data[mode]||[]);
    acceptSupply(items,gen);ensureFeedAhead();
  });
}
async function fetchWorkerBatch(gen) {
  if(Date.now()<workerCooldownUntil)return [];
  const controller=new AbortController();supplyControllers.add(controller);
  const subjects=curMode==='wiki'?[...curTopics]:[];
  const help=curMode==='wiki'&&helpOnly();
  const topical=subjects.length>0||help;
  const timer=setTimeout(()=>controller.abort(),topical?28000:7500);
  const params=new URLSearchParams({mode:curMode,lang:curMode==='how'?voyageLang():curLang,n:'40',depth:String(curMode==='wiki'?depthLevel:3),batch:String(workerBatch++%64)});
  // "Only these articles" alone samples maintenance lists; with topics it narrows them.
  if(subjects.length){params.set('topic',subjects[(workerBatch-1)%subjects.length]);if(help)params.set('help','1');}
  else if(help)params.set('topic','help');
  try {
    const response=await fetch((topical?'/api/topics?':'/api/articles?')+params,{signal:controller.signal,cache:'no-store'});
    if(gen!==fillGeneration)return [];
    if(!response.ok){
      if(response.status===429||response.status===503){
        const seconds=Number(response.headers.get('Retry-After'));
        workerCooldownUntil=Date.now()+Math.min(60000,Math.max(2000,Number.isFinite(seconds)?seconds*1000:3000));
      }
      return [];
    }
    const data=await response.json();return Array.isArray(data.articles)?data.articles:[];
  } catch {return [];} finally {clearTimeout(timer);supplyControllers.delete(controller);}
}
function fillQueue() {
  const gen=fillGeneration;
  if(supplyTask?.gen===gen)return supplyTask.promise;
  if(queue.length>=QUEUE_TARGET)return Promise.resolve();
  filling=true;
  const task={gen,promise:null};supplyTask=task;
  task.promise=(async()=>{
    const budget={remaining:5};fillBudget=budget;
    const topical=curMode==='wiki'&&(curTopics.size>0||helpOnly());
    const useWorker=curMode==='how' ? !travelFilters.place&&!travelFilters.style : !topical;
    const direct=curMode==='wiki'?(topical?fetchWikiByTopic:fetchWiki):fetchVoyage;
    let requests=0;
    try {
      while(gen===fillGeneration&&queue.length<QUEUE_TARGET&&requests++<5){
        let added=0;
        if(useWorker)added=acceptSupply(await fetchWorkerBatch(gen),gen);
        if(gen!==fillGeneration)return;
        if(!added&&budget.remaining>0&&Date.now()>=apiCooldownUntil)added=acceptSupply(await direct(),gen,!topical);
        if(gen!==fillGeneration)return;
        // Render each successful batch immediately, not after a chain of API calls.
        ensureFeedAhead();
        if(!added)break;
      }
    } finally {
      if(fillBudget===budget)fillBudget=null;
      if(supplyTask===task){supplyTask=null;filling=false;}
      if(gen===fillGeneration&&queue.length<QUEUE_MIN)scheduleRefill();
    }
  })();
  return task.promise;
}

let refillTimer=null,refillAttempts=0;
function scheduleRefill() {
  if(curMode==='how'&&(travelFilters.place||travelFilters.style)&&travelExhausted)return;
  if(refillTimer||!navigator.onLine||document.hidden)return;
  const gen=fillGeneration;
  const delay=Math.max(350,Math.min(10000,700*Math.pow(1.6,refillAttempts++)));
  refillTimer=setTimeout(async()=>{
    refillTimer=null;if(gen!==fillGeneration)return;
    await fillQueue();if(gen!==fillGeneration)return;
    ensureFeedAhead();
    if(queue.length<QUEUE_MIN)scheduleRefill();
  },delay);
}
window.addEventListener('online',()=>{refillAttempts=0;workerCooldownUntil=0;apiCooldownUntil=0;fillQueue();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){ensureFeedAhead();fillQueue();}});
function flushQueue(n=8) {
  const batch=withTodaySurprises(queue.splice(0,n));
  if(batch.length){
    document.getElementById('spinner')?.remove();
    document.querySelectorAll('#feed .err').forEach(e=>e.closest('.card')?.remove());
    articles.push(...batch);batch.forEach(renderCard);
    if(!hinted&&articles.length>=2){hinted=true;window.WSDiscoveryHint?.show();}
    persistFeedReserve();
  }
  preloadQueueImages();
  return batch.length;
}
function ensureFeedAhead() {
  if(pendingDeepGeneration===fillGeneration)return;
  const feed=document.getElementById('feed');
  const cards=Array.from(feed.querySelectorAll('.card[data-id]'));
  const current=getCurrentFeedCard();
  const ahead=cards.length-Math.max(0,cards.indexOf(current))-1;
  if(ahead<CARDS_AHEAD&&queue.length)flushQueue(Math.min(queue.length,CARDS_AHEAD-ahead));
  if(queue.length<QUEUE_MIN&&!supplyTask)scheduleRefill();
  persistFeedReserve();
}
function attachSentinel() { ensureFeedAhead(); }
// Look ahead on every scroll, including trackpad flings that leap over observers.
let supplyScrollFrame=0;
document.getElementById('feed').addEventListener('scroll',()=>{
  if(supplyScrollFrame)return;
  supplyScrollFrame=requestAnimationFrame(()=>{supplyScrollFrame=0;ensureFeedAhead();});
},{passive:true});

// ── FEED GEOMETRY / DOM PRUNING ─────────────────────────────────────────────
// Use card layout positions, not window.innerHeight: mobile browser chrome
// can change viewport height while scrolling, and the feed may be offset.
let feedMotionLocked = false;
function feedCardTop(card) {
  const feed = document.getElementById('feed');
  const layoutTop = el => { let top = 0; for (let node = el; node; node = node.offsetParent) top += node.offsetTop || 0; return top; };
  return layoutTop(card) - layoutTop(feed);
}
function getCurrentFeedCard() {
  const feed = document.getElementById('feed');
  let nearest = null, distance = Infinity;
  for (const card of feed.querySelectorAll('.card[data-id]')) {
    const delta = Math.abs(feedCardTop(card) - feed.scrollTop);
    if (delta < distance) { nearest = card; distance = delta; }
  }
  return nearest;
}
function pruneOldCards() {
  if (feedMotionLocked) return;
  const feed = document.getElementById('feed');
  const cards = Array.from(feed.querySelectorAll('.card[data-id]'));
  const anchor = getCurrentFeedCard();
  const removeCount = Math.max(0, cards.indexOf(anchor) - 12);
  if (!anchor || !removeCount) return;
  const anchorOffset = feedCardTop(anchor) - feed.scrollTop;
  const oldAnchor = feed.style.overflowAnchor, oldSnap = feed.style.scrollSnapType;
  feed.style.overflowAnchor = 'none';
  feed.style.scrollSnapType = 'none';
  cards.slice(0, removeCount).forEach(card => card.remove());
  // Retire full article payloads with their DOM cards. Saved articles and the
  // lightweight seen IDs have their own stores, so long sessions stay fast
  // without allowing previously seen cards back into the supply.
  const retainedIds = new Set(cards.slice(removeCount).map(card => card.dataset.id));
  articles = articles.filter(article => retainedIds.has(article.id));
  // Preserve the exact visible card, regardless of native scroll anchoring.
  feed.scrollTop = feedCardTop(anchor) - anchorOffset;
  feed.style.overflowAnchor = oldAnchor;
  feed.style.scrollSnapType = oldSnap;
  attachSentinel();
}
let pruneTimer = null;
document.getElementById('feed').addEventListener('scroll', () => {
  clearTimeout(pruneTimer);
  pruneTimer = setTimeout(pruneOldCards, 400);
}, {passive:true});

// ── BOOT ───────────────────────────────────────────────────────────────────
async function resolveDeepLink() {
  // Check for ?a=w12345 or ?a=v12345 deep link
  const params = new URLSearchParams(window.location.search);
  const aid = params.get('a');
  if (!aid) return null;
  // Clean URL without reloading
  try { window.history.replaceState({}, '', window.location.pathname); } catch {}
  if (!/^[wv][1-9]\d{0,11}$/.test(aid)) return null;
  // Links without ?lang= were shared from English Wikipedia. Resolving the id
  // in the reader's own language would open an unrelated page.
  const requested = params.get('lang');
  const lang = LANGS.some(l => l.c === requested) ? requested : 'en';
  const prefix = aid[0], pageid = Number(aid.slice(1));
  const domain = `${lang}.${prefix === 'w' ? 'wikipedia' : 'wikivoyage'}.org`;
  try {
    // Direct request: a shared article must not spend the feed's request budget.
    const response = await fetch(`https://${domain}/w/api.php?action=query&format=json&origin=*&pageids=${pageid}&prop=extracts%7Cpageimages%7Cinfo%7Cdescription&exintro=1&explaintext=1&piprop=thumbnail&pithumbsize=800&inprop=url`, {signal: AbortSignal.timeout(8000)});
    if (!response.ok) return null;
    const p = (await response.json())?.query?.pages?.[pageid];
    // Only real articles: never a talk, user or project page with the same id.
    if (!p || p.missing !== undefined || p.ns !== 0 || p.pageid !== pageid) return null;
    const desc = typeof p.description === 'string' ? stripHtml(p.description).slice(0,160) : '';
    const art = {
      id: aid, src: prefix === 'w' ? 'wiki' : 'how', title: p.title, body: stripHtml(p.extract || ''),
      img: p.thumbnail?.source || '',
      url: p.fullurl || `https://${domain}/wiki/${encodeURIComponent(p.title.replace(/ /g,'_'))}`,
      ...(desc ? {desc} : {}),
    };
    if (art.body.length < 30) return null;
    toast(`📎 Opened shared article`);
    return art;
  } catch (e) {
    console.warn('Deep link resolve failed:', e);
    return null;
  }
}

async function boot() {
  const gen=fillGeneration;
  const deepRequested=new URLSearchParams(location.search).has('a');
  if(deepRequested)pendingDeepGeneration=gen;
  // A previous on-device reserve makes reloads independent of Wikimedia latency.
  if(!deepRequested){acceptSupply(restoreFeedReserve(),gen,false);ensureFeedAhead();}
  const starter=deepRequested?Promise.resolve():loadStarterLibrary(gen);
  const supply=fillQueue();
  try {
    if(deepRequested){
      const deepArt=await resolveDeepLink();
      if(gen!==fillGeneration)return;
      pendingDeepGeneration=-1;
      if(deepArt&&!articles.some(a=>a.id===deepArt.id)){
        queue=queue.filter(a=>a.id!==deepArt.id);feedSeen.add(deepArt.id);
        document.getElementById('spinner')?.remove();articles.unshift(deepArt);renderCard(deepArt);
      }
    }
    await Promise.all([starter,supply]);
    if(gen!==fillGeneration)return;
    ensureFeedAhead();
    if(!articles.length){document.getElementById('spinner')?.remove();showError();scheduleRefill();}
  } catch(error) {
    if(gen!==fillGeneration)return;
    console.warn('Feed recovery',error);
    pendingDeepGeneration=-1;
    if(!articles.length){document.getElementById('spinner')?.remove();showError();}
    scheduleRefill();
  }
}
function resetFeed() {
  window.dispatchEvent(new Event('feed-reset'));
  travelOffset=0;travelExhausted=false;sentinel?.disconnect();
  fillGeneration++;pendingDeepGeneration=-1;
  supplyControllers.forEach(controller=>controller.abort());
  articles=[];queue=[];feedSeen.clear();filling=false;supplyTask=null;
  clearTimeout(refillTimer);refillTimer=null;refillAttempts=0;clearTimeout(reserveTimer);
  window.WSDiscoveryHint?.hide();
  const feed=document.getElementById('feed');
  feed.innerHTML=`<div class="spin-wrap" id="spinner"><div class="spin${curMode==='how'?' h':''}"></div><div class="spin-lbl">${curMode==='how'?'Loading destinations…':'Loading articles…'}</div></div>`;
  feed.scrollTop=0;boot();
}

// ── PULL TO REFRESH ──────────────────────────────────────────────────────
{
  const feed = document.getElementById('feed');
  const ptr = document.getElementById('ptrIndicator');
  let ptrStartY = 0, ptrActive = false, ptrDist = 0;
  const PTR_THRESHOLD = 80;

  feed.addEventListener('touchstart', ev => {
    if (feed.scrollTop > 5 || ev.touches.length > 1) return;
    ptrStartY = ev.touches[0].clientY;
    ptrActive = true;
    ptrDist = 0;
    ptr.classList.remove('ready','loading');
  }, {passive:true});

  feed.addEventListener('touchmove', ev => {
    if (!ptrActive) return;
    const dy = ev.touches[0].clientY - ptrStartY;
    if (dy < 0) { ptrDist = 0; return; }
    ptrDist = Math.min(dy, 140);
    // Rubber-band: diminishing returns past threshold
    const visual = ptrDist < PTR_THRESHOLD ? ptrDist : PTR_THRESHOLD + (ptrDist - PTR_THRESHOLD) * 0.3;
    ptr.style.transform = `translateX(-50%) translateY(${visual - 20}px)`;
    ptr.style.transition = 'none';
    if (ptrDist >= PTR_THRESHOLD) ptr.classList.add('ready');
    else ptr.classList.remove('ready');
  }, {passive:true});

  feed.addEventListener('touchend', () => {
    if (!ptrActive) return;
    ptrActive = false;
    ptr.style.transition = 'transform .5s cubic-bezier(.34,1.56,.64,1)';
    ptr.style.transform = 'translateX(-50%) translateY(-60px)';
    if (ptrDist >= PTR_THRESHOLD) {
      ptr.classList.remove('ready');
      ptr.classList.add('loading');
      // Hold spinner briefly then refresh
      setTimeout(() => {
        ptr.classList.remove('loading');
        resetFeed();
        toast('✨ Feed refreshed');
      }, 600);
    } else {
      ptr.classList.remove('ready');
    }
  }, {passive:true});
}



// ── RENDER ─────────────────────────────────────────────────────────────────
function renderCard(a) {
  const isHow   = a.src==='how', isLiked=liked.has(a.id);
  const pageid  = parseInt(a.id.slice(1));
  // The first card's photo is the page's largest paint: fetch it immediately.
  const lead    = !document.querySelector('#feed .card[data-id]');
  const load    = lead ? 'loading="eager"' : 'loading="lazy"';
  const img     = a.img ? `<img src="${esc(a.img)}" alt="" decoding="async" ${load} onerror="this.remove()">` : '';
  const artImg  = a.img ? `<figure class="art-media"><img class="art-backdrop" aria-hidden="true" src="${esc(a.img)}" alt="" ${load}><img src="${esc(a.img)}" alt="" decoding="async" ${lead ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"'} class="art-img" onerror="this.closest('.art-media').classList.add('image-unavailable');this.remove()"><span class="art-media-fallback" aria-hidden="true"><svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1"><circle cx="32" cy="32" r="24"/><ellipse cx="32" cy="32" rx="12" ry="24"/><path d="M8 32h48M12 19h40M12 45h40"/></svg></span></figure>` : '';
  const cat     = isHow ? {label:'Travel',emoji:'🌍'} : TOPIC_MAP[a.topic] || (/^https:\/\/en\./.test(a.url) ? detectCategory(a) : null) || {label:'Discovery',emoji:'🧭'};
  const catHtml = cat ? `<span class="cat-tag">${cat.emoji} ${esc(cat.label)}</span>` : '';
  const need    = !isHow && Array.isArray(a.needs) ? a.needs.find(n => Object.hasOwn(NEED_LABELS, n)) : null;
  const needHtml = need ? `<a class="need-tag" href="${esc(a.url)}" target="_blank" rel="noopener" title="Open on Wikipedia to help improve it">📝 ${NEED_LABELS[need]}</a>` : '';
  const card    = document.createElement('div');
  card.className = 'card'+(isHow?' how':'');
  card.dataset.id = a.id;
  card.innerHTML = `
    <div class="cbg">${img}<div class="cveil"></div></div>
    <div class="swipe-ind like-ind">LIKE</div>
    <div class="swipe-ind skip-ind">SKIP</div>
    <div class="panel">
      <div class="chip ${isHow?'h':'w'}">${isHow?'Wikivoyage':'Wikipedia'}</div>
      ${artImg}
      <div class="meta-row">${catHtml}${needHtml}</div>
      <h2 class="art-title" dir="auto"></h2>
      <p class="art-body" dir="auto"></p>
      <div class="acts">
        <button class="act${isLiked?' liked':''}" id="lb-${esc(a.id)}">${atlasIcon.bookmark}<span>${isLiked?'Saved':'Save'}</span></button>
        <button class="act">${atlasIcon.share}<span>Share</span></button>
        <button class="act cta${isHow?' hcta':''}"><span>Read full article</span>${atlasIcon.arrow}</button>
      </div>
    </div>`;
  card.querySelector('.art-title').textContent = a.title;
  card.querySelector('.art-body').textContent  = a.body;
  const [likeBtn,shareBtn,readBtn] = card.querySelectorAll('.acts > .act');
  likeBtn.addEventListener('click',  () => toggleLike(a.id));
  shareBtn.addEventListener('click', () => doShare(a));
  readBtn.addEventListener('click',  () => window.open(a.url,'_blank'));
  // Keep the map action attached to the image, with a text-only card fallback.
  if (isHow) {
    const mapBtn = document.createElement('button');
    mapBtn.className = 'map-btn';
    mapBtn.title = 'Explore on Map';
    mapBtn.innerHTML = '<svg class="atlas-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15"/></svg><span>View map</span>';
    mapBtn.addEventListener('click', (e) => { e.stopPropagation(); openMap(a); });
    (card.querySelector('.art-media') || card.querySelector('.meta-row')).appendChild(mapBtn);
  }

  document.getElementById('feed').appendChild(card);
  decorateToday(card);
}

function showError() {
  const isHow = curMode==='how';
  const offline = !navigator.onLine;
  const msg = offline
    ? "You're offline — reconnect and try again. Saved articles are still available in your Likes."
    : isHow && travelExhausted && (travelFilters.place || travelFilters.style) ? 'No matching guides. Try a broader country or region, or clear your travel filters in Settings.' : `${isHow?'Wikivoyage':'Wikipedia'} didn't respond.`;
  const card = document.createElement('div'); card.className='card';
  card.innerHTML = `<div class="cbg"><div class="cveil"></div></div><div class="err"><div class="err-ico">${offline?'📡':(isHow?'🗺️':'📖')}</div><div class="err-ttl">Nothing loaded</div><div class="err-msg">${msg}</div><button class="err-btn">Try again</button></div>`;
  card.querySelector('.err-btn').addEventListener('click', resetFeed);
  if(isHow&&(travelFilters.place||travelFilters.style)){
    const clear=document.createElement('button');clear.className='err-btn';clear.textContent='Clear travel filters';
    clear.onclick=()=>{travelFilters={place:'',style:''};lsSet('ws_travel_filters',travelFilters);syncTravel();resetFeed();};
    card.querySelector('.err').appendChild(clear);
  }
  document.getElementById('feed').appendChild(card);
}

// ── LIKES + IDB ────────────────────────────────────────────────────────────
function toggleLike(id) {
  const a = articles.find(x => x.id===id); if (!a) return;
  const wasLiked = liked.has(id);
  if (wasLiked) { liked.delete(id); IDB.delete(id); }
  else          { liked.set(id, a); IDB.put(a); }
  saveLiked(); updateBadge();
  const btn = document.getElementById('lb-'+id);
  if (btn) {
    const on = liked.has(id);
    if (on) {
      // Liking: instant class + text
      btn.className = 'act liked';
      btn.innerHTML = atlasIcon.bookmark + '<span>Saved</span>';
    } else {
      // Unliking: remove class first (starts CSS transition), then swap text after a frame
      btn.className = 'act';
      requestAnimationFrame(() => { btn.innerHTML = atlasIcon.bookmark + '<span>Save</span>'; });
    }
  }
}
function removeLike(id) {
  liked.delete(id); IDB.delete(id); saveLiked(); updateBadge();
  const btn = document.getElementById('lb-'+id);
  if (btn) { btn.className='act'; requestAnimationFrame(() => { btn.innerHTML=atlasIcon.bookmark + '<span>Save</span>'; }); }
  renderLikedList();
}
function updateBadge() {
  const n = liked.size;
  ['badge','burgerBadge'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent=n; el.style.display=n?'inline-block':'none'; }
  });
}
function updateTopicBadge() {
  const n = curTopics.size;
  const tb = document.getElementById('topicBadge');
  if (tb) { tb.textContent=n; tb.style.display=n?'inline-block':'none'; }
  document.getElementById('burgerTopicsBtn')?.classList.toggle('active', n > 0);
  document.getElementById('topicsBtn')?.classList.toggle('has-topics', n > 0);
  const sub = document.getElementById('burgerTopicsSub');
  if (sub) { sub.querySelector('.topics-mix').hidden = n > 0; sub.querySelector('.topics-count').hidden = !n; sub.querySelector('.topics-n').textContent = n; }
}

function renderLikedList() {
  const heading=document.getElementById('collectionHeading');
  if(heading){const collection=activeCollection===null?null:collections[activeCollection];heading.textContent=collection?.name||'';heading.hidden=!collection;}
  renderCollTabs();
  renderCollectionShare();
  const c = document.getElementById('likedList');
  let items = [...liked.values()].reverse();
  // Filter by active collection
  if (activeCollection !== null && collections[activeCollection]) {
    const ids = new Set(collections[activeCollection].ids);
    items = items.filter(a => ids.has(a.id));
  }
  if (!items.length) {
    const msg = activeCollection !== null
      ? 'No articles in this collection yet. Add some from the "All" tab.'
      : 'Like articles while scrolling to save them here. They\'ll be available offline too.';
    const ico = activeCollection !== null ? '📁' : '🔖';
    const ttl = activeCollection !== null ? 'Empty collection' : 'Nothing saved yet';
    c.innerHTML = `<div class="empty"><div class="empty-ico">${ico}</div><div class="empty-ttl">${ttl}</div><div class="empty-txt">${msg}</div></div>`;
    if (activeCollection !== null) {
      c.innerHTML += `<div style="text-align:center;margin-top:12px;"><button class="li-btn" id="deleteCollBtn" style="color:#f87171;">Delete this collection</button></div>`;
    }
    return;
  }
  const offline = !navigator.onLine;
  c.innerHTML = items.map(a => {
    const inColls = collections.filter(col => col.ids.includes(a.id)).map(col => col.name);
    const collLabel = inColls.length ? `<div style="font-size:11px;color:var(--accent);margin-bottom:8px;"> ${esc(inColls.join(', '))}</div>` : '';
    return `<div class="li">
      ${a.img && /^https:\/\//i.test(a.img) ? `<div class="saved-image"><img src="${esc(a.img)}" alt="" loading="lazy" decoding="async" onerror="this.parentElement.remove()"></div>` : ''}
      <div class="li-src">${a.src==='wiki'?'Wikipedia':'Wikivoyage'}</div>
      ${offline ? '<div class="li-offline">✓ Available offline</div>' : ''}
      ${collLabel}
      <div class="li-ttl">${esc(a.title)}</div>
      <div class="li-body">${esc(a.body.slice(0,130))}</div>
      <div class="li-acts">
        <button class="li-btn" data-read="${esc(a.url)}">${atlasIcon.arrow}<span>Read</span></button>
        <button class="li-btn" data-share-url="${esc(a.url)}" data-share-title="${esc(a.title)}" data-share-id="${esc(a.id)}">${atlasIcon.share}<span>Share</span></button>
        <button class="li-btn" data-collect="${esc(a.id)}" aria-label="Save to collection">${atlasIcon.bookmark}<span>Collect</span></button>
        <button class="li-btn" data-unlike="${esc(a.id)}"><svg class="atlas-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/></svg><span>Remove</span></button>
      </div>
    </div>`;
  }).join('');
  if (activeCollection !== null) {
    c.innerHTML += `<div style="text-align:center;margin-top:12px;"><button class="li-btn" id="deleteCollBtn" style="color:#f87171;">Delete this collection</button></div>`;
  }
}
document.getElementById('likedList').addEventListener('click', ev => {
  const btn = ev.target.closest('.li-btn'); if (!btn) return;
  if (btn.dataset.read) {
    if (!navigator.onLine) { const a = [...liked.values()].find(a => a.url === btn.dataset.read); if(a) openAmbient({dataset:{id:a.id}}); }
    else window.open(btn.dataset.read,'_blank');
  }
  else if (btn.dataset.collect) openCollectionChooser(btn.dataset.collect);
  else if (btn.dataset.unlike)   removeLike(btn.dataset.unlike);
  else if (btn.dataset.shareUrl) doShare({url: btn.dataset.shareUrl, title: btn.dataset.shareTitle, id: btn.dataset.shareId});
  if (btn.id === 'deleteCollBtn' && activeCollection !== null) deleteCollection(activeCollection);
});
document.getElementById('collTabs').addEventListener('click', ev => {
  const tab = ev.target.closest('.coll-tab'); if (!tab) return;
  const cid = tab.dataset.cid;
  activeCollection = cid === 'null' ? null : parseInt(cid);
  renderLikedList();
});
document.getElementById('collNewBtn').addEventListener('click', () => {
  const input = document.getElementById('collNewInput');
  createCollection(input.value);
  input.value = '';
});
document.getElementById('collNewInput').addEventListener('keydown', ev => {
  if (ev.key === 'Enter') { createCollection(ev.target.value); ev.target.value = ''; }
});

// ── SHARE ──────────────────────────────────────────────────────────────────
function deepLinkUrl(a) {
  // Build shareable WikiScroll deep link: wikiscroll.com/?a=w12345
  // Uses the current origin when served over http(s) so staging/preview
  // deployments generate working links; falls back to production domain.
  const base = /^https?:$/.test(location.protocol) ? location.origin + '/' : 'https://wikiscroll.com/';
  let lang = 'en';
  try { lang = new URL(a.url).hostname.split('.')[0]; } catch {}
  return `${base}?a=${encodeURIComponent(a.id)}${lang !== 'en' && LANGS.some(l=>l.c===lang) ? '&lang='+lang : ''}`;
}
async function doShare(a) {
  // Share the Worker deep link so messaging apps can render its article preview.
  const shareUrl = a.id ? deepLinkUrl(a) : (a.url || 'https://wikiscroll.com');
  if (navigator.share) {
    try { await navigator.share({url:shareUrl}); return; }
    catch (error) { if (error?.name === 'AbortError') return; }
  }
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(shareUrl); toast('Link copied!');
  } catch { toast('Could not share. Open the article to copy its link.'); }
}

// ── TOPICS ─────────────────────────────────────────────────────────────────
function buildTopicChips(container, cls) {
  container.innerHTML = TOPICS.map(t => `<button class="${cls}${curTopics.has(t.id)?' on':''}" data-tid="${t.id}" aria-pressed="${curTopics.has(t.id)}">${t.emoji} ${t.label}</button>`).join('');
}
// Tags show whenever Help Wikipedia is on; the description follows the choice.
function syncHelpUI() {
  document.body.classList.toggle('help-unavailable', !helpAvailable());
  document.body.classList.toggle('show-needs', helpAvailable() && helpMode !== 'off');
  document.body.dataset.helpMode = helpMode;
  document.querySelectorAll('[data-help-choice]').forEach(button => {
    const selected = button.dataset.helpChoice === helpMode;
    button.classList.toggle('on', selected);
    button.setAttribute('aria-checked', String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
  document.querySelectorAll('.help-seg').forEach(fitHelpChoices);
}
// Keep the three choices on one line when they fit; otherwise stack them.
function fitHelpChoices(group) {
  group.classList.remove('stacked');
  if (!group.clientWidth) return;
  // Measure each label at its natural one-line width.
  group.classList.add('measuring');
  const buttons = [...group.children];
  const needed = buttons.reduce((sum, b) => sum + b.getBoundingClientRect().width, 0) + 4 * (buttons.length - 1) + 8;
  group.classList.remove('measuring');
  group.classList.toggle('stacked', needed > group.clientWidth + 0.5);
}
function syncTopicUI() {
  updateTopicBadge();
  syncHelpUI();
  document.querySelectorAll('[data-tid]').forEach(el => {
    const selected = curTopics.has(el.dataset.tid);
    el.classList.toggle('on', selected);
    el.setAttribute('aria-pressed', String(selected));
  });
}
function toggleTopic(id) {
  if (!Object.hasOwn(TOPIC_MAP,id)) return;
  curTopics.has(id) ? curTopics.delete(id) : curTopics.add(id);
  saveTopics(); syncTopicUI();
  resetFeed();
}

buildTopicChips(document.getElementById('topicGrid'),      'topic-chip');
buildTopicChips(document.getElementById('burgerTopicGrid'),'btopic');

document.getElementById('topicGrid').addEventListener('click', ev => {
  const c = ev.target.closest('.topic-chip'); if (c) toggleTopic(c.dataset.tid);
});
document.getElementById('burgerTopicGrid').addEventListener('click', ev => {
  const c = ev.target.closest('.btopic'); if (c) toggleTopic(c.dataset.tid);
});
document.getElementById('sheetReset').addEventListener('click', () => {
  curTopics.clear(); saveTopics(); syncTopicUI();
  resetFeed();
});
function openTopicSheet()  { closeAllPanels(); syncTopicUI(); document.getElementById('topicSheet').classList.add('open');    document.getElementById('sheetOverlay').classList.add('open'); }
function closeTopicSheet() { document.getElementById('topicSheet').classList.remove('open'); document.getElementById('sheetOverlay').classList.remove('open'); }
document.getElementById('topicsBtn').addEventListener('click', () => {
  const sheet = document.getElementById('topicSheet');
  if (sheet.classList.contains('open')) closeTopicSheet();
  else openTopicSheet();
});
document.getElementById('sheetOverlay').addEventListener('click', closeTopicSheet);
document.getElementById('topicClose').addEventListener('click', closeTopicSheet);

// ── LANGUAGE ───────────────────────────────────────────────────────────────
const desktopLangDd = document.getElementById('langDd');
const burgerLangGrid = document.getElementById('burgerLangGrid');

desktopLangDd.innerHTML  = LANGS.map(l => `<button class="lopt${l.c===curLang?' sel':''}" data-c="${l.c}">${l.f} ${l.n}</button>`).join('');
burgerLangGrid.innerHTML = LANGS.map(l => `<button class="blopt${l.c===curLang?' sel':''}" data-c="${l.c}">${l.f} ${l.n}</button>`).join('');

// Updates language labels + selected states everywhere (hoisted — also called
// during loadPersistedState before setLang exists in the flow)
function applyLangUI() {
  window.WSI18n?.setLanguage(curLang);
  const lang = LANGS.find(l => l.c===curLang);
  if (lang) { document.getElementById('langTxt').textContent = lang.n; document.getElementById('burgerLangTxt').textContent = lang.n; }
  desktopLangDd.querySelectorAll('.lopt').forEach(o  => o.classList.toggle('sel',  o.dataset.c===curLang));
  burgerLangGrid.querySelectorAll('.blopt').forEach(o => o.classList.toggle('sel', o.dataset.c===curLang));
  syncLangOptions();
  syncHelpUI();
}
// In Wikivoyage mode, offer only languages that have a Wikivoyage edition.
function syncLangOptions() {
  for (const o of document.querySelectorAll('.lopt,.blopt')) o.hidden = curMode === 'how' && !VOYAGE_LANGS.has(o.dataset.c);
}

function setLang(c) {
  if (!LANGS.some(l => l.c === c)) return;
  curLang = c;
  loadToday();
  applyLangUI();
  syncActivityDisplay();
  saveSettings();
  const url = new URL(location.href);
  if (url.searchParams.has('lang')) { url.searchParams.set('lang', c); window.history.replaceState(null, '', url); }
  resetFeed();
}

document.getElementById('langBtn').addEventListener('click', ev => { ev.stopPropagation(); desktopLangDd.classList.toggle('open'); });
desktopLangDd.addEventListener('click', ev => { const o=ev.target.closest('.lopt'); if(o){setLang(o.dataset.c);desktopLangDd.classList.remove('open');} });
document.addEventListener('click', ev => { if (!ev.target.closest('.lang-wrap')) desktopLangDd.classList.remove('open'); });

burgerLangGrid.addEventListener('click', ev => {
  const o = ev.target.closest('.blopt');
  if (!o) return;
  setLang(o.dataset.c);
  burgerLangGrid.classList.remove('open');
  document.getElementById('burgerLangBtn').textContent = 'Change ›';
});
document.getElementById('burgerLangBtn').addEventListener('click', ev => {
  ev.stopPropagation();
  const isOpen = burgerLangGrid.classList.toggle('open');
  ev.currentTarget.textContent = isOpen ? 'Close ✕' : 'Change ›';
});

// ── MODE TOGGLE ─────────────────────────────────────────────────────────────
function setMode(m) {
  if (curMode===m) return; curMode=m;
  const isHow = m==='how';
  document.getElementById('wBtn').className = 'tbtn'+(isHow?'':' won on');
  document.getElementById('hBtn').className = 'tbtn'+(isHow?' hon on':'');
  document.body.classList.toggle('how', isHow);
  syncLangOptions();
  if (isHow && !VOYAGE_LANGS.has(curLang)) toast(VOYAGE_NOTE, 5000);
  closeTopicSheet();
  document.getElementById('burgerTopics').classList.remove('open');
  syncActivityDisplay();
  resetFeed();
}
document.getElementById('wBtn').addEventListener('click', () => setMode('wiki'));
document.getElementById('hBtn').addEventListener('click', () => setMode('how'));

// ── BURGER ─────────────────────────────────────────────────────────────────
function closeBurger() {
  document.body.classList.remove('settings-open');
  document.getElementById('burgerMenu').classList.remove('open');
  document.getElementById('burgerBackdrop').classList.remove('open');
  burgerLangGrid.classList.remove('open');
  document.getElementById('burgerLangBtn').textContent = 'Change ›';
  document.getElementById('burgerTopics').classList.remove('open');
  document.getElementById('burgerTopicsBtn').textContent = 'Filter ›';
}
function openBurger() {
  document.body.classList.add('settings-open');
  document.getElementById('settingsSource').textContent=curMode==='how'?'Wikivoyage':'Wikipedia';
  syncActivityDisplay();
  syncTopicUI();
  document.getElementById('burgerMenu').classList.add('open');
  document.getElementById('burgerBackdrop').classList.add('open');
}
document.getElementById('burgerBtn').addEventListener('click', ev => {
  ev.stopPropagation();
  const menu = document.getElementById('burgerMenu');
  if (menu.classList.contains('open')) closeBurger();
  else openBurger();
});
document.getElementById('burgerBackdrop').addEventListener('click', closeBurger);
document.getElementById('burgerTopicsBtn').addEventListener('click', ev => {
  ev.stopPropagation();
  const isOpen = document.getElementById('burgerTopics').classList.toggle('open');
  ev.currentTarget.textContent = isOpen ? 'Close ✕' : 'Filter ›';
});
function openSavedPanel() {
  closeBurger();
  closeSettings();
  document.getElementById('lp').classList.add('open');
  document.getElementById('spBackdrop').classList.add('open');
  renderLikedList();
}
document.getElementById('burgerLikesBtn').addEventListener('click', openSavedPanel);
document.getElementById('desktopLikesBtn').addEventListener('click', openSavedPanel);

// ── SETTINGS ───────────────────────────────────────────────────────────────
function syncDepthSteps(value = depthLevel) {
  document.querySelectorAll('.depth-steps').forEach(container => {
    container.querySelectorAll('.depth-step').forEach(step => {
      step.classList.toggle('active', parseInt(step.dataset.d) === value);
    });
  });
}
function syncAllToggles() {
  // role="switch" requires aria-checked to stay in sync with visual state
  const setSw = (id, on) => {
    const el = document.getElementById(id);
    if (el) { el.classList.toggle('on', on); el.setAttribute('aria-checked', on); }
  };
  // Swipe — mobile + desktop
  setSw('swipeToggle', swipeEnabled);
  setSw('dkSwipeToggle', swipeEnabled);
  // Rabbit Hole — mobile + desktop
  // KB bar — desktop only
  setSw('dkKbToggle', kbBarEnabled);
  syncHelpUI();
  // Depth — mobile + desktop
  const ds1 = document.getElementById('depthSlider');
  const ds2 = document.getElementById('dkDepthSlider');
  if (ds1) ds1.value = depthLevel;
  if (ds2) ds2.value = depthLevel;
  syncDepthSteps();
}
function setSwipe(val) { swipeEnabled=val; saveSettings(); syncAllToggles(); }

function setKbBar(val) { kbBarEnabled=val; saveSettings(); syncAllToggles(); }
function setHelpMode(mode) {
  if (!HELP_MODES.includes(mode) || mode === helpMode) return;
  const feedChanges = (mode === 'only') !== (helpMode === 'only') && helpAvailable() && curMode === 'wiki';
  helpMode = mode; saveSettings(); syncHelpUI();
  // Tags alone relabel the current cards; "Only these articles" changes what the feed holds.
  if (feedChanges) resetFeed();
}
function setTheme(val) {
  lightMode=val; saveSettings();
  // View Transitions API: the whole UI cross-fades between themes like a
  // native mode switch (progressive enhancement — instant where unsupported)
  applyTheme();
  syncAllToggles();
}
function setDepth(val) { depthLevel=parseInt(val)||3; saveSettings(); syncAllToggles(); toast(`🔭 Depth: ${DEPTH_LABELS[depthLevel]}`); resetFeed(); }

// Mobile toggles
document.getElementById('swipeToggle').addEventListener('click', () => setSwipe(!swipeEnabled));

// Desktop settings panel toggles
document.getElementById('dkSwipeToggle').addEventListener('click', () => setSwipe(!swipeEnabled));
document.getElementById('dkKbToggle').addEventListener('click', () => setKbBar(!kbBarEnabled));
document.querySelectorAll('.help-seg').forEach(group => {
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => fitHelpChoices(group)).observe(group);
  group.addEventListener('click', ev => { const b = ev.target.closest('[data-help-choice]'); if (b) setHelpMode(b.dataset.helpChoice); });
  // Radio-group keys: arrows move and select, focus follows the choice.
  group.addEventListener('keydown', ev => {
    const step = {ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1}[ev.key]; if (!step) return;
    ev.preventDefault();
    const rtl = getComputedStyle(group).direction === 'rtl' && ev.key.startsWith('Arrow') && /Left|Right/.test(ev.key) ? -1 : 1;
    const next = HELP_MODES[(HELP_MODES.indexOf(helpMode) + step * rtl + HELP_MODES.length) % HELP_MODES.length];
    setHelpMode(next); group.querySelector(`[data-help-choice="${next}"]`)?.focus();
  });
});


// Haptic feedback

// Depth sliders — sync both sliders + step indicators on drag
document.getElementById('depthSlider').addEventListener('input', ev => {
  document.getElementById('dkDepthSlider').value = ev.target.value;
  syncDepthSteps(parseInt(ev.target.value));
});
document.getElementById('depthSlider').addEventListener('change', ev => setDepth(ev.target.value));
document.getElementById('dkDepthSlider').addEventListener('input', ev => {
  document.getElementById('depthSlider').value = ev.target.value;
  syncDepthSteps(parseInt(ev.target.value));
});
document.getElementById('dkDepthSlider').addEventListener('change', ev => setDepth(ev.target.value));

// Depth step labels are clickable too
document.querySelectorAll('.depth-steps').forEach(container => {
  container.addEventListener('click', ev => {
    const step = ev.target.closest('.depth-step');
    if (!step) return;
    const val = parseInt(step.dataset.d);
    document.getElementById('depthSlider').value = val;
    document.getElementById('dkDepthSlider').value = val;
    setDepth(val);
  });
});

// History panel
function openHistoryPanel() {
  closeBurger();
  closeSettings();
  document.getElementById('hp').classList.add('open');
  document.getElementById('spBackdrop').classList.add('open');
  renderHistory();
}
document.getElementById('burgerHistoryBtn').addEventListener('click', openHistoryPanel);
document.getElementById('desktopHistoryBtn').addEventListener('click', openHistoryPanel);
document.getElementById('hpClose').addEventListener('click', closeAllPanels);
document.getElementById('historyList').addEventListener('click', ev => {
  const hi = ev.target.closest('.hi'); if (!hi?.dataset.url) return;
  window.open(hi.dataset.url, '_blank');
});

// Desktop settings panel open/close
function openSettings()  {
  syncActivityDisplay();
  document.getElementById('settingsPanel').classList.add('open');
  document.getElementById('spBackdrop').classList.add('open');
}
function closeSettings() {
  document.getElementById('settingsPanel').classList.remove('open');
  document.getElementById('spBackdrop').classList.remove('open');
}
function closeAllPanels() {
  closeSettings();
  closeTopicSheet();
  document.getElementById('lp').classList.remove('open');
  document.getElementById('hp').classList.remove('open');
  document.getElementById('spBackdrop').classList.remove('open');
}
document.getElementById('settingsBtn').addEventListener('click', () => {
  const panel = document.getElementById('settingsPanel');
  if (panel.classList.contains('open')) closeAllPanels();
  else { closeAllPanels(); openSettings(); }
});
document.getElementById('spClose').addEventListener('click', closeAllPanels);
document.getElementById('spBackdrop').addEventListener('click', closeAllPanels);

// ── HEADER BUTTONS ──────────────────────────────────────────────────────────
document.getElementById('likesBtn').addEventListener('click', () => {
  const lp = document.getElementById('lp');
  if (lp.classList.contains('open')) { closeAllPanels(); return; }
  closeAllPanels();
  lp.classList.add('open');
  document.getElementById('spBackdrop').classList.add('open');
  renderLikedList();
});
document.getElementById('lpClose').addEventListener('click', closeAllPanels);

// Privacy policy — native <dialog> via showModal().
// Why: showModal() renders in the browser's TOP LAYER, above all page content,
// immune to z-index/stacking-context/CSS-class issues (the previous class-toggle
// approach worked in Chrome but not Safari). Opening is still triggered by the
// buttons' inline onclick — proven to fire in every browser.
let _privacyOpenTime = 0;
function openPrivacy() {
  _privacyOpenTime = Date.now();
  const dlg = document.getElementById('privacyDialog');
  try {
    if (!dlg.open) dlg.showModal();
  } catch (e) {
    // Fallback for very old browsers without <dialog> support
    dlg.setAttribute('open', '');
  }
  dlg.scrollTop = 0;
}
function closePrivacy() {
  const dlg = document.getElementById('privacyDialog');
  if (dlg.open) { try { dlg.close(); } catch (e) { dlg.removeAttribute('open'); } }
  else dlg.removeAttribute('open');
}
document.getElementById('privacyClose').addEventListener('click', closePrivacy);
// Backdrop click closes — a click on ::backdrop targets the dialog element itself.
// Coordinate check distinguishes backdrop clicks from clicks on the dialog's own
// padding. The 500ms guard absorbs Safari's delayed synthetic click after tap.
document.getElementById('privacyDialog').addEventListener('click', function(ev) {
  if (ev.target !== this) return;
  const r = this.getBoundingClientRect();
  const inDialog = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
  if (inDialog) return;
  if (Date.now() - _privacyOpenTime < 500) return;
  closePrivacy();
});
document.addEventListener('keydown', ev => {
  if (ev.key!=='Escape') return;
  closePrivacy();
  document.getElementById('mapOverlay').classList.remove('open');
  document.getElementById('langDd').classList.remove('open');
  closeAllPanels(); closeBurger(); closeTopicSheet(); closeAmbient();
  document.getElementById('feed').focus();
});

// ── AMBIENT MODE ───────────────────────────────────────────────────────────
function openAmbient(card) {
  const a = articles.find(x => x.id===card.dataset.id) || liked.get(card.dataset.id); if (!a) return;
  document.getElementById('ambientTitle').textContent   = a.title;
  document.getElementById('ambientExcerpt').textContent = a.body;
  const bg = document.getElementById('ambientBg');
  bg.style.backgroundImage = a.img ? `url("${a.img.replace(/[\\"()]/g, '\\$&')}")` : '';
  const ov = document.getElementById('ambientOverlay');
  ov.classList.add('open');
}

function closeAmbient() {
  const ov = document.getElementById('ambientOverlay');
  if (!ov.classList.contains('open')) return;
  ov.classList.remove('open');
  document.getElementById('feed').focus();
}

document.getElementById('ambientOverlay').addEventListener('click', ev => {
  if (!ev.target.closest('a,button') && !window.getSelection()?.toString()) closeAmbient();
});
document.getElementById('ambientClose').addEventListener('click', closeAmbient);

// ── SWIPE GESTURES + LONG PRESS ────────────────────────────────────────────
// rAF-driven swipe engine, built for native refresh rate (60/120/144fps):
//
//   DRAG   Pointer events only record dx; ONE rAF loop writes the transform
//          once per display frame. Zero layout reads in the hot path (the old
//          per-move curCard() forced full layout every event — that was the
//          stutter under the finger).
//
//   FLIGHT One physics loop drives the card's X AND the feed's scroll Y with
//          the same easing clock — the next card rises into place while the
//          old one flies out. No black gap, because the vertical advance is
//          part of the same motion, not an afterthought. The loop starts from
//          your exact drag position/rotation and its ease-out launches faster
//          than finger speed (the Tinder "accelerate away" release feel).
//          Landing is exact (scrollTop === next card's offset), so re-enabling
//          scroll-snap never causes a correction jump.
(function() {
  const feed = document.getElementById('feed');
  const HAS_TOUCH = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let flyLock = false, flightRaf = 0, flightCard = null;

  // Release velocity — last 5 pointer samples (captures throw speed, not drag average)
  let velSamples = [];
  function velReset(x) { velSamples = [{x, t: performance.now()}]; }
  function velPush(x)  { velSamples.push({x, t: performance.now()}); if (velSamples.length > 5) velSamples.shift(); }
  function velGet() {
    if (velSamples.length < 2) return 0;
    const a = velSamples[0], b = velSamples[velSamples.length-1];
    const dt = b.t - a.t;
    return dt > 0 ? (b.x - a.x) / dt : 0; // px/ms, signed
  }

  function shouldFly(dx, vel) {
    const absDx = Math.abs(dx), absVel = Math.abs(vel);
    const sameDir = dx === 0 || vel === 0 || (dx > 0) === (vel > 0);
    return absDx > 90 || (sameDir && absVel > 0.55 && absDx > 30);
  }

  function curCard() { return getCurrentFeedCard(); }

  function feedInputBlocked() {
    return !!document.querySelector('dialog[open], #spBackdrop.open, #burgerMenu.open, #topicSheet.open, #mapOverlay.open, #ambientOverlay.open, #langDd.open');
  }

  function ind(card, cls) { return card?.querySelector('.'+cls); }

  function setIndicators(card, dx) {
    const p = Math.min(Math.abs(dx)/90, 1);
    const li = ind(card,'like-ind'), si = ind(card,'skip-ind');
    if (dx > 0) { if(li)li.style.opacity=p; if(si)si.style.opacity=0; }
    else         { if(si)si.style.opacity=p; if(li)li.style.opacity=0; }
  }

  // ── rAF DRAG CORE — one transform write per display frame ──
  // Pointer handlers only update d.dx; the frame loop does the writes.
  let d = null; // {card, cardTop, dx, raf, live}
  function dragStart(card) {
    d = { card, cardTop: feedCardTop(card), dx: 0, raf: 0, live: true };
    feedMotionLocked = true;
    card.style.transition = 'none';
    card.style.willChange = 'transform';
  }
  function dragFrame() {
    if (!d || !d.live) return;
    d.raf = 0;
    // Cheap mid-drag guard: one scrollTop read, no per-card layout walk
    if (Math.abs(feed.scrollTop - d.cardTop) > feed.clientHeight * 0.5) {
      const c = d.card; dragEndInternal();
      springBack(c);
      return;
    }
    const rot = Math.max(-16, Math.min(16, d.dx * 0.035));
    d.card.style.transform = `translate3d(${d.dx}px,0,0) rotate(${rot}deg)`;
    setIndicators(d.card, d.dx);
  }
  function dragMove(dx) {
    if (!d || !d.live) return;
    d.dx = dx;
    if (!d.raf) d.raf = requestAnimationFrame(dragFrame);
  }
  function dragEndInternal() {
    if (d?.raf) cancelAnimationFrame(d.raf);
    if (d?.card) d.card.style.willChange = '';
    d = null;
    if (!flyLock) feedMotionLocked = false;
  }

  function springBack(card) {
    card.style.transition = 'transform .4s cubic-bezier(.175,.885,.32,1.275)';
    card.style.transform = 'translateZ(0)';
    const li = ind(card,'like-ind'), si = ind(card,'skip-ind');
    if(li){ li.style.transition='opacity .25s'; li.style.opacity=0; }
    if(si){ si.style.transition='opacity .25s'; si.style.opacity=0; }
  }

  // The outgoing card stays in history. Never leave invisible full-height
  // slots behind: users can scroll backward and every snap point has content.
  function restoreCard(card) {
    if (!card) return;
    card.style.transition = 'none';
    card.style.transform = '';
    card.style.opacity = '';
    card.style.visibility = '';
    card.style.scrollSnapAlign = '';
    card.style.pointerEvents = '';
    card.style.willChange = '';
    for (const cls of ['like-ind', 'skip-ind']) {
      const indicator = ind(card, cls);
      if (indicator) { indicator.style.opacity = '0'; indicator.style.transform = ''; }
    }
  }
  function releaseFlight() {
    flightRaf = 0;
    flightCard = null;
    feed.style.scrollSnapType = '';
    feed.style.webkitScrollSnapType = '';
    feed.style.overflowY = '';
    flyLock = false;
    feedMotionLocked = false;
  }
  function cancelMotion() {
    if (flightRaf) cancelAnimationFrame(flightRaf);
    restoreCard(flightCard);
    if (d) restoreCard(d.card);
    dragEndInternal();
    releaseFlight();
    document.body.classList.remove('dragging');
  }
  // Source/filter changes must invalidate old animations before new cards
  // render; a late frame from the previous feed must never move the new one.
  window.addEventListener('feed-reset', cancelMotion);
  window.addEventListener('resize', cancelMotion);
  // Wheel events cover trackpads, including laptops with touchscreens.
  // One horizontal gesture (including its momentum tail) gets one action.
  let wheelLast = -Infinity, wheelX = 0, wheelY = 0, wheelAxis = '', wheelUsed = false;
  function resetWheel() { wheelLast = -Infinity; wheelX = wheelY = 0; wheelAxis = ''; wheelUsed = false; }
  window.addEventListener('feed-reset', resetWheel);
  window.addEventListener('resize', resetWheel);
  feed.addEventListener('wheel', ev => {
    // Pinch zoom and modified scrolling retain their browser behavior.
    if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.shiftKey) return;
    if (feedInputBlocked()) { resetWheel(); return; }
    if (flyLock && ev.cancelable) ev.preventDefault();
    if (!swipeEnabled || d || ev.target.closest('input,textarea,select,[contenteditable="true"]')) return;
    const now = performance.now();
    if (now - wheelLast > 240) resetWheel();
    wheelLast = now;
    const unit = ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? feed.clientHeight : 1;
    const dx = (ev.deltaX || 0) * unit, dy = (ev.deltaY || 0) * unit;
    wheelX += dx; wheelY += dy;
    if (!wheelAxis && Math.max(Math.abs(wheelX), Math.abs(wheelY)) >= 8) {
      if (Math.abs(wheelX) > Math.abs(wheelY) * 1.4) wheelAxis = 'x';
      else if (Math.abs(wheelY) >= Math.abs(wheelX)) wheelAxis = 'y';
    }
    if (wheelAxis !== 'x') return;
    if (ev.cancelable) ev.preventDefault();
    if (flyLock) { wheelUsed = true; return; }
    if (wheelUsed || Math.abs(wheelX) < 90) return;
    wheelUsed = true;
    const card = curCard();
    // Natural scrolling reports negative deltaX for a rightward finger swipe.
    if (card) flyOff(card, wheelX < 0 ? 1 : -1, 0.7, 0);
  }, {passive:false});

  // ── FLIGHT — card X and feed Y on one easing clock ──
  function flyOff(card, dir, vel, fromDx) {
    if (flyLock || !card?.isConnected || card !== curCard()) { springBack(card); return; }
    ensureFeedAhead();
    const allCards = Array.from(feed.querySelectorAll('.card[data-id]'));
    const nextCard = allCards[allCards.indexOf(card) + 1];
    // A loading connection is allowed to pause a gesture; it is never allowed
    // to throw away the only visible content or snap back to an older card.
    if (!nextCard) { springBack(card); return; }
    const generation = fillGeneration;
    flyLock = true;
    feedMotionLocked = true;
    flightCard = card;

    const li = ind(card,'like-ind'), si = ind(card,'skip-ind');
    const stamp = dir > 0 ? li : si;
    const other = dir > 0 ? si : li;
    if (other) other.style.opacity = '0';
    if (stamp) stamp.style.transition = 'none';

    // Like on right: saves, never un-saves an already saved card. Guarded so
    // nothing about liking can ever jam flyLock.
    if (dir > 0 && !liked.has(card.dataset.id)) { try { toggleLike(card.dataset.id); } catch(err) { console.error(err); } }

    // Geometry (single upfront read pass — none inside the loop)
    const startX = fromDx || 0;
    const endX = dir * (window.innerWidth * 1.2);
    const startScroll = feed.scrollTop;
    const endScroll = feedCardTop(nextCard);

    // Exit speed scales with throw speed; ease-out launch always outruns the finger
    const absVel = Math.abs(vel || 0);
    const dur = REDUCED ? 0.01 : Math.max(0.26, Math.min(0.46, 0.46 - absVel * 0.10));

    // STAMP MOMENT — a fly that starts with little or no drag (keyboard
    // arrows, micro-flicks) never showed its LIKE/SKIP stamp: the stamp
    // appeared the same instant the card launched. Hold the card briefly
    // with a small wind-up toward the exit while the stamp pops in, THEN
    // fly. Drag-triggered swipes skip this — the stamp faded in under the
    // finger already.
    const hold = (REDUCED || Math.abs(startX) >= 60) ? 0 : 0.22;
    const windX = hold ? dir * Math.max(Math.abs(startX), 28) : startX;
    const stampFrom = stamp ? (parseFloat(stamp.style.opacity) || 0) : 1;
    if (!hold && stamp) stamp.style.opacity = '1'; // drag path: instant full flash

    // Glow flash on the incoming card
    if (nextCard) {
      let flash = nextCard.querySelector('.swipe-flash');
      if (!flash) {
        flash = document.createElement('div');
        flash.className = 'swipe-flash';
        nextCard.appendChild(flash);
      }
      flash.classList.remove('like','skip','show');
      void flash.offsetWidth;
      flash.classList.add(dir > 0 ? 'like' : 'skip', 'show');
      setTimeout(() => flash.classList.remove('show'), 600);
    }

    card.style.transition = 'none';
    card.style.willChange = 'transform';
    feed.style.scrollSnapType = 'none';
    feed.style.webkitScrollSnapType = 'none';
    feed.style.overflowY = 'hidden';

    const t0 = performance.now();
    const holdMs = hold * 1000, durMs = dur * 1000;
    const stampRot = dir > 0 ? -16 : 16;
    function frame(now) {
      if (generation !== fillGeneration || !card.isConnected || !nextCard.isConnected) { cancelMotion(); return; }
      const el = now - t0;
      // Phase 1 — the stamp moment: card winds up, stamp pops in and settles
      if (el < holdMs) {
        const hp = el / holdMs;
        const he = 1 - Math.pow(1 - hp, 3);
        const x = startX + (windX - startX) * he;
        card.style.transform = `translate3d(${x}px,0,0) rotate(${(x * 0.035).toFixed(2)}deg)`;
        if (stamp) {
          stamp.style.opacity = (stampFrom + (1 - stampFrom) * Math.min(1, hp * 1.6)).toFixed(3);
          stamp.style.transform = `rotate(${stampRot}deg) scale(${(1.28 - 0.28 * he).toFixed(3)})`;
        }
        flightRaf = requestAnimationFrame(frame);
        return;
      }
      if (stamp && hold) { stamp.style.opacity = '1'; stamp.style.transform = `rotate(${stampRot}deg)`; }
      // Phase 2 — the flight: card X and feed Y on one easing clock
      const t = Math.min(1, (el - holdMs) / durMs);
      const e = 1 - Math.pow(1 - t, 3); // easeOutCubic
      const fx = hold ? windX : startX;
      const x = fx + (endX - fx) * e;
      const rot = Math.max(-16, Math.min(16, x * 0.035));
      card.style.transform = `translate3d(${x}px,0,0) rotate(${rot}deg)`;
      if (nextCard) feed.scrollTop = startScroll + (endScroll - startScroll) * e;
      if (t < 1) { flightRaf = requestAnimationFrame(frame); return; }
      // Landed — exactly on the next card's offset, so snap won't correct
      feed.scrollTop = feedCardTop(nextCard);
      restoreCard(card);
      flightRaf = requestAnimationFrame(() => {
        if (generation !== fillGeneration) { cancelMotion(); return; }
        releaseFlight();
        ensureFeedAhead();
      });
    }
    flightRaf = requestAnimationFrame(frame);
  }

  // ── TOUCH ──
  let startX=0, startY=0, swiping=false, lpTimer=null, touchCard=null;
  document.addEventListener('touchstart', ev => {
    if (ev.touches.length>1 || flyLock || feedInputBlocked()) return;
    const card = ev.target.closest('.card');
    if (!card || !feed.contains(card) || ev.target.closest('button,.acts,a')) return;
    startX=ev.touches[0].clientX; startY=ev.touches[0].clientY;
    swiping=false; touchCard=card;
    velReset(startX);
    lpTimer = setTimeout(()=>{ if(!swiping){ openAmbient(card); touchCard=null; } lpTimer=null; },620);
  },{passive:true});

  document.addEventListener('touchmove', ev => {
    if (flyLock) { if (feed.contains(ev.target) && ev.cancelable) ev.preventDefault(); return; }
    if (!touchCard) return;
    const dx=ev.touches[0].clientX-startX, dy=ev.touches[0].clientY-startY;
    if (!swiping) {
      if (Math.abs(dy)>Math.abs(dx)+8) { clearTimeout(lpTimer); touchCard=null; return; }
      if (Math.abs(dx)>10) { swiping=true; clearTimeout(lpTimer); if (swipeEnabled) dragStart(touchCard); }
      else return;
    }
    velPush(ev.touches[0].clientX);
    if (swipeEnabled && ev.cancelable) { dragMove(dx); ev.preventDefault(); }
  },{passive:false});

  document.addEventListener('touchend', ()=>{
    clearTimeout(lpTimer);
    if (!touchCard || !swiping || flyLock) { touchCard=null; swiping=false; return; }
    const card = touchCard; touchCard=null; swiping=false;
    const dx = d?.dx || 0;
    dragEndInternal();
    if (!swipeEnabled) { springBack(card); return; }
    const vel = velGet();
    if (shouldFly(dx, vel)) flyOff(card, dx>0?1:-1, vel, dx);
    else springBack(card);
  },{passive:true});

  document.addEventListener('touchcancel', () => {
    clearTimeout(lpTimer);
    if (d) springBack(d.card);
    dragEndInternal();
    touchCard = null;
    swiping = false;
  }, {passive:true});
  window.addEventListener('feed-reset', () => {
    clearTimeout(lpTimer);
    touchCard = null;
    swiping = false;
  });

  // ── DESKTOP: mouse dragging (non-touch devices) ──
  if (!HAS_TOUCH) {
    let mCard = null, mDragging = false, mStartX = 0, mStartY = 0;

    document.addEventListener('mousedown', ev => {
      if (ev.button !== 0 || flyLock || !swipeEnabled || feedInputBlocked()) return;
      const card = ev.target.closest('.card');
      if (!card || !feed.contains(card) || ev.target.closest('button,.acts,a')) return;
      mCard = card; mDragging = false;
      mStartX = ev.clientX; mStartY = ev.clientY;
      velReset(ev.clientX);
    });

    document.addEventListener('mousemove', ev => {
      if (!mCard || flyLock) return;
      const dx = ev.clientX - mStartX, dy = ev.clientY - mStartY;
      if (!mDragging) {
        if (Math.abs(dy) > Math.abs(dx) + 8) { mCard = null; return; }
        if (Math.abs(dx) <= 6) return;
        mDragging = true;
        document.body.classList.add('dragging');
        dragStart(mCard);
      }
      velPush(ev.clientX);
      dragMove(dx);
      ev.preventDefault();
    });

    const endMouseDrag = () => {
      if (!mCard) return;
      const card = mCard, wasDragging = mDragging;
      mCard = null; mDragging = false;
      document.body.classList.remove('dragging');
      if (!wasDragging) return;
      const dx = d?.dx || 0;
      dragEndInternal();
      // Swallow the click that follows a drag so it can't hit a button
      const swallow = e => { e.stopPropagation(); e.preventDefault(); };
      document.addEventListener('click', swallow, {capture:true, once:true});
      setTimeout(() => document.removeEventListener('click', swallow, {capture:true}), 60);
      const vel = velGet();
      if (shouldFly(dx, vel)) flyOff(card, dx > 0 ? 1 : -1, vel, dx);
      else springBack(card);
    };
    window.addEventListener('feed-reset', () => { mCard = null; mDragging = false; });
    document.addEventListener('mouseup', endMouseDrag);
    document.addEventListener('mouseleave', endMouseDrag);
  }

  // ── DESKTOP: keyboard shortcuts ──
  document.addEventListener('keydown', ev => {
    // Preserve browser shortcuts and native button/link activation, and never
    // navigate or save the feed through an open settings panel or dialog.
    if (ev.defaultPrevented || ev.ctrlKey || ev.metaKey || ev.altKey || ev.shiftKey || ev.isComposing) return;
    if (ev.target.closest('input,textarea,select,button,a,summary,[role="button"],[contenteditable="true"]')) return;
    if (feedInputBlocked()) {
      if (ev.key === ' ' && document.getElementById('ambientOverlay').classList.contains('open')) {
        ev.preventDefault(); closeAmbient();
      }
      return;
    }
    if (flyLock && ['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','PageDown','PageUp','Home','End',' '].includes(ev.key)) { ev.preventDefault(); return; }

    if (ev.key === ' ') {
      ev.preventDefault();
      const ov = document.getElementById('ambientOverlay');
      if (ov.classList.contains('open')) { closeAmbient(); return; }
      const card = curCard();
      if (card) openAmbient(card);
      return;
    }

    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      ensureFeedAhead();
      const cards = Array.from(feed.querySelectorAll('.card[data-id]'));
      const target = cards[cards.indexOf(curCard()) + (ev.key === 'ArrowDown' ? 1 : -1)];
      if (target) feed.scrollTo({top: feedCardTop(target), behavior: REDUCED ? 'instant' : 'smooth'});
      return;
    }

    const card = curCard(); if (!card) return;
    const id = card.dataset.id;
    switch (ev.key) {
      // Arrows launch a medium-flick flight (~0.39s)
      case 'ArrowLeft':  ev.preventDefault(); flyOff(card, -1, 0.7, 0); break;
      case 'ArrowRight': ev.preventDefault(); flyOff(card,  1, 0.7, 0); break;
      case 'l': case 'L': toggleLike(id); break;
      case 's': case 'S': { const a = articles.find(x => x.id === id); if (a) doShare(a); break; }
      case 'r': case 'R': { const a = articles.find(x => x.id === id); if (a) window.open(a.url, '_blank'); break; }

      case 'm': case 'M': { const a = articles.find(x => x.id === id); if (a?.src === 'how') openMap(a); break; }
    }
  });
})();

// ── KEYBOARD BAR (desktop) ────────────────────────────────────────────────
(function() {
  const bar = document.getElementById('kbBar');
  if (!bar || 'ontouchstart' in window) return;
  let hideTimer = null;
  function showBar() {
    if (!kbBarEnabled) { bar.classList.remove('show'); return; }
    bar.classList.add('show');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => bar.classList.remove('show'), 4000);
  }
  showBar();
  document.addEventListener('mousemove', showBar);
  document.addEventListener('keydown', showBar);
  // Watch for setting changes
  new MutationObserver(() => {
    if (!kbBarEnabled) bar.classList.remove('show');
  }).observe(bar, {attributes:true, attributeFilter:['class']});
})();

// ── DOUBLE-TAP TO LIKE ──────────────────────────────────────────────────────
(function() {
  let lt=0,lx=0,ly=0,zoomed=false;
  const unzoom=()=>setTimeout(()=>{zoomed=false;},1200);
  if(window.visualViewport){window.visualViewport.addEventListener('resize',()=>{if(window.visualViewport.scale>1.05){zoomed=true;lt=0;unzoom();}});}
  document.addEventListener('touchstart',ev=>{
    if(ev.touches.length>1){zoomed=true;lt=0;unzoom();return;}
    if(zoomed){lt=0;return;}
    const card=ev.target.closest('.card');
    if(!card||ev.target.closest('button,.acts,.cbg')){lt=0;return;}
    const now=Date.now(),x=ev.touches[0].clientX,y=ev.touches[0].clientY;
    if(now-lt<340&&Math.hypot(x-lx,y-ly)<40){
      ev.preventDefault();
      // Double-tap only ever saves (the heart confirms it), like the swipe.
      if(!liked.has(card.dataset.id))toggleLike(card.dataset.id);
      const h=document.createElement('div');h.className='heart';h.textContent='❤️';
      h.style.cssText=`left:${x}px;top:${y}px`;
      document.body.appendChild(h);setTimeout(()=>h.remove(),750);lt=0;
    }else{lt=now;lx=x;ly=y;}
  },{passive:false});
})();

// ── MAP EXPLORER (Wikivoyage) ─────────────────────────────────────────────
// Public browser key: restrict it to wikiscroll.com in the CARTO dashboard.
// Browser-visible key; domain restrictions are managed by the owner in CARTO.
const CARTO_BASEMAP_KEY = '';
function cartoTileURL(isDark,key=CARTO_BASEMAP_KEY) {
  const style=isDark?'dark_all':'voyager';
  return 'https://{s}.basemaps.cartocdn.com/rastertiles/'+style+'/{z}/{x}/{y}{r}.png?key='+encodeURIComponent(key);
}
let mapInstance = null;
let mapMarker = null;
let mapRequest = 0;

// Wikivoyage records each destination's own coordinates, so "Paris (Texas)"
// is pinned in Texas. Free-text geocoding is only a fallback, and it keeps the
// disambiguation ("Paris, Texas") instead of stripping it.
async function geocodePlace(article) {
  const title = typeof article === 'string' ? article : String(article?.title || '');
  try {
    const id = String(article?.id || ''), host = new URL(article?.url || '').hostname;
    if (/^v[1-9]\d{0,11}$/.test(id) && /^[a-z-]+\.wikivoyage\.org$/.test(host)) {
      const pageid = id.slice(1);
      const resp = await fetch(`https://${host}/w/api.php?action=query&format=json&origin=*&prop=coordinates&coprimary=primary&pageids=${pageid}`, {signal:AbortSignal.timeout(6000)});
      const c = resp.ok ? (await resp.json())?.query?.pages?.[pageid]?.coordinates?.[0] : null;
      if (c && Number.isFinite(c.lat) && Number.isFinite(c.lon)) return { lat: c.lat, lng: c.lon, display: '' };
    }
  } catch {}
  const q = encodeURIComponent(title.replace(/\s*\(([^()]*)\)\s*/g, ', $1').replace(/,\s*$/, '').trim());
  const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&accept-language=en`;
  try {
    const resp = await fetch(url,{signal:AbortSignal.timeout(8000)});
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data?.length) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), display: data[0].display_name };
  } catch (e) { console.warn('Geocode failed:', e); }
  return null;
}

let mapLibraryPromise=null;
function ensureMapLibrary(){
  if(mapLibraryPromise)return mapLibraryPromise;
  const nodes=[];
  const load=(tag,url)=>new Promise((resolve,reject)=>{
    const el=document.createElement(tag);nodes.push(el);
    if(tag==='link'){el.rel='stylesheet';el.href=url;}else{el.src=url;el.async=true;}
    el.crossOrigin='anonymous';
    const timer=setTimeout(()=>{el.remove();reject(new Error('Map library timeout'));},10000);
    el.onload=()=>{clearTimeout(timer);resolve();};el.onerror=()=>{clearTimeout(timer);reject(new Error('Map library unavailable'));};
    document.head.appendChild(el);
  });
  mapLibraryPromise=Promise.all([
    load('link','https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'),
    load('script','https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js')
  ]).then(()=>{if(typeof L==='undefined')throw new Error('Map library unavailable');}).catch(error=>{nodes.forEach(el=>el.remove());mapLibraryPromise=null;throw error;});
  return mapLibraryPromise;
}

async function openMap(article) {
  const request=++mapRequest;
  if (mapMarker) { mapMarker.remove(); mapMarker = null; }
  closeAllPanels();closeBurger();
  const overlay = document.getElementById('mapOverlay');
  const loading = document.getElementById('mapLoading');
  const canvas = document.getElementById('mapCanvas');
  const titleEl = document.getElementById('mapTitle');
  const badgeText = document.getElementById('mapBadgeText');
  const readLink = document.getElementById('mapReadLink');

  // Show overlay with loading state
  titleEl.textContent = article.title;
  badgeText.textContent = article.title;
  readLink.href = article.url;
  loading.querySelector('.map-loading-text').textContent = '🗺️ Loading map…';
  loading.classList.remove('hidden');
  overlay.classList.add('open');

  try { await ensureMapLibrary(); } catch {
    if(request===mapRequest)loading.querySelector('.map-loading-text').textContent='Map could not load. Close it and try again.';
    return;
  }
  if(request!==mapRequest||!overlay.classList.contains('open'))return;
  // Small delay to let CSS transition start before heavy work
  await new Promise(r => setTimeout(r, 50));

  // Geocode the place
  const geo = await geocodePlace(article);
  if(request!==mapRequest||!overlay.classList.contains('open'))return;
  if (!geo) {
    loading.querySelector('.map-loading-text').textContent = '📍 Could not locate this place';
    // Keep the failure visible and never show the previous destination as this place.
    if (mapInstance) mapInstance.setView([20, 0], 2, {animate:false});
    // Still show a world view
    try {
      if (!mapInstance) {
        mapInstance = L.map(canvas, { zoomControl: false, attributionControl: true, scrollWheelZoom: true, zoomSnap: 1, wheelPxPerZoomLevel: 120 }).setView([20, 0], 2);
        const isDark = !document.body.classList.contains('light');
        L.tileLayer(cartoTileURL(isDark), {
          detectRetina:true, maxZoom: 19, subdomains: 'abcd', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        }).addTo(mapInstance);
        L.control.zoom({ position: 'bottomright' }).addTo(mapInstance);
      }
      setTimeout(() => mapInstance.invalidateSize(), 200);
      setTimeout(() => mapInstance.invalidateSize(), 500);
    } catch (e) { console.warn('Map init failed:', e); }
    return;
  }

  loading.classList.add('hidden');

  try {
    if (!mapInstance) {
      mapInstance = L.map(canvas, { zoomControl: false, attributionControl: true, scrollWheelZoom: true, zoomSnap: 1, wheelPxPerZoomLevel: 120 }).setView([geo.lat, geo.lng], 5);
      const isDark = !document.body.classList.contains('light');
      L.tileLayer(cartoTileURL(isDark), {
        detectRetina:true, maxZoom: 19, subdomains: 'abcd', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      }).addTo(mapInstance);
      L.control.zoom({ position: 'bottomright' }).addTo(mapInstance);
    } else {
      mapInstance.setView([geo.lat, geo.lng], 5, { animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches, duration: .6 });
    }

    // Custom marker
    const markerIcon = L.divIcon({
      className: 'map-marker-custom',
      html: '<div class="map-pin"><div class="map-pin-dot"></div><div class="map-pin-ring"></div></div>',
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
    if (mapMarker) mapMarker.remove();
    mapMarker = L.marker([geo.lat, geo.lng], { icon: markerIcon }).addTo(mapInstance);
    mapMarker.bindPopup(`<strong>${esc(article.title)}</strong>${geo.display ? `<br><span style="font-size:12px;opacity:.7">${esc(geo.display.split(',').slice(0,3).join(','))}</span>` : ''}`).openPopup();

    // Multiple invalidateSize calls to handle CSS transition timing
    setTimeout(() => mapInstance.invalidateSize(), 100);
    setTimeout(() => mapInstance.invalidateSize(), 350);
    setTimeout(() => mapInstance.invalidateSize(), 700);
  } catch (e) {
    console.warn('Map render failed:', e);
    loading.querySelector('.map-loading-text').textContent = '❌ Map failed to render';
    loading.classList.remove('hidden');
  }
}

function closeMap() {
  mapRequest++;
  document.getElementById('mapOverlay').classList.remove('open');
}
document.getElementById('mapClose').addEventListener('click', closeMap);
document.getElementById('mapOverlay').addEventListener('click', ev => {
  if (ev.target === ev.currentTarget) closeMap();
});

// Prevent browser zoom on map (trackpad pinch-to-zoom sends wheel+ctrlKey)
const mapContainer = document.querySelector('.map-container');
mapContainer.addEventListener('wheel', ev => {
  if (ev.ctrlKey) ev.preventDefault();
}, { passive: false });
// Safari non-standard pinch events
mapContainer.addEventListener('gesturestart', ev => ev.preventDefault(), { passive: false });
mapContainer.addEventListener('gesturechange', ev => ev.preventDefault(), { passive: false });

// ── DYNAMIC KB HINTS ─────────────────────────────────────────────────────
function updateKbHints() {
  const feed = document.getElementById('feed');
  const card = getCurrentFeedCard();
  const a = card ? articles.find(x => x.id === card.dataset.id) : null;
  const mEl = document.getElementById('kbMapHint');
  if (mEl) mEl.style.display = (a?.src === 'how') ? '' : 'none';
}

// ── ON THIS DAY (Easter egg) ────────────────────────────────────────────────
// Wikipedia's daily "On this day" list, matched by exact page ID (worker/today.js).
// A card whose subject was born, died, happened or is celebrated today gets a
// badge that flips in once when the card is reached. In the unfiltered
// Wikipedia feed, one of today's articles is also slipped in now and then:
// every new card rolls independently (never a fixed spacing), with a short
// minimum gap so two never arrive close together. Average: about 1 in 40.
const TODAY_LABELS = {born: 'Born on this day', died: 'Died on this day', event: 'On this day', holiday: 'Celebrated today'};
const TODAY_CHANCE = 1 / 30, TODAY_MIN_GAP = 10;
let todayInfo = null, todayLoading = null, cardsSinceToday = 0;
function monthDay(date = new Date()) { return String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0'); }
function todayData() {
  const md = monthDay();
  if (todayInfo && todayInfo.md === md && todayInfo.lang === curLang) return todayInfo;
  loadToday();
  return null;
}
function loadToday() {
  const md = monthDay(), lang = curLang, key = lang + '|' + md;
  if (todayLoading === key || todayInfo?.md === md && todayInfo?.lang === lang) return;
  todayLoading = key;
  fetch(`/api/today?lang=${lang}&md=${md}`).then(r => r.ok ? r.json() : null).then(data => {
    if (!data || typeof data.matches !== 'object' || !Array.isArray(data.seeds) || lang !== curLang || md !== monthDay()) return;
    todayInfo = {md, lang, matches: data.matches, seeds: data.seeds.filter(validReserveArticle)};
    document.querySelectorAll('#feed .card[data-id]').forEach(decorateToday);
  }).catch(() => {}).finally(() => {
    // After a failure, allow one retry a minute later.
    if (todayInfo?.md !== md || todayInfo?.lang !== lang) setTimeout(() => { if (todayLoading === key) todayLoading = null; }, 60000);
  });
}
function todayShown(md) {
  const saved = lsGet('ws_today_shown');
  return new Set(saved?.md === md && Array.isArray(saved.ids) ? saved.ids : []);
}
function rollTodaySurprise() {
  cardsSinceToday++;
  if (curMode !== 'wiki' || curTopics.size || helpOnly() || depthLevel > 3 || articles.length < 3) return null;
  if (cardsSinceToday < TODAY_MIN_GAP || Math.random() >= TODAY_CHANCE) return null;
  const info = todayData(); if (!info) return null;
  const shown = todayShown(info.md);
  const pick = shuffled(info.seeds).find(a => !feedSeen.has(a.id) && !shown.has(a.id) && !articles.some(x => x.id === a.id));
  if (!pick) return null;
  feedSeen.add(pick.id); shown.add(pick.id);
  lsSet('ws_today_shown', {md: info.md, ids: [...shown].slice(-200)});
  cardsSinceToday = 0;
  return {...pick};
}
function withTodaySurprises(batch) {
  const out = [];
  for (const a of batch) {
    const surprise = rollTodaySurprise();
    if (surprise) out.push(surprise);
    if (todayInfo?.matches?.[a.id]) cardsSinceToday = 0; // natural matches count too
    out.push(a);
  }
  return out;
}
function decorateToday(card) {
  const id = card?.dataset?.id;
  if (!id || id[0] !== 'w' || card.classList.contains('is-today')) return;
  const match = todayData()?.matches?.[id];
  if (!match || !Object.hasOwn(TODAY_LABELS, match.k)) return;
  const badge = document.createElement('span');
  badge.className = 'today-badge';
  badge.innerHTML = '<span class="today-ico" aria-hidden="true">📅</span><span class="today-label"></span>';
  badge.querySelector('.today-label').textContent = TODAY_LABELS[match.k];
  if (Number.isInteger(match.y) && match.y > 0) {
    const year = document.createElement('span'); year.className = 'today-year'; year.textContent = String(match.y); badge.append(year);
  }
  const media = card.querySelector('.art-media');
  if (media) { const sheen = document.createElement('span'); sheen.className = 'today-sheen'; sheen.setAttribute('aria-hidden', 'true'); media.append(sheen, badge); }
  else card.querySelector('.meta-row')?.prepend(badge);
  card.classList.add('is-today');
  if (card === getCurrentFeedCard()) revealToday(card);
}
function revealToday(card) {
  if (card?.classList.contains('is-today') && !card.classList.contains('today-revealed')) card.classList.add('today-revealed');
}

// ── SCROLL-BASED VIEW TRACKING ──────────────────────────────────────────
// Record each viewed card once per session so history remains useful.
const _viewedIds = new Set();
function markViewed(card) {
  const id = card?.dataset?.id;
  if (!id || _viewedIds.has(id)) return;
  _viewedIds.add(id);
  bumpStat(id.startsWith('v') ? 'how' : 'wiki');
  const a = articles.find(x => x.id === id);
  if (a) trackHistory(a);
}
function trackScrollView() {
  const feed = document.getElementById('feed');
  const card = getCurrentFeedCard();
  if (card) { markViewed(card); revealToday(card); }
}

let _scrollTick = false;
document.getElementById('feed').addEventListener('scroll', () => {
  if (_scrollTick) return; // coalesce to one rAF per frame
  _scrollTick = true;
  requestAnimationFrame(() => { _scrollTick = false; updateKbHints(); trackScrollView(); });
}, { passive: true });

// ── INIT ────────────────────────────────────────────────────────────────────
loadPersistedState();
syncActivityDisplay();
loadToday();
updateOfflineBanner();
boot();
// Auto-focus feed so arrow keys work immediately on desktop
requestAnimationFrame(() => document.getElementById('feed').focus());
// Count the first card as viewed once it's rendered
setTimeout(() => {
  const first = document.querySelector('#feed .card');
  if (first) { markViewed(first); revealToday(first); }
}, 1500);

function openCollectionChooser(articleId) {
  const article=liked.get(articleId);if(!article)return;
  const dlg=document.createElement('dialog');dlg.className='source-dialog collection-dialog';
  dlg.innerHTML='<h2>Save to collection</h2><p class="collection-article"></p><p class="collection-guidance">Tap a collection below to add this article immediately.</p><div class="collection-options"></div><div class="collection-start collection-dialog-actions"><button class="collection-choice collection-create" type="button">＋ Create new collection</button><button class="source-close" type="button">Cancel</button></div><form hidden><label for="collectionChoiceName">Create a new collection</label><input id="collectionChoiceName" class="collection-name-input" placeholder="New collection name…" maxlength="30" required><div class="collection-dialog-actions"><button class="feature-action" type="submit">Create and save</button><button class="source-close collection-back" type="button">Back</button></div></form>';
  dlg.querySelector('.collection-article').textContent=article.title;
  const choices=dlg.querySelector('.collection-options');
  collections.forEach((col,i)=>{const b=document.createElement('button');b.type='button';b.className='collection-choice';b.textContent=col.name+(col.ids.includes(articleId)?' ✓ Added':' · Add here');b.disabled=col.ids.includes(articleId);b.onclick=()=>{addToCollection(i,articleId);dlg.close()};choices.append(b)});
  dlg.querySelector('form').onsubmit=e=>{e.preventDefault();const input=dlg.querySelector('input'),name=input.value.trim();if(!name){input.setCustomValidity('Enter a collection name');input.reportValidity();return}let idx=collections.findIndex(c=>c.name.toLowerCase()===name.toLowerCase());if(idx<0){collections.push({name,ids:[]});idx=collections.length-1}addToCollection(idx,articleId);dlg.close()};
  dlg.querySelector('input').oninput=e=>e.target.setCustomValidity('');
  const form=dlg.querySelector('form'),start=dlg.querySelector('.collection-start');
  if(!collections.length)dlg.querySelector('.collection-guidance').textContent='Create your first collection to organize this article.';
  dlg.querySelector('.collection-create').onclick=()=>{choices.hidden=true;start.hidden=true;form.hidden=false;dlg.querySelector('input').focus()};
  dlg.querySelector('.collection-back').onclick=()=>{form.hidden=true;choices.hidden=false;start.hidden=false;dlg.querySelector('.collection-create').focus()};
  start.querySelector('.source-close').onclick=()=>dlg.close();
  dlg.addEventListener('click',e=>{if(e.target===dlg){const r=dlg.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dlg.close()}});
  dlg.addEventListener('close',()=>setTimeout(()=>dlg.remove(),400)); // let the closing fade finish
  document.body.append(dlg);dlg.showModal();
}
