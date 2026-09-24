/* Presentation-only enhancements. Feed data, persistence and gesture physics live in app.js. */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const themeButton=document.getElementById('headerTheme');
  themeButton.addEventListener('click',()=>setTheme(!lightMode));
  // Keep mode labels accessible without changing the existing source-switch behavior.
  function sourceState() {
    themeButton.setAttribute('aria-pressed',String(lightMode));
    document.getElementById('wBtn').setAttribute('aria-pressed',curMode === 'wiki');
    document.getElementById('hBtn').setAttribute('aria-pressed',curMode === 'how');
    document.querySelector('meta[name="theme-color"][media="(prefers-color-scheme: dark)"]').content = lightMode ? '#ffffff' : '#101418';
    document.querySelector('meta[name="theme-color"][media="(prefers-color-scheme: light)"]').content = lightMode ? '#ffffff' : '#101418';
  }
  sourceState();
  new MutationObserver(sourceState).observe(document.body,{attributes:true,attributeFilter:['class']});
  // Label new live notifications for screen readers.
  new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
    if (node.nodeType === 1 && node.classList.contains('toast')) node.setAttribute('role','status');
  }))).observe(document.body,{childList:true});
  document.getElementById('offlineBanner').setAttribute('role','status');
})();
// Closed drawers must not remain in the keyboard or screen-reader navigation order.
for (const panel of document.querySelectorAll('#burgerMenu,#topicSheet,#lp,#hp,#settingsPanel')) {
  const sync = () => { panel.inert = !panel.classList.contains('open'); };
  sync(); new MutationObserver(sync).observe(panel,{attributes:true,attributeFilter:['class']});
}
// An open drawer receives keyboard focus and keeps it out of the feed behind
// its backdrop (the header stays reachable). When it closes, focus returns to
// the control that opened it, unless the app already moved focus on purpose
// (Escape focuses the feed so arrow keys keep working).
{
  const drawers = [...document.querySelectorAll('#burgerMenu,#topicSheet,#lp,#hp,#settingsPanel')];
  const focusable = 'button:not([disabled]), a[href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
  const openDrawer = () => drawers.find(drawer => drawer.classList.contains('open'));
  let current = null, trigger = null;
  const sync = () => {
    const open = openDrawer() || null;
    if (open && open !== current) {
      if (!current) trigger = document.activeElement;
      if (!open.contains(document.activeElement)) open.querySelector(focusable)?.focus({preventScroll: true});
    } else if (!open && current) {
      const active = document.activeElement;
      const lost = !active || active === document.body || drawers.some(drawer => drawer.contains(active));
      if (lost && trigger?.isConnected && !trigger.closest('[inert]')) trigger.focus({preventScroll: true});
      trigger = null;
    }
    current = open;
  };
  for (const drawer of drawers) new MutationObserver(sync).observe(drawer, {attributes: true, attributeFilter: ['class']});
  document.addEventListener('focusin', event => {
    const open = openDrawer();
    if (open && !open.contains(event.target) && !event.target.closest('.hdr, dialog')) open.querySelector(focusable)?.focus({preventScroll: true});
  });
}
// Menu buttons tell assistive technology whether the panel they open is showing.
for (const [buttonId, panelId] of [['langBtn','langDd'],['burgerBtn','burgerMenu'],['settingsBtn','settingsPanel'],['likesBtn','lp'],['topicsBtn','topicSheet'],['burgerLangBtn','burgerLangGrid'],['burgerTopicsBtn','burgerTopics']]) {
  const button = document.getElementById(buttonId), panel = document.getElementById(panelId);
  if (!button || !panel) continue;
  button.setAttribute('aria-controls', panelId);
  const sync = () => button.setAttribute('aria-expanded', String(panel.classList.contains('open')));
  sync(); new MutationObserver(sync).observe(panel,{attributes:true,attributeFilter:['class']});
}
// Only the card on screen is in the Tab order. Otherwise Tab walks through the
// buttons of every card rendered ahead and scrolls the feed to each of them.
function syncCardFocus(feed = document.getElementById('feed')) {
  const current = getCurrentFeedCard();
  for (const card of feed.querySelectorAll('.card[data-id]'))
    for (const control of card.querySelectorAll('button, a[href]'))
      if (card === current) control.removeAttribute('tabindex'); else control.tabIndex = -1;
}
{
  const feed = document.getElementById('feed');
  let frame = 0;
  const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; syncCardFocus(feed); }); };
  feed.addEventListener('scroll', schedule, {passive: true});
  new MutationObserver(schedule).observe(feed, {childList: true});
  schedule();
}

// Match excerpt length to whole lines of the available space, without inner scrolling.
const excerptObserver = new ResizeObserver(entries => {
  for (const {target} of entries) {
    // Use the whole space the card gives the excerpt; the old 4/6-line cap left
    // a third of many phone cards empty. The ceiling only guards very tall windows.
    const lines = Math.max(0, Math.min(innerWidth <= 767 ? 10 : 12, Math.floor(target.clientHeight / parseFloat(getComputedStyle(target).lineHeight))));
    target.style.setProperty('--excerpt-lines', Math.max(1, lines));
    target.firstElementChild.style.visibility = lines ? 'visible' : 'hidden';
    chooseExcerpt(target, lines);
  }
});
const observedExcerpts = new WeakSet();
function fitExcerpts() {
  document.querySelectorAll('#feed .art-body').forEach(body => {
    if (!body.dataset.fitted) {
      body.dataset.fitted = 'true';
      const text = document.createElement('span'); text.className = 'excerpt-fit';
      body.dataset.fullExcerpt = body.textContent;
      while(body.firstChild) text.appendChild(body.firstChild);
      body.appendChild(text);
    }
    if (!observedExcerpts.has(body)) {
      excerptObserver.observe(body);
      observedExcerpts.add(body);
    }
  });
}
new MutationObserver(records => {
  // ResizeObserver holds its observed elements. Release removed cards so long
  // discovery sessions do not retain their detached images and event handlers.
  for (const record of records) for (const node of record.removedNodes) {
    if (node.nodeType !== 1 || node.isConnected) continue;
    const bodies = [...node.querySelectorAll('.art-body')];
    if (node.matches('.art-body')) bodies.push(node);
    for (const body of bodies) {
      excerptObserver.unobserve(body);
      observedExcerpts.delete(body);
    }
  }
  fitExcerpts();
}).observe(document.getElementById('feed'), {childList:true,subtree:true});
fitExcerpts();

function chooseExcerpt(body, lines) {
  const span=body.firstElementChild, full=body.dataset.fullExcerpt || '';
  if (!span || !full || !lines) return;
  const clean=full.replace(/\s+/g,' ').trim();
  const segments=typeof Intl.Segmenter==='function' ? Array.from(new Intl.Segmenter(curLang,{granularity:'sentence'}).segment(clean),x=>x.segment.trim()) : clean.match(/[^.!?。！？]+[.!?。！？]+(?:\s|$)/g)||[clean];
  // Introductions longer than the source limit end in a cut-off fragment ("…").
  if(segments.length>1&&/(\.\.\.|…)$/.test(segments.at(-1)))segments.pop();
  const height=lines*parseFloat(getComputedStyle(body).lineHeight)+1;
  let best='';
  for(const sentence of segments){
    const candidate=(best+' '+sentence).trim();span.textContent=candidate;
    if(span.scrollHeight>height)break;
    best=candidate;
  }
  if(best && /[.!?。！？][”'"）)]*$/.test(best)){span.textContent=best;return;}
  // An unusually long first sentence: retain a coherent word boundary and ellipsis.
  const words=typeof Intl.Segmenter==='function' ? Array.from(new Intl.Segmenter(curLang,{granularity:'word'}).segment(clean),part=>part.segment) : clean.match(/\S+\s*/g)||[clean];let lo=0,hi=words.length;
  while(lo<hi){const mid=Math.ceil((lo+hi)/2);span.textContent=words.slice(0,mid).join('').trimEnd()+'…';if(span.scrollHeight<=height)lo=mid;else hi=mid-1;}
  span.textContent=words.slice(0,lo).join('').trimEnd().replace(/[,;:]$/,'')+'…';
}

// Ambient mode shows the whole sentences that fit the screen, like the cards:
// no hidden scrolling and no text cut off mid-line on small screens.
const ambientOverlay = document.getElementById('ambientOverlay');
const ambientContent = ambientOverlay.querySelector('.ambient-content');
const ambientExcerpt = document.getElementById('ambientExcerpt');
let ambientFull = '';
function fitAmbient() {
  if (!ambientOverlay.classList.contains('open') || !ambientFull) return;
  const overflows = () => ambientContent.scrollHeight > ambientContent.clientHeight + 1;
  const clean = ambientFull.replace(/\s+/g, ' ').trim();
  const sentences = typeof Intl.Segmenter === 'function' ? Array.from(new Intl.Segmenter(curLang, {granularity: 'sentence'}).segment(clean), x => x.segment.trim()) : clean.match(/[^.!?。！？]+[.!?。！？]+(?:\s|$)/g) || [clean];
  // Introductions longer than the source limit end in a cut-off fragment ("…").
  if (sentences.length > 1 && /(\.\.\.|…)$/.test(sentences.at(-1))) sentences.pop();
  ambientExcerpt.textContent = sentences.join(' ');
  if (!overflows()) return;
  let best = '';
  for (const sentence of sentences) {
    ambientExcerpt.textContent = (best + ' ' + sentence).trim();
    if (overflows()) break;
    best = ambientExcerpt.textContent;
  }
  if (best) { ambientExcerpt.textContent = best; return; }
  // An unusually long first sentence: keep whole words and end with an ellipsis.
  const words = clean.split(' ');
  let lo = 0, hi = words.length;
  while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); ambientExcerpt.textContent = words.slice(0, mid).join(' ') + '…'; if (overflows()) hi = mid - 1; else lo = mid; }
  ambientExcerpt.textContent = words.slice(0, lo).join(' ').replace(/[,;:]$/, '') + '…';
}
new MutationObserver(() => {
  if (!ambientOverlay.classList.contains('open')) { ambientFull = ''; return; }
  if (!ambientFull) { ambientFull = ambientExcerpt.textContent; fitAmbient(); }
}).observe(ambientOverlay, {attributes: true, attributeFilter: ['class']});
addEventListener('resize', fitAmbient);

// Dismiss only genuine backdrop clicks, preserving interaction inside the dialog.
const sourceDialog = document.getElementById('sourceDialog');
sourceDialog.addEventListener('click', event => {
  if (event.target !== sourceDialog) return;
  const bounds = sourceDialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right ||
      event.clientY < bounds.top || event.clientY > bounds.bottom) sourceDialog.close();
});

// Put the active source's statistics first on both settings surfaces.
for (const [counter, parent] of [['streakCount','.burger-inner'],['dkStreakCount','#settingsPanel']]) {
 const section=document.getElementById(counter).closest(counter==='streakCount'?'.burger-row':'.sp-section');
 section.classList.add('platform-stats');
 const label=document.createElement('p');label.className='stats-source';
 section.prepend(label);
 const container=document.querySelector(parent);
 if(counter==='dkStreakCount')container.querySelector('.sp-hdr').after(section);else container.prepend(section);
}
syncActivityDisplay();

// Keep the same article visible when rotation, window resizing or folding
// changes card height. No feed reset or network reload is needed.
function installViewportContinuity(feed,win=window){
  let anchor=getCurrentFeedCard(),frame=0,resizing=false;
  feed.addEventListener('scroll',()=>{if(!resizing)anchor=getCurrentFeedCard();},{passive:true});
  win.addEventListener('feed-reset',()=>{anchor=null;});
  win.addEventListener('resize',()=>{
    resizing=true;if(frame)cancelAnimationFrame(frame);
    frame=requestAnimationFrame(()=>{
      if(anchor?.isConnected&&feed.contains(anchor)){
        const snap=feed.style.scrollSnapType;feed.style.scrollSnapType='none';
        feed.scrollTop=feedCardTop(anchor);feed.style.scrollSnapType=snap;
      }
      resizing=false;frame=0;anchor=getCurrentFeedCard();
    });
  });
}
installViewportContinuity(document.getElementById('feed'));
