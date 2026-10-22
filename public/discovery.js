/* A quiet, dismissible first-discovery cue. Navigation remains in app.js. */
(() => {
  const hint = document.getElementById('hint'), feed = document.getElementById('feed');
  let timer = 0, visible = false;
  function hide() {
    clearTimeout(timer); visible = false;
    hint.classList.remove('is-visible'); hint.setAttribute('aria-hidden', 'true'); hint.tabIndex = -1;
  }
  function scheduleHide() {
    clearTimeout(timer); timer = setTimeout(() => { if (document.activeElement !== hint) hide(); }, 6500);
  }
  window.WSDiscoveryHint = { show() {
    if (feed.scrollTop > 36) return;
    visible = true; hint.classList.add('is-visible'); hint.removeAttribute('aria-hidden'); hint.tabIndex = 0;
    scheduleHide();
  }, hide };
  hint.addEventListener('focus', () => clearTimeout(timer));
  hint.addEventListener('blur', () => { if (visible) scheduleHide(); });
  hint.addEventListener('click', () => {
    if (feedMotionLocked) return;
    ensureFeedAhead();
    const cards = [...feed.querySelectorAll('.card[data-id]')];
    const next = cards[cards.indexOf(getCurrentFeedCard()) + 1];
    if (!next) return;
    hide(); feed.focus({preventScroll:true});
    feed.scrollTo({top:feedCardTop(next), behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
  });
  feed.addEventListener('scroll', () => { if (visible && feed.scrollTop > 36) hide(); }, {passive:true});
  window.addEventListener('feed-reset', hide);
  document.addEventListener('visibilitychange', () => { if (document.hidden) hide(); });
})();
