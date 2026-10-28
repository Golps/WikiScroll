/* First-launch gesture coach: one small pill under the header with an
   animated hand. It teaches scrolling first, then changes in place to swiping
   once the reader scrolls, and retires each gesture once the reader has made
   it. Navigation remains in app.js. */
(() => {
  const coach = document.getElementById('coach'), feed = document.getElementById('feed');
  const KEY = 'ws_coach';
  let timer = 0, current = '', swipeOn = true, learned = {};
  try { learned = JSON.parse(localStorage.getItem(KEY)) || {}; } catch {}
  const rows = gesture => coach.querySelector(`[data-gesture="${gesture}"]`);
  const next = () => !learned.scroll ? 'scroll' : swipeOn && !learned.swipe ? 'swipe' : '';
  function hide() {
    clearTimeout(timer); current = '';
    coach.classList.remove('is-visible'); coach.setAttribute('aria-hidden', 'true');
  }
  function show(gesture) {
    if (!gesture) return hide();
    current = gesture;
    rows('scroll').hidden = gesture !== 'scroll'; rows('swipe').hidden = gesture !== 'swipe';
    const header = document.querySelector?.('.hdr');
    if (header) coach.style.top = Math.round(header.getBoundingClientRect().bottom + 10) + 'px';
    coach.classList.add('is-visible'); coach.removeAttribute('aria-hidden');
    clearTimeout(timer); timer = setTimeout(hide, 9000);
  }
  function learn(gesture) {
    if (!learned[gesture]) {
      learned[gesture] = 1;
      try { localStorage.setItem(KEY, JSON.stringify(learned)); } catch {}
    }
    if (current === gesture) show(next());
  }
  window.WSDiscoveryHint = {
    show({swipe = true} = {}) {
      swipeOn = swipe;
      if (feed.scrollTop > 36) return;
      show(next());
    },
    hide,
    learned: learn,
  };
  coach.addEventListener('click', hide);
  feed.addEventListener('scroll', () => { if (feed.scrollTop > 36) learn('scroll'); }, {passive:true});
  window.addEventListener('feed-reset', hide);
  document.addEventListener('visibilitychange', () => { if (document.hidden) hide(); });
})();

/* Focus rings are for keyboard users. After a tap or click, a panel that moves
   focus to its first control (close button, About links) must not leave a lit
   square behind; any key press brings the rings back. */
(() => {
  const root = document.documentElement;
  const pointer = () => root.classList.add('pointer-input');
  addEventListener('pointerdown', pointer, {capture:true, passive:true});
  addEventListener('touchstart', pointer, {capture:true, passive:true});
  addEventListener('keydown', event => { if (!event.metaKey && !event.ctrlKey && !event.altKey) root.classList.remove('pointer-input'); }, true);
})();
