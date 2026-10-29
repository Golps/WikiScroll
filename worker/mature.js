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
  it: words('Pornografia|Pornografic\\p{L}*|Attori pornografici|Attrici pornografiche|Erotismo|Erotic\\p{L}*|Nudità|Naturismo|Nudismo|Prostituzione|Bordell\\p{L}*|Pratiche sessuali|Posizioni sessuali|Giocattoli sessuali|BDSM|Parafili\\p{L}*|Stupro|Violenza sessuale|Abusi sessuali|Tortura|Vulva|Vagina|Clitoride'),
  pt: words('Pornografia|Pornográfic\\p{L}*|Atores pornográficos|Atrizes pornográficas|Erotismo|Erótic\\p{L}*|Nudez|Naturismo|Nudismo|Prostituição|Bordéis|Bordel|Práticas sexuais|Posições sexuais|Brinquedos sexuais|BDSM|Parafilias?|Estupro|Violência sexual|Abuso sexual|Tortura|Pênis|Pénis|Vulva|Vagina|Testículos?|Clitóris'),
  ru: words('Порнограф\\p{L}*|Порноактр\\p{L}*|Порномодел\\p{L}*|Эроти\\p{L}*|Нагота|Нудизм|Натуризм|Проституц\\p{L}*|Бордел\\p{L}*|Публичные дома|Сексуальные практики|Позиции секса|Секс-игрушки|БДСМ|BDSM|Парафили\\p{L}*|Изнасилован\\p{L}*|Сексуальное насилие|Пытк\\p{L}*|Половой член|Вульва|Влагалище|Клитор'),
  nl: words('Pornografie|Pornografisch\\p{L}*|Pornoacteur\\p{L}*|Pornoactrice\\p{L}*|Erotiek|Erotisch\\p{L}*|Naaktheid|Naturisme|Prostitutie|Bordeel|Bordelen|Seksuele handeling\\p{L}*|Seksspeeltje\\p{L}*|BDSM|Parafilie\\p{L}*|Verkrachting|Seksueel misbruik|Seksueel geweld|Marteling|Penis|Vulva|Vagina|Clitoris'),
  pl: words('Pornografi\\p{L}*|Aktorzy pornograficzni|Aktorki pornograficzne|Erotyk\\p{L}*|Erotyzm|Nagość|Naturyzm|Prostytucj\\p{L}*|Domy publiczne|Praktyki seksualne|Pozycje seksualne|Zabawki erotyczne|BDSM|Parafili\\p{L}*|Gwałt|Przemoc seksualna|Wykorzystywanie seksualne|Tortury|Prącie|Łechtaczka'),
  he: words('פורנוגרפיה|שחקני פורנו|שחקניות פורנו|ארוטיקה|עירום|נודיזם|זנות|בתי בושת|פרקטיקות מיניות|צעצועי מין|BDSM|פרפיליה|אונס|אלימות מינית|פגיעה מינית|עינויים|פין|נרתיק|דגדגן'),
  ar: words('(?:ال)?إباحية|ممثلو (?:ال)?إباحية|ممثلات (?:ال)?إباحية|(?:ال)?إثارة (?:ال)?جنسية|(?:ال)?عري|(?:ال)?تعري|(?:ال)?دعارة|بيوت (?:ال)?دعارة|ممارسات جنسية|أوضاع جنسية|ألعاب جنسية|BDSM|بارافيليا|(?:ال)?اغتصاب|(?:ال)?عنف (?:ال)?جنسي|(?:ال)?اعتداء (?:ال)?جنسي|(?:ال)?تعذيب|(?:ال)?قضيب|(?:ال)?مهبل|(?:ال)?بظر'),
  hi: words('पोर्नोग्राफ़ी|पोर्नोग्राफी|अश्लील फ़िल्म[\\p{L}\\p{M}]*|अश्लीलता|नग्नता|वेश्यावृत्ति|वेश्यालय|बीडीएसएम|BDSM|बलात्कार|यौन हिंसा|यौन शोषण|यौन उत्पीड़न|यातना'),
  ko: words('포르노\\p{L}*|에로티시즘|에로 영화|나체\\p{L}*|누드|성매매|매춘|성행위|체위|섹스 토이|BDSM|성도착증|변태성욕|강간|성폭력|음경|외음부|음핵'),
  // Japanese and Chinese are written without spaces, so these match anywhere in the name.
  ja: new RegExp('ポルノ|アダルトビデオ|AV女優|エロティシズム|ヌード|裸体|ナチュリズム|売春|性行為|体位|アダルトグッズ|BDSM|性的倒錯|パラフィリア|強姦|レイプ|性暴力|性的虐待|拷問|陰茎|ペニス|外陰部|膣|陰核|クリトリス', 'iu'),
  zh: new RegExp('色情|成人影片|成人電影|情色|裸体|裸體|卖淫|賣淫|妓院|性行为|性行為|性交体位|性玩具|BDSM|性欲倒错|性慾倒錯|强奸|強姦|強暴|性暴力|性侵|酷刑|阴茎|陰莖|外阴|外陰|阴道|陰道|阴蒂|陰蒂', 'iu'),
  es: words('Pornografía|Pornográfic\\p{L}*|Actores pornográficos|Actrices pornográficas|Erotismo|Erótic\\p{L}*|Desnudez|Nudismo|Prostitución|Burdeles?|Prácticas sexuales|Posturas sexuales|Juguetes sexuales|BDSM|Parafilias?|Violación|Violencia sexual|Abuso sexual|Tortura|Pene|Vulva|Vagina|Testículos?|Clítoris'),
};

const name = category => String(typeof category === 'string' ? category : category?.title || '').replace(/^(?:Category|Kategorie|Catégorie|Categoría|Categoria|Категория|Categorie|Kategoria|קטגוריה|تصنيف|श्रेणी|분류|カテゴリ|分类|分類):/, '').replace(/_/g, ' ');

export function isMature({title = '', description = '', categories = [], lang = 'en'} = {}) {
  if (MATURE_TEXT.test(title) || MATURE_TEXT.test(description)) return true;
  const rule = lang === 'en' ? MATURE_CATEGORY : MATURE_CATEGORY_LANG[lang];
  return !!rule && (Array.isArray(categories) ? categories : []).some(category => rule.test(name(category)));
}
