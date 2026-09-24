// Phrasebooks are language guides, not destinations, so Wikivoyage feeds skip
// them. Each edition keeps its phrasebooks in one category. The categories below
// were found through the language links of English "Category:Phrasebooks" and
// checked against their members (September 2026): every phrasebook page is in
// its edition's category (English: 318 of 319). The feed requests this category
// flag with each batch (clcategories), at no extra cost.
export const PHRASEBOOK_CATEGORY = {
  en: 'Category:Phrasebooks', es: 'Categoría:Guías de conversación', fr: 'Catégorie:Guides linguistiques',
  de: 'Kategorie:Sprachführer', it: 'Categoria:Frasari', pt: 'Categoria:Guias de conversação',
  ru: 'Категория:Разговорники', ja: 'カテゴリ:会話集', zh: 'Category:会话手册',
  he: 'קטגוריה:שיחונים', nl: 'Categorie:Taalgids', pl: 'Kategoria:Rozmówki',
};
// Each edition's naming pattern, from its real titles, as a second check. Spanish
// language names are lower case ("Guía de alemán"), so "Guía de Madrid" is not a
// phrasebook. Hebrew titles start with שיחון (final nun). Italian titles are just
// the language ("Cinese"), so Italian relies on the category alone.
export const PHRASEBOOK_TITLE = {
  en: / phrasebook$|^Phrasebooks?$/i, es: /^Guía de \p{Ll}/u, fr: /^Guide linguistique /u, de: /^Sprachführer(\s|$)/u,
  pt: /^Guia de conversação(\s|$)/u, ru: /разговорник(\s*\(.*\))?$/iu, ja: /会話集$/u, zh: /(会话手册|會話手冊)$/u,
  he: /^שיחון(\s|$)/u, nl: /^Taalgids(\s|$)/u, pl: /^Rozmówki(\s|$)/u,
};
// Add to a query that uses prop=…|categories.
export const phrasebookParams = lang => PHRASEBOOK_CATEGORY[lang] ? {clcategories: PHRASEBOOK_CATEGORY[lang], cllimit: 'max'} : {};
export function isPhrasebook(page, lang) {
  const category = PHRASEBOOK_CATEGORY[lang];
  if (category && (page.categories || []).some(c => c.title === category)) return true;
  return !!PHRASEBOOK_TITLE[lang]?.test(String(page.title || ''));
}
