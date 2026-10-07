// Markdown for agents (Cloudflare's own converter needs the Pro plan): a
// request whose Accept header prefers text/markdown gets the page as Markdown;
// browsers, which ask for text/html first, keep getting HTML.

// Same preferences as robots.txt.
export const CONTENT_SIGNAL = 'search=yes, ai-input=yes, ai-train=no';

// True when text/markdown is accepted at least as strongly as text/html.
export function wantsMarkdown(accept) {
  let markdown = -1, html = -1;
  for (const part of String(accept || '').toLowerCase().split(',')) {
    const [type, ...params] = part.trim().split(';').map(s => s.trim());
    const qParam = params.find(p => p.startsWith('q='));
    const q = qParam ? Number(qParam.slice(2)) : 1;
    if (!Number.isFinite(q)) continue;
    if (type === 'text/markdown') markdown = Math.max(markdown, q);
    if (type === 'text/html') html = Math.max(html, q);
  }
  return markdown > 0 && markdown >= html;
}

const ENTITIES = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', mdash: '—', ndash: '–', hellip: '…', rarr: '→', middot: '·', copy: '©'};
const decode = s => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e.toLowerCase()] ?? m);

// The site's own static pages use a small set of elements: headings,
// paragraphs, lists, links, emphasis and images. Anything else keeps its text.
export function htmlToMarkdown(html, base) {
  let s = String(html);
  const title = decode((s.match(/<title>([^<]*)<\/title>/i)?.[1] || '').trim());
  s = s.replace(/^[^]*?<body[^>]*>/i, '').replace(/<\/body>[^]*$/i, '');
  s = s.replace(/<(script|style|template|noscript|svg)\b[^>]*>[^]*?<\/\1>/gi, '');
  s = s.replace(/<header\b[^>]*>[^]*?<\/header>/gi, '');
  const inline = t => decode(t
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([^]*?)<\/a>/gi, (m, href, text) => {
      const label = text.replace(/<[^>]+>/g, '').trim();
      let url = href; try { url = new URL(decode(href), base).href; } catch {}
      return label ? `[${label}](${url})` : '';
    })
    .replace(/<(strong|b)\b[^>]*>([^]*?)<\/\1>/gi, '**$2**')
    .replace(/<(em|i)\b[^>]*>([^]*?)<\/\1>/gi, '_$2_')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')).replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
  const blocks = [];
  s.replace(/<(h[1-6]|p|li)\b[^>]*>([^]*?)<\/\1>/gi, (m, tag, body) => {
    const text = inline(body);
    if (!text) return m;
    tag = tag.toLowerCase();
    if (tag[0] === 'h') blocks.push('#'.repeat(Number(tag[1])) + ' ' + text);
    else if (tag === 'li') blocks.push('- ' + text);
    else blocks.push(text);
    return m;
  });
  // List items sit together; everything else is separated by a blank line.
  let out = '';
  blocks.forEach((b, i) => { out += (i ? (b.startsWith('- ') && blocks[i - 1].startsWith('- ') ? '\n' : '\n\n') : '') + b; });
  return (title && !out.startsWith('# ') ? `# ${title}\n\n` : '') + out + '\n';
}

export function markdownResponse(markdown, head) {
  return new Response(head ? null : markdown, {headers: {
    'Content-Type': 'text/markdown; charset=utf-8',
    'Cache-Control': 'no-cache',
    'Vary': 'Accept, User-Agent',
    // A rough count, as Cloudflare's converter reports: about 4 characters per token.
    'x-markdown-tokens': String(Math.ceil(markdown.length / 4)),
    'Content-Signal': CONTENT_SIGNAL,
  }});
}
