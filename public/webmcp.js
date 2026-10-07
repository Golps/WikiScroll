// WebMCP (https://webmachinelearning.github.io/webmcp/): the reader's key
// actions as tools for an AI assistant working in this browser tab. Only
// registered where the browser offers the API; nothing runs elsewhere.
// Everything stays in the page: tools read the feed and the reader's own saves
// and never send them anywhere; travel search uses WikiScroll's /api/travel.
(() => {
  const context = document.modelContext || navigator.modelContext;
  if (!context || typeof context.registerTool !== 'function') return;
  const controller = new AbortController();
  addEventListener('pagehide', () => controller.abort(), {once: true});

  // Tool results as MCP text content (what current implementations read).
  const result = data => ({content: [{type: 'text', text: JSON.stringify(data)}]});
  const source = a => a.src === 'how' ? 'Wikivoyage' : 'Wikipedia';
  const describe = a => a && {title: a.title, summary: String(a.body || '').slice(0, 600), source: source(a), url: a.url, saved: liked.has(savedKey(a))};
  const current = () => { const card = getCurrentFeedCard(); return card && articles.find(a => a.id === card.dataset.id); };
  const settle = ms => new Promise(resolve => setTimeout(resolve, ms));

  const tools = [
    {
      name: 'get_current_article',
      title: 'Current article',
      description: 'Returns the article card the reader is looking at in WikiScroll: title, short introduction, source (Wikipedia or Wikivoyage), link to the full article, and whether it is saved.',
      inputSchema: {type: 'object', properties: {}},
      annotations: {readOnlyHint: true, untrustedContentHint: true},
      execute: async () => result(describe(current()) || {error: 'No article is on screen yet.'}),
    },
    {
      name: 'move_to_article',
      title: 'Next or previous article',
      description: 'Scrolls the WikiScroll feed to the next or previous article card and returns that article.',
      inputSchema: {type: 'object', properties: {direction: {type: 'string', enum: ['next', 'previous'], description: 'Which way to move. Defaults to next.'}}},
      annotations: {untrustedContentHint: true},
      execute: async input => {
        const feed = document.getElementById('feed');
        ensureFeedAhead();
        const cards = Array.from(feed.querySelectorAll('.card[data-id]'));
        const target = cards[cards.indexOf(getCurrentFeedCard()) + (input?.direction === 'previous' ? -1 : 1)];
        if (!target) return result({error: input?.direction === 'previous' ? 'This is the first article.' : 'The next article is still loading. Try again in a moment.'});
        feed.scrollTo({top: feedCardTop(target), behavior: 'instant'});
        await settle(120);
        return result(describe(articles.find(a => a.id === target.dataset.id)));
      },
    },
    {
      name: 'save_current_article',
      title: 'Save article',
      description: 'Saves the article on screen to the reader\'s Saved Articles in this browser (never removes a save). Saved articles are available offline.',
      inputSchema: {type: 'object', properties: {}},
      execute: async () => {
        const a = current();
        if (!a) return result({error: 'No article is on screen yet.'});
        if (!liked.has(savedKey(a))) toggleLike(a.id);
        return result({saved: true, title: a.title, url: a.url});
      },
    },
    {
      name: 'list_saved_articles',
      title: 'Saved articles',
      description: 'Lists the articles the reader saved in WikiScroll on this browser, newest first.',
      inputSchema: {type: 'object', properties: {limit: {type: 'integer', minimum: 1, maximum: 100, description: 'How many to return. Defaults to 20.'}}},
      annotations: {readOnlyHint: true, untrustedContentHint: true},
      execute: async input => {
        const limit = Math.min(100, Math.max(1, Number.isInteger(input?.limit) ? input.limit : 20));
        return result([...liked.values()].reverse().slice(0, limit).map(a => ({title: a.title, source: source(a), url: a.url})));
      },
    },
    {
      name: 'find_travel_guides',
      title: 'Find travel guides',
      description: 'Searches Wikivoyage travel guides about a place (a country, region or city; several places can be separated by commas), optionally for a trip style. Returns guide titles, short introductions and links. Does not change what the reader is viewing.',
      inputSchema: {type: 'object', properties: {
        place: {type: 'string', minLength: 1, maxLength: 80, description: 'Place to search, for example "Japan" or "Tuscany, Provence".'},
        style: {type: 'string', enum: ['nature', 'coast', 'culture', 'city'], description: 'Optional trip style.'},
      }, required: ['place']},
      annotations: {readOnlyHint: true, untrustedContentHint: true},
      execute: async (input, options) => {
        const place = String(input?.place || '').trim().slice(0, 80);
        if (!place) return result({error: 'Give a place to search.'});
        const style = ['nature', 'coast', 'culture', 'city'].includes(input?.style) ? input.style : '';
        const params = new URLSearchParams({lang: voyageLang(), place, style, offset: '0'});
        const signal = options?.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000);
        const response = await fetch('/api/travel?' + params, {signal});
        if (!response.ok) return result({error: 'Travel search is temporarily unavailable. Try again shortly.'});
        const data = await response.json();
        const guides = (data.articles || []).slice(0, 10).map(a => ({title: a.title, summary: String(a.body || '').slice(0, 300), url: a.url}));
        return result(guides.length ? {guides} : {guides, ...(data.suggestion ? {suggestion: data.suggestion} : {}), note: 'No guides matched on the first page.'});
      },
    },
  ];

  for (const tool of tools) {
    try {
      // Older previews return a handle with unregister() instead of honoring the signal.
      Promise.resolve(context.registerTool(tool, {signal: controller.signal})).then(handle => {
        if (typeof handle?.unregister === 'function') controller.signal.addEventListener('abort', () => handle.unregister(), {once: true});
      }, () => {});
    } catch {}
  }
})();
