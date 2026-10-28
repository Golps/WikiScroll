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
export const MATURE_TEXT = /\b(?:porn(?:o|ography|ographic|s|stars?)?|erotic (?:actor|actress|model|film|video|art|literature)|adult (?:film|video|model|entertain\w*)|sex (?:act|position|toy|worker|industry)s?|sexual (?:acts?|positions?|practices?|fetish\w*)|glamour model|playboy playmate|penthouse pet|striptease|camgirl|onlyfans|masturbat\w*|orgasm|bdsm|fellatio|cunnilingus|anal sex|oral sex|hentai)\b/i;

const name = category => String(typeof category === 'string' ? category : category?.title || '').replace(/^Category:/, '').replace(/_/g, ' ');

export function isMature({title = '', description = '', categories = []} = {}) {
  if (MATURE_TEXT.test(title) || MATURE_TEXT.test(description)) return true;
  return (Array.isArray(categories) ? categories : []).some(category => MATURE_CATEGORY.test(name(category)));
}
