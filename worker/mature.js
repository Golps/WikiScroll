// Mature topics: sex, pornography, nudity and graphic abuse. The feed hides
// them unless the reader turns them on in Settings. Cards are flagged rather
// than dropped, so one cached supply serves both choices.
//
// Wikipedia's own categories decide where they are known (the card library
// reads every article's categories). Titles and short descriptions are a
// lighter check for live cards, which arrive without categories. Sexuality,
// LGBTQ topics, sex education and reproductive health are not mature topics
// and must never match.
export const MATURE_CATEGORY = /\b(?:porn(?:o|ography|ographic|s|stars?)?|erotic\w*|nud(?:e|es|ity|ism)|sex (?:acts?|positions?|toys?|industry|workers?|work|slang|clubs?|shops?|tourism|scandals?|trafficking)|sexual (?:acts?|positions?|slang|fetishism|abuse|violence|assault)|bdsm|paraphilias?|masturbation|orgasm|prostitut\w*|brothels?|strip clubs?|striptease|playboy playmates|penthouse pets|adult (?:models|entertain\w*|film\w*|video\w*|magazines|websites)|hentai|rape|child sexual abuse|torture|shock sites|snuff films|(?:human )?(?:penis|vulva|vagina|testicles?|clitoris))\b/i;
// The same rule in the reader (public/app.js); a test keeps the two equal.
export const MATURE_TEXT = /\b(?:porn(?:o|ography|ographic|s|stars?)?|pornogr\w*|pornodarsteller\w*|erotic (?:actor|actress|model|film|video|art|literature)|adult (?:film|video|model|entertain\w*)|sex (?:act|position|toy|worker|industry)s?|sexual (?:acts?|positions?|practices?|fetish\w*)|glamour model|playboy playmate|penthouse pet|striptease|camgirl|onlyfans|masturbat\w*|orgasm|bdsm|fellatio|cunnilingus|anal sex|oral sex|hentai)\b/i;

// Other languages name their categories in their own words. Letters, not
// \b, bound each word, so accented names match whole words only.
const words = list => new RegExp(`(?<!\\p{L})(?:${list})(?!\\p{L})`, 'iu');
export const MATURE_CATEGORY_LANG = {
  de: words('Pornografie|Pornografische\\p{L}*|Pornodarsteller\\p{L}*|Erotik|Erotische\\p{L}*|Nacktheit|FKK|Prostitution|Bordell\\p{L}*|Sexualpraktik\\p{L}*|Sexspielzeug|BDSM|Paraphilie\\p{L}*|Vergewaltigung|Sexueller Missbrauch|Sexualdelikt\\p{L}*|Folter\\p{L}*|Penis|Vulva|Vagina|Hoden|Klitoris'),
  fr: words('Pornographie|Pornographique\\p{L}*|Acteurs? pornographiques?|Actrices? pornographiques?|Érotisme|Érotique\\p{L}*|Nudité|Naturisme|Prostitution|Maison close|Bordel|Pratiques? sexuelles?|Positions? sexuelles?|Jouets? sexuels?|BDSM|Paraphilie\\p{L}*|Viol|Violences? sexuelles?|Abus sexuels?|Torture|Pénis|Vulve|Vagin|Testicules?|Clitoris'),
  es: words('Pornografía|Pornográfic\\p{L}*|Actores pornográficos|Actrices pornográficas|Erotismo|Erótic\\p{L}*|Desnudez|Nudismo|Prostitución|Burdeles?|Prácticas sexuales|Posturas sexuales|Juguetes sexuales|BDSM|Parafilias?|Violación|Violencia sexual|Abuso sexual|Tortura|Pene|Vulva|Vagina|Testículos?|Clítoris'),
};

const name = category => String(typeof category === 'string' ? category : category?.title || '').replace(/^(?:Category|Kategorie|Catégorie|Categoría):/, '').replace(/_/g, ' ');

export function isMature({title = '', description = '', categories = [], lang = 'en'} = {}) {
  if (MATURE_TEXT.test(title) || MATURE_TEXT.test(description)) return true;
  const rule = lang === 'en' ? MATURE_CATEGORY : MATURE_CATEGORY_LANG[lang];
  return !!rule && (Array.isArray(categories) ? categories : []).some(category => rule.test(name(category)));
}
