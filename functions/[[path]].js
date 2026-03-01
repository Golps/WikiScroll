/**
 * WikiScroll — Cloudflare Pages Function
 * 
 * Intercepts requests with ?a= parameter from social media crawlers
 * and injects dynamic Open Graph tags so shared links show the actual
 * article title, description, and image instead of the generic WikiScroll preview.
 * 
 * SETUP: Place this file at functions/[[path]].js in your Cloudflare Pages project.
 * Cloudflare Pages automatically deploys it as a serverless function.
 * No extra configuration needed — it just works with your existing Pages deployment.
 * 
 * HOW IT WORKS:
 * 1. User shares wikiscroll.com/?a=w12345
 * 2. iMessage/Twitter/Slack crawler fetches that URL
 * 3. This function detects the crawler by User-Agent
 * 4. Fetches article metadata from Wikipedia/Wikivoyage API
 * 5. Returns modified HTML with article-specific OG tags
 * 6. Crawler sees: "The Great Barrier Reef — WikiScroll" with the article's image
 * 7. Regular users get the normal page (function passes through)
 */

// Bot user-agent patterns for social media crawlers
const BOT_PATTERNS = [
  'facebookexternalhit',
  'Facebot',
  'Twitterbot',
  'LinkedInBot',
  'Slackbot',
  'Discordbot',
  'WhatsApp',
  'TelegramBot',
  'Applebot',        // iMessage link previews
  'iMessageBot',
  'Googlebot',
  'bingbot',
  'Pinterestbot',
  'redditbot',
];

function isBot(userAgent) {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return BOT_PATTERNS.some(bot => ua.includes(bot.toLowerCase()));
}

async function fetchArticleMeta(articleId) {
  const prefix = articleId.charAt(0); // 'w' or 'v'
  const pageId = articleId.slice(1);
  
  if (!pageId || (prefix !== 'w' && prefix !== 'v')) return null;

  const domain = prefix === 'w' 
    ? 'en.wikipedia.org' 
    : 'en.wikivoyage.org';

  const apiUrl = `https://${domain}/w/api.php?` + new URLSearchParams({
    action: 'query',
    pageids: pageId,
    prop: 'extracts|pageimages|info',
    exintro: '1',
    explaintext: '1',
    piprop: 'thumbnail',
    pithumbsize: '1200',
    inprop: 'url',
    format: 'json',
    origin: '*',
  });

  try {
    const resp = await fetch(apiUrl, {
      headers: { 'User-Agent': 'WikiScroll/1.0 (https://wikiscroll.com)' },
    });
    if (!resp.ok) return null;
    
    const data = await resp.json();
    const pages = data?.query?.pages;
    if (!pages) return null;
    
    const page = Object.values(pages)[0];
    if (!page || page.missing !== undefined) return null;

    return {
      title: page.title || 'WikiScroll',
      description: (page.extract || '').slice(0, 200).replace(/\n/g, ' '),
      image: page.thumbnail?.source || 'https://wikiscroll.com/og-image.png',
      url: page.fullurl || `https://${domain}/wiki/${encodeURIComponent(page.title)}`,
      source: prefix === 'w' ? 'Wikipedia' : 'Wikivoyage',
    };
  } catch {
    return null;
  }
}

function buildOgHtml(meta, originalUrl) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const title = esc(`${meta.title} — WikiScroll`);
  const desc = esc(meta.description || `Discover "${meta.title}" on WikiScroll — swipe through ${meta.source} articles in a beautiful feed.`);
  const img = esc(meta.image);
  const url = esc(originalUrl);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <meta name="description" content="${desc}">
  
  <!-- Open Graph -->
  <meta property="og:type" content="article">
  <meta property="og:url" content="${url}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${desc}">
  <meta property="og:image" content="${img}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${esc(meta.title)}">
  <meta property="og:site_name" content="WikiScroll">
  
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${desc}">
  <meta name="twitter:image" content="${img}">
  <meta name="twitter:image:alt" content="${esc(meta.title)}">
  
  <!-- Redirect real users (JS-capable) to the actual page -->
  <meta http-equiv="refresh" content="0;url=${url}">
  <script>window.location.replace("${url.replace(/"/g, '\\"')}");</script>
</head>
<body>
  <h1>${title}</h1>
  <p>${desc}</p>
  <p><a href="${url}">Read on WikiScroll</a></p>
</body>
</html>`;
}

export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);
  const articleId = url.searchParams.get('a');

  // No article param — pass through normally
  if (!articleId) {
    return next();
  }

  const userAgent = request.headers.get('User-Agent') || '';

  // Regular user — pass through (client-side JS handles ?a= param)
  if (!isBot(userAgent)) {
    return next();
  }

  // Bot detected with ?a= param — fetch article and serve OG tags
  const meta = await fetchArticleMeta(articleId);
  
  if (!meta) {
    // Couldn't fetch article — pass through with default OG tags
    return next();
  }

  const html = buildOgHtml(meta, url.toString());
  
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html;charset=UTF-8',
      'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
    },
  });
}
