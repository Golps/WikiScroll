import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker from '../worker/index.js';
import {wantsMarkdown, htmlToMarkdown} from '../worker/markdown.js';

const read = p => fs.readFileSync(new URL('../public/' + p, import.meta.url), 'utf8');
const files = {'/': read('index.html'), '/index.html': read('index.html'), '/llms.txt': read('llms.txt'), '/about/': read('about/index.html')};
const allow = {limit: async () => ({success: true})};
const env = {REQUEST_LIMIT: allow, WORK_LIMIT: allow, RENDER_LIMIT: allow, ASSETS: {fetch: async request => {
  const path = new URL(request.url).pathname, body = files[path];
  return body == null ? new Response('missing', {status: 404}) : new Response(body, {headers: {'Content-Type': path.endsWith('.txt') ? 'text/plain' : 'text/html; charset=utf-8'}});
}}};
const get = (path, accept, method = 'GET') => worker.fetch(new Request('https://wikiscroll.com' + path, {method, headers: accept ? {Accept: accept} : {}}), env, {waitUntil() {}});
const BROWSER = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8';

test('Accept decides: Markdown only when it is preferred at least as much as HTML', () => {
  assert.equal(wantsMarkdown('text/markdown'), true);
  assert.equal(wantsMarkdown('text/markdown, text/html;q=0.9'), true);
  assert.equal(wantsMarkdown(BROWSER), false);
  assert.equal(wantsMarkdown('*/*'), false);
  assert.equal(wantsMarkdown('text/markdown;q=0'), false);
  assert.equal(wantsMarkdown(''), false);
});

test('agents asking for Markdown get the home page as llms.txt and About converted', async () => {
  const home = await get('/', 'text/markdown');
  assert.match(home.headers.get('Content-Type'), /^text\/markdown; charset=utf-8/);
  assert.match(home.headers.get('Vary'), /Accept/);
  assert.equal(home.headers.get('Content-Signal'), 'search=yes, ai-input=yes, ai-train=no');
  const text = await home.text();
  assert.equal(text, files['/llms.txt']);
  assert.equal(home.headers.get('x-markdown-tokens'), String(Math.ceil(text.length / 4)));
  const about = await (await get('/about/', 'text/markdown')).text();
  assert.match(about, /^# Turn doomscrolling into discovery\n\n/);
  assert.match(about, /\n## Two ways to explore\n\n- \*\*Wikipedia:\*\* discover/);
  assert.match(about, /\[GitHub\]\(https:\/\/github\.com\/Golps\/WikiScroll\)/);
  assert.doesNotMatch(about, /<[a-z/]/i, 'no HTML left');
  assert.equal(await (await get('/about/', 'text/markdown', 'HEAD')).text(), '');
});

test('browsers keep getting HTML, marked as varying by Accept', async () => {
  for (const path of ['/', '/about/']) {
    for (const accept of [BROWSER, null]) {
      const response = await get(path, accept);
      assert.match(response.headers.get('Content-Type'), /text\/html/, path);
      assert.match(response.headers.get('Vary'), /Accept/, path);
      assert.match(await response.text(), /<html/i);
    }
  }
});

test('the Worker sees About requests, so it can answer in Markdown', () => {
  const config = fs.readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  for (const path of ['/', '/about', '/about/', '/about/index.html']) assert.match(config, new RegExp(`"run_worker_first": \\[[^\\]]*"${path.replace(/\//g, '\\/')}"`));
});

test('the converter keeps text from elements it does not know and drops scripts', () => {
  const md = htmlToMarkdown('<html><head><title>T</title></head><body><script>x()</script><p>A &amp; <em>b</em> <a href="/x">link</a></p></body></html>', 'https://wikiscroll.com/');
  assert.equal(md, '# T\n\nA & _b_ [link](https://wikiscroll.com/x)\n');
});

test('the homepage advertises its machine-readable description in Link headers, and nothing else does', async () => {
  const expected = '</llms.txt>; rel="describedby"; type="text/markdown", </about/>; rel="service-doc"; type="text/html", </>; rel="alternate"; type="text/markdown"';
  for (const accept of [BROWSER, 'text/markdown', null]) assert.equal((await get('/', accept)).headers.get('Link'), expected, String(accept));
  assert.equal((await get('/', BROWSER, 'HEAD')).headers.get('Link'), expected);
  assert.equal((await get('/about/', BROWSER)).headers.get('Link'), null);
  assert.doesNotMatch(expected, /api-catalog|service-desc/, 'the private API is not advertised');
});
