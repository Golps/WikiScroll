/* Local, deterministic UI localization. Never sends article or collection text to a translation service. */
(() => {
  const dictionaries = window.WS_TRANSLATIONS || {};
  let language = 'en';
  const originals = new WeakMap(), attributes = new WeakMap();
  const excluded = 'script,style,noscript,svg,textarea,.art-title,.art-body,.li-ttl,.li-body,.hi-ttl,.hi-body,.coll-tab:not([data-cid="null"]),#ambientTitle,#ambientExcerpt,#mapTitle,#mapBadgeText,#privacyDialog,#aboutDialog,.sp-about-logo,.logo,.lopt,.blopt,#langTxt,#burgerLangTxt,.kb-key';
  // Messages that embed a collection name or a count. The dictionaries hold
  // one template per message ("Added to \"{name}\""); the value is kept as typed.
  const templates = [
    [/^Collection "(.+)" created$/u, 'Collection "{name}" created', 'name'],
    [/^Added to "(.+)"$/u, 'Added to "{name}"', 'name'],
    [/^(.+) · Add here$/u, '{name} · Add here', 'name'],
    [/^(.+) ✓ Added$/u, '{name} ✓ Added', 'name'],
    [/^Save “(.+)”\?$/u, 'Save “{name}”?', 'name'],
    [/^Add (\d+) articles to a new collection on this device\.$/u, 'Add {count} articles to a new collection on this device.', 'count'],
  ];
  const aliases = {'Article depth':'Article Depth','Reading history':'History','Explore on Map':'Map','New collection name':'New collection name…','Ambient Mode':'Ambient','LIKE':'Like','SKIP':'Skip','Close settings':'Settings','Close saved articles':'Saved Articles','Close history':'History','Close map':'Map','Close ambient mode':'Ambient','Close source guide':'Close','Toggle swipe gestures':'Swipe Gestures','Toggle light mode':'Light Mode','Toggle keyboard hints':'Show Keyboard Hints','About Wikipedia and Wikivoyage':'About'};
  function translate(source, lang = language) {
    const words = dictionaries[lang];
    if (!words) return source;
    const leading = source.match(/^\s*/)[0], trailing = source.match(/\s*$/)[0];
    let key = source.trim(), prefix = '', suffix = '';
    if (!key) return source;
    for (const brand of ['Wikipedia · ','Wikivoyage · ']) if (key.startsWith(brand)) { prefix=brand; key=key.slice(brand.length); break; }
    const count=key.match(/^(.*?\d+) articles$/);
    if(count)return leading+count[1]+' '+words.Articles+trailing;
    const streak=key.match(/^· (\d+)-day streak$/);
    if(streak)return '· 🔥 '+new Intl.NumberFormat(lang,{style:'unit',unit:'day',unitDisplay:'short'}).format(Number(streak[1]));
    const depth=key.match(/^🔭 Depth: (.+)$/);
    if(depth)return '🔭 '+words['Article Depth']+': '+(words[depth[1]]||depth[1]);
    // Preserve icon glyphs, keyboard decorations and numeric counters around UI labels.
    const decorated = key.match(/^([^\p{L}\p{N}]*)(.*?)(\s*[›✕↗]+)?$/u);
    if (decorated) { prefix += decorated[1]; key=decorated[2]; suffix=decorated[3]||''; }
    for (const [pattern, template, slot] of templates) {
      const match = key.match(pattern);
      if (match && words[template]) return leading+prefix+words[template].replace('{'+slot+'}', () => match[1])+suffix+trailing;
    }
    const result=words[key] || words[aliases[key]];
    return result ? leading+prefix+result+suffix+trailing : source;
  }
  function text(node) {
    if (!node.parentElement || node.parentElement.closest(excluded)) return;
    const previous=originals.get(node), current=node.nodeValue;
    const source=previous && previous.rendered===current ? previous.source : current;
    const isHistoryTopic=node.parentElement.closest('[data-tid="history"],.cat-tag') && source.trim().endsWith('History');
    const rendered=isHistoryTopic && dictionaries[language] ? source.replace('History',dictionaries[language]['Topic history']) : translate(source);
    originals.set(node,{source,rendered});
    if(current!==rendered) node.nodeValue=rendered;
  }
  function element(el) {
    if (el.closest(excluded)) return;
    if(el.classList.contains('card'))el.dataset.discoverHint=translate('Follow your curiosity')+' ↓';
    const saved=attributes.get(el)||{};
    for(const name of ['aria-label','title','placeholder']) {
      const current=el.getAttribute(name); if(current===null)continue;
      const previous=saved[name],source=previous&&previous.rendered===current?previous.source:current;
      const rendered=translate(source); saved[name]={source,rendered};
      if(current!==rendered)el.setAttribute(name,rendered);
    }
    attributes.set(el,saved);
  }
  function apply(root=document.body) {
    if (!root)return;
    if(root.nodeType===3){text(root);return;}
    if(root.nodeType!==1 || root.closest(excluded))return;
    element(root);
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT,{
      acceptNode:node=>node.nodeType===1 && node.matches(excluded)?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT
    });
    while(walker.nextNode()) {const node=walker.currentNode;node.nodeType===3?text(node):element(node);}
  }
  window.WSI18n={translate,apply,setLanguage(lang){
    language=lang==='en'||dictionaries[lang]?lang:'en';
    document.documentElement.lang=language;
    // Preserve physical swipe directions; mirror reading controls, not navigation physics.
    document.body.classList.toggle('rtl-ui',['ar','he'].includes(language));
    apply();
  }};
  new MutationObserver(records=>{
    const roots=new Set();
    for(const record of records){
      if(record.type==='childList')for(const node of record.addedNodes)roots.add(node);
      else roots.add(record.target);
    }
    for(const node of roots)if(node.isConnected)apply(node);
  }).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-label','title','placeholder']});
})();
