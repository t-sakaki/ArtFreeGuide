import { Locale } from './i18n';

/**
 * Titles and artist names for the curated data (quick starts, tours, hotspots).
 *
 * The Japanese form stays the canonical key everywhere in the code; this map is
 * applied at the edges — what the visitor reads, and what is sent to the LLM,
 * which needs the name the sources use in that language.
 */
type Translations = Record<Exclude<Locale, 'ja'>, string>;

const NAMES: Record<string, Translations> = {
  // Artists
  'フィンセント・ファン・ゴッホ': { en: 'Vincent van Gogh', fr: 'Vincent van Gogh', zh: '文森特·梵高' },
  'レオナルド・ダ・ヴィンチ': { en: 'Leonardo da Vinci', fr: 'Léonard de Vinci', zh: '列奥纳多·达·芬奇' },
  'クロード・モネ': { en: 'Claude Monet', fr: 'Claude Monet', zh: '克劳德·莫奈' },
  'パブロ・ピカソ': { en: 'Pablo Picasso', fr: 'Pablo Picasso', zh: '巴勃罗·毕加索' },
  'エドヴァルド・ムンク': { en: 'Edvard Munch', fr: 'Edvard Munch', zh: '爱德华·蒙克' },
  'ヨハネス・フェルメール': { en: 'Johannes Vermeer', fr: 'Johannes Vermeer', zh: '约翰内斯·维米尔' },
  'サルバドール・ダリ': { en: 'Salvador Dalí', fr: 'Salvador Dalí', zh: '萨尔瓦多·达利' },
  '葛飾北斎': { en: 'Katsushika Hokusai', fr: 'Katsushika Hokusai', zh: '葛饰北斋' },
  '俵屋宗達': { en: 'Tawaraya Sōtatsu', fr: 'Tawaraya Sōtatsu', zh: '俵屋宗达' },
  '草間彌生': { en: 'Yayoi Kusama', fr: 'Yayoi Kusama', zh: '草间弥生' },
  'アンディ・ウォーホル': { en: 'Andy Warhol', fr: 'Andy Warhol', zh: '安迪·沃霍尔' },
  'ピエール＝オーギュスト・ルノワール': { en: 'Pierre-Auguste Renoir', fr: 'Pierre-Auguste Renoir', zh: '皮埃尔-奥古斯特·雷诺阿' },
  'ミケランジェロ・ブオナローティ': { en: 'Michelangelo Buonarroti', fr: 'Michel-Ange', zh: '米开朗基罗' },
  'ジャン＝ミシェル・バスキア': { en: 'Jean-Michel Basquiat', fr: 'Jean-Michel Basquiat', zh: '让-米歇尔·巴斯奎特' },
  'エドガー・ドガ': { en: 'Edgar Degas', fr: 'Edgar Degas', zh: '埃德加·德加' },
  '歌川広重': { en: 'Utagawa Hiroshige', fr: 'Utagawa Hiroshige', zh: '歌川广重' },
  '野々村仁清': { en: 'Nonomura Ninsei', fr: 'Nonomura Ninsei', zh: '野野村仁清' },
  'フランシスコ・デ・ゴヤ': { en: 'Francisco de Goya', fr: 'Francisco de Goya', zh: '弗朗西斯科·戈雅' },
  'サンドロ・ボッティチェッリ': { en: 'Sandro Botticelli', fr: 'Sandro Botticelli', zh: '桑德罗·波提切利' },

  // Artworks
  'ひまわり': { en: 'Sunflowers', fr: 'Les Tournesols', zh: '向日葵' },
  '星月夜': { en: 'The Starry Night', fr: 'La Nuit étoilée', zh: '星月夜' },
  'モナ・リザ': { en: 'Mona Lisa', fr: 'La Joconde', zh: '蒙娜丽莎' },
  '最後の晩餐': { en: 'The Last Supper', fr: 'La Cène', zh: '最后的晚餐' },
  '印象・日の出': { en: 'Impression, Sunrise', fr: 'Impression, soleil levant', zh: '印象·日出' },
  '睡蓮': { en: 'Water Lilies', fr: 'Les Nymphéas', zh: '睡莲' },
  'ゲルニカ': { en: 'Guernica', fr: 'Guernica', zh: '格尔尼卡' },
  'アビニヨンの娘たち': { en: "Les Demoiselles d'Avignon", fr: 'Les Demoiselles d’Avignon', zh: '亚维农的少女' },
  '叫び': { en: 'The Scream', fr: 'Le Cri', zh: '呐喊' },
  '真珠の耳飾りの少女': { en: 'Girl with a Pearl Earring', fr: 'La Jeune Fille à la perle', zh: '戴珍珠耳环的少女' },
  '記憶の固執': { en: 'The Persistence of Memory', fr: 'La Persistance de la mémoire', zh: '记忆的永恒' },
  '神奈川沖浪裏': { en: 'The Great Wave off Kanagawa', fr: 'La Grande Vague de Kanagawa', zh: '神奈川冲浪里' },
  '富嶽三十六景 神奈川沖浪裏': { en: 'The Great Wave off Kanagawa', fr: 'La Grande Vague de Kanagawa', zh: '神奈川冲浪里' },
  '風神雷神図屏風': { en: 'Wind God and Thunder God Screens', fr: 'Les Dieux du vent et du tonnerre', zh: '风神雷神图屏风' },
  '南瓜': { en: 'Pumpkin', fr: 'Citrouille', zh: '南瓜' },
  'ムーラン・ド・ラ・ギャレットの舞踏会': { en: 'Bal du moulin de la Galette', fr: 'Bal du moulin de la Galette', zh: '煎饼磨坊的舞会' },
  '踊りの稽古場にて': { en: 'The Dance Class', fr: 'La Classe de danse', zh: '舞蹈课' },
  '凱風快晴': { en: 'Fine Wind, Clear Morning', fr: 'Vent frais par matin clair', zh: '凯风快晴' },
  '東海道五十三次': { en: 'The Fifty-three Stations of the Tōkaidō', fr: 'Les Cinquante-trois Stations du Tōkaidō', zh: '东海道五十三次' },
  '色絵藤花文茶壺': { en: 'Tea Jar with Wisteria Design', fr: 'Jarre à thé au décor de glycines', zh: '色绘藤花纹茶壶' },
  '我が子を食らうサトゥルヌス': { en: 'Saturn Devouring His Son', fr: 'Saturne dévorant un de ses fils', zh: '农神吞噬其子' },
  'ヴィーナスの誕生': { en: 'The Birth of Venus', fr: 'La Naissance de Vénus', zh: '维纳斯的诞生' },
  'ダビデ像': { en: 'David', fr: 'Le David', zh: '大卫像' },
  '最後の審判': { en: 'The Last Judgment', fr: 'Le Jugement dernier', zh: '最后的审判' },
  'ジャガイモを食べる人々': { en: 'The Potato Eaters', fr: 'Les Mangeurs de pommes de terre', zh: '吃土豆的人' },
  '夜のカフェテラス': { en: 'Café Terrace at Night', fr: 'Terrasse du café le soir', zh: '夜间露天咖啡座' },
  'カラスのいる麦畑': { en: 'Wheatfield with Crows', fr: 'Champ de blé aux corbeaux', zh: '麦田群鸦' },
};

/** The name as the visitor's language writes it, or the original if unknown. */
export function localizeName(name: string, locale: Locale): string {
  if (locale === 'ja') return name;
  return NAMES[name.trim()]?.[locale] ?? name;
}

const CANONICAL = new Map<string, string>();
for (const [japanese, translations] of Object.entries(NAMES)) {
  for (const translated of Object.values(translations)) {
    CANONICAL.set(translated.toLowerCase(), japanese);
  }
}

/**
 * The Japanese form of a translated name. Used before an artwork reaches the
 * archive or the image search, so that a work listened to as "Sunflowers" and
 * one listened to as「ひまわり」are the same artwork everywhere but on screen.
 */
export function canonicalName(name: string): string {
  const trimmed = name.trim();
  return CANONICAL.get(trimmed.toLowerCase()) ?? trimmed;
}
