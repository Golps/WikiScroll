/* First-launch gesture coach: an animated hand for scrolling and one for
   swiping. Each row retires once the reader has made that gesture; the coach
   stops appearing when both are learned. Navigation remains in app.js. */
(() => {
  const coach = document.getElementById('coach'), feed = document.getElementById('feed');
  const KEY = 'ws_coach';
  let timer = 0, visible = false, learned = {};
  try { learned = JSON.parse(localStorage.getItem(KEY)) || {}; } catch {}
  const rows = gesture => coach.querySelector(`[data-gesture="${gesture}"]`);
  function hide() {
    clearTimeout(timer); visible = false;
    coach.classList.remove('is-visible'); coach.setAttribute('aria-hidden', 'true');
  }
  function learn(gesture) {
    if (learned[gesture]) return;
    learned[gesture] = 1;
    try { localStorage.setItem(KEY, JSON.stringify(learned)); } catch {}
  }
  window.WSDiscoveryHint = {
    show({swipe = true} = {}) {
      if (feed.scrollTop > 36) return;
      const showScroll = !learned.scroll, showSwipe = swipe && !learned.swipe;
      if (!showScroll && !showSwipe) return;
      rows('scroll').hidden = !showScroll; rows('swipe').hidden = !showSwipe;
      visible = true; coach.classList.add('is-visible'); coach.removeAttribute('aria-hidden');
      clearTimeout(timer); timer = setTimeout(hide, 9000);
    },
    hide,
    learned(gesture) { learn(gesture); if (visible) hide(); },
  };
  coach.addEventListener('click', hide);
  feed.addEventListener('scroll', () => { if (feed.scrollTop > 36) { learn('scroll'); if (visible) hide(); } }, {passive:true});
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
