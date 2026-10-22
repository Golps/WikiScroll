// The 15 languages WikiScroll supports. The Worker's router and shared
// collections read this list; public/app.js keeps its own copy with display
// names (there is no build step), and a test keeps the two identical.
export const LANGS = new Set(['en','es','fr','de','it','pt','ru','ja','zh','ar','hi','ko','nl','pl','he']);
