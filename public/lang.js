/* Loads the interface dictionary for one language (public/translations/<lang>.js),
   so each reader downloads only the language they use. It runs in <head> to start
   the reader's saved language while the page is still parsing; i18n.js applies the
   dictionary as soon as it arrives. Bump VERSION when any dictionary changes, and
   update the matching entries in the service worker's SHELL. */
(() => {
  const VERSION = 2;
  const pending = {};
  function load(lang) {
    if (lang === 'en' || !/^[a-z]{2}$/.test(lang)) return Promise.resolve(false);
    if (window.WS_TRANSLATIONS?.[lang]) return Promise.resolve(true);
    return pending[lang] ||= new Promise(resolve => {
      const script = document.createElement('script');
      script.src = `/translations/${lang}.js?v=${VERSION}`;
      script.onload = () => resolve(!!window.WS_TRANSLATIONS?.[lang]);
      script.onerror = () => { delete pending[lang]; script.remove(); resolve(false); };
      document.head.append(script);
    });
  }
  window.WSTranslations = {load};
  // Same precedence as the app: ?lang= wins, then the saved setting.
  let lang = new URLSearchParams(location.search).get('lang');
  if (!lang) try { lang = JSON.parse(localStorage.getItem('ws_settings'))?.lang; } catch {}
  if (typeof lang === 'string' && lang !== 'en' && /^[a-z]{2}$/.test(lang)) {
    // Keep the page hidden until i18n.js has applied the dictionary, so a
    // non-English reader never sees the English interface first. The timeout
    // shows the page anyway if anything goes wrong.
    const root = document.documentElement;
    root.classList.add('i18n-pending');
    setTimeout(() => root.classList.remove('i18n-pending'), 1500);
    load(lang);
  }
})();
