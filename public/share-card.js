/* Branded share image, drawn on the device: the article photo, the serif
   title, a short excerpt and the WikiScroll wordmark. Nothing is uploaded. The image is prepared ahead of time (the
   current card, or a pressed Share button) because browsers only allow a
   share sheet right after a tap; doShare() uses it when it is ready and
   shares the plain link otherwise. Keep this layout in step with any
   server-drawn link preview so both look the same. */
(() => {
  const W = 1080, H = 1350, PAD = 72, PHOTO_H = 760;
  const INK = '#edf0f5', MUTED = '#aab5c5', PAPER = '#11151b', RULE = '#343e4d';
  const SERIF = 'Georgia, "Times New Roman", serif';
  const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
  const cache = new Map();
  let wordmark = null, timer = 0;

  function loadImage(src, cors) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      if (cors) img.crossOrigin = 'anonymous';
      const fail = setTimeout(() => reject(Error('Image timed out')), 6000);
      img.onload = () => { clearTimeout(fail); resolve(img); };
      img.onerror = () => { clearTimeout(fail); reject(Error('Image failed')); };
      img.src = src;
    });
  }

  // Words for spaced scripts, single characters for Chinese and Japanese.
  function tokens(text) {
    if (typeof Intl.Segmenter === 'function') {
      return [...new Intl.Segmenter(undefined, {granularity: 'word'}).segment(text)].map(s => s.segment);
    }
    return text.split(/(\s+)/);
  }
  function wrap(ctx, text, width, maxLines) {
    const lines = [];let line = '';
    for (const token of tokens(text.replace(/\s+/g, ' ').trim())) {
      const next = line + token;
      if (ctx.measureText(next).width <= width || !line.trim()) { line = next; continue; }
      lines.push(line.trim()); line = token.trimStart();
      if (lines.length === maxLines) break;
    }
    if (lines.length < maxLines && line.trim()) lines.push(line.trim());
    const clipped = lines.join(' ').length < text.replace(/\s+/g, ' ').trim().length;
    if (clipped && lines.length) {
      let last = lines[lines.length - 1];
      while (last && ctx.measureText(last + '…').width > width) last = last.slice(0, -1);
      lines[lines.length - 1] = last.replace(/[\s,;:.–—-]+$/, '') + '…';
    }
    return lines;
  }
  function cover(ctx, img, x, y, w, h) {
    const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }
  function contain(ctx, img, x, y, w, h) {
    const s = Math.min(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }

  async function draw(a) {
    const canvas = document.createElement('canvas');canvas.width = W;canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = PAPER;ctx.fillRect(0, 0, W, H);
    let photo = null;
    if (a.img && /^https:\/\//.test(a.img)) photo = await loadImage(a.img, true).catch(() => null);
    wordmark ||= await loadImage('/images/wordmark-dark.svg', false).catch(() => null);
    let y = 110;
    if (photo) {
      // Blurred fill behind a whole, uncropped photo. Scaling a tiny copy up
      // blurs in every browser, including those without canvas filters.
      const tiny = document.createElement('canvas');tiny.width = 24;tiny.height = Math.round(24 * PHOTO_H / W);
      cover(tiny.getContext('2d'), photo, 0, 0, tiny.width, tiny.height);
      ctx.imageSmoothingEnabled = true;ctx.imageSmoothingQuality = 'high';ctx.drawImage(tiny, 0, 0, W, PHOTO_H);
      ctx.fillStyle = 'rgba(17,21,27,.45)';ctx.fillRect(0, 0, W, PHOTO_H);
      // Fill the frame when cropping costs little; show odd shapes whole.
      const fit = (photo.naturalWidth / photo.naturalHeight) / (W / PHOTO_H);
      (fit > 0.7 && fit < 1.45 ? cover : contain)(ctx, photo, 0, 0, W, PHOTO_H);
      const fade = ctx.createLinearGradient(0, PHOTO_H - 90, 0, PHOTO_H);
      fade.addColorStop(0, 'rgba(17,21,27,0)');fade.addColorStop(1, PAPER);
      ctx.fillStyle = fade;ctx.fillRect(0, PHOTO_H - 90, W, 90);
      y = PHOTO_H + 10;
    }
    const rtl = RTL.test(a.title + a.body);
    ctx.direction = rtl ? 'rtl' : 'ltr';ctx.textAlign = rtl ? 'right' : 'left';ctx.textBaseline = 'alphabetic';
    const x = rtl ? W - PAD : PAD, width = W - PAD * 2;
    // Title and excerpt; without a photo the pair is centred above the footer.
    const titleSize = photo ? 76 : 96, titleFont = `400 ${titleSize}px ${SERIF}`, bodyFont = `400 34px ${SANS}`;
    ctx.font = titleFont;const titleLines = wrap(ctx, a.title, width, photo ? 3 : 5);
    ctx.font = bodyFont;const bodyLines = wrap(ctx, a.body || '', width, photo ? 3 : 6);
    const block = titleLines.length * titleSize * 1.1 + 34 + bodyLines.length * 50;
    if (!photo) y = Math.max(y, Math.round((H - 150 - block) / 2));
    ctx.fillStyle = INK;ctx.font = titleFont;
    for (const line of titleLines) { y += titleSize * 1.1;ctx.fillText(line, x, y); }
    y += 34;
    ctx.fillStyle = MUTED;ctx.font = bodyFont;
    for (const line of bodyLines) { if (y + 50 > H - 190) break;y += 50;ctx.fillText(line, x, y); }
    // Footer: one rule and the wordmark.
    ctx.direction = 'ltr';
    ctx.fillStyle = RULE;ctx.fillRect(PAD, H - 150, W - PAD * 2, 2);
    if (wordmark) { const h = 44, w = h * (wordmark.naturalWidth / wordmark.naturalHeight || 6.4);ctx.drawImage(wordmark, PAD, H - 104, w, h); }
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob) throw Error('Canvas export failed');
    const name = (a.title || 'wikiscroll').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60) || 'wikiscroll';
    return new File([blob], name + '.jpg', {type: 'image/jpeg'});
  }

  function prepare(a) {
    if (!a?.id || cache.has(a.id)) return;
    const entry = {file: null};cache.set(a.id, entry);
    while (cache.size > 6) cache.delete(cache.keys().next().value);
    draw(a).then(file => { entry.file = file; }, () => { cache.delete(a.id); });
  }

  window.WSShareCard = {
    // Called as cards come into view; only the card the reader stays on is drawn.
    soon(a) { clearTimeout(timer); timer = setTimeout(() => prepare(a), 1200); },
    prepare,
    ready(a) { return cache.get(a?.id)?.file || null; },
    draw,
  };
})();
