import { Locale } from './i18n';

/**
 * Titles and artist names for the curated data (quick starts, tours, hotspots).
 *
 * The Japanese form stays the canonical key everywhere in the code; this map is
 * applied at the edges — what the visitor reads, and what is sent to the LLM,
 * which needs the name the sources use in that language.
 */
type Translations = Record<Exclude<Locale, 'ja'>, string>;

export const ARTIST_NAMES: Record<string, Translations> = {
  'フィンセント・ファン・ゴッホ': { en: 'Vincent van Gogh', fr: 'Vincent van Gogh', zh: '文森特·梵高', es: 'Vincent van Gogh' },
  'レオナルド・ダ・ヴィンチ': { en: 'Leonardo da Vinci', fr: 'Léonard de Vinci', zh: '列奥纳多·达·芬奇', es: 'Leonardo da Vinci' },
  'クロード・モネ': { en: 'Claude Monet', fr: 'Claude Monet', zh: '克劳德·莫奈', es: 'Claude Monet' },
  'パブロ・ピカソ': { en: 'Pablo Picasso', fr: 'Pablo Picasso', zh: '巴勃罗·毕加索', es: 'Pablo Picasso' },
  'エドヴァルド・ムンク': { en: 'Edvard Munch', fr: 'Edvard Munch', zh: '爱德华·蒙克', es: 'Edvard Munch' },
  'ヨハネス・フェルメール': { en: 'Johannes Vermeer', fr: 'Johannes Vermeer', zh: '约翰内斯·维米尔', es: 'Johannes Vermeer' },
  'サルバドール・ダリ': { en: 'Salvador Dalí', fr: 'Salvador Dalí', zh: '萨尔瓦多·达利', es: 'Salvador Dalí' },
  '葛飾北斎': { en: 'Katsushika Hokusai', fr: 'Katsushika Hokusai', zh: '葛饰北斋', es: 'Katsushika Hokusai' },
  '俵屋宗達': { en: 'Tawaraya Sōtatsu', fr: 'Tawaraya Sōtatsu', zh: '俵屋宗达', es: 'Tawaraya Sōtatsu' },
  '草間彌生': { en: 'Yayoi Kusama', fr: 'Yayoi Kusama', zh: '草间弥生', es: 'Yayoi Kusama' },
  'アンディ・ウォーホル': { en: 'Andy Warhol', fr: 'Andy Warhol', zh: '安迪·沃霍尔', es: 'Andy Warhol' },
  'ピエール＝オーギュスト・ルノワール': { en: 'Pierre-Auguste Renoir', fr: 'Pierre-Auguste Renoir', zh: '皮埃尔-奥古斯特·雷诺阿', es: 'Pierre-Auguste Renoir' },
  'ミケランジェロ・ブオナローティ': { en: 'Michelangelo Buonarroti', fr: 'Michel-Ange', zh: '米开朗基罗', es: 'Miguel Ángel' },
  'ジャン＝ミシェル・バスキア': { en: 'Jean-Michel Basquiat', fr: 'Jean-Michel Basquiat', zh: '让-米歇尔·巴斯奎特', es: 'Jean-Michel Basquiat' },
  'エドガー・ドガ': { en: 'Edgar Degas', fr: 'Edgar Degas', zh: '埃德加·德加', es: 'Edgar Degas' },
  '歌川広重': { en: 'Utagawa Hiroshige', fr: 'Utagawa Hiroshige', zh: '歌川广重', es: 'Utagawa Hiroshige' },
  '野々村仁清': { en: 'Nonomura Ninsei', fr: 'Nonomura Ninsei', zh: '野野村仁清', es: 'Nonomura Ninsei' },
  'フランシスコ・デ・ゴヤ': { en: 'Francisco de Goya', fr: 'Francisco de Goya', zh: '弗朗西斯科·戈雅', es: 'Francisco de Goya' },
  'サンドロ・ボッティチェッリ': { en: 'Sandro Botticelli', fr: 'Sandro Botticelli', zh: '桑德罗·波提切利', es: 'Sandro Botticelli' },
  'レンブラント・ファン・レイン': { en: 'Rembrandt van Rijn', fr: 'Rembrandt van Rijn', zh: '伦勃朗·凡·莱因', es: 'Rembrandt van Rijn' },
  'ラファエロ・サンティ': { en: 'Raphael', fr: 'Raphaël', zh: '拉斐尔', es: 'Rafael Sanzio' },
  'グスタフ・クリムト': { en: 'Gustav Klimt', fr: 'Gustav Klimt', zh: '古斯塔夫·克里姆特', es: 'Gustav Klimt' },
};

/** Kept apart from the artists so that permalinks can be built from titles. */
export const ARTWORK_NAMES: Record<string, Translations> = {
  'ひまわり': { en: 'Sunflowers', fr: 'Les Tournesols', zh: '向日葵', es: 'Los girasoles' },
  '星月夜': { en: 'The Starry Night', fr: 'La Nuit étoilée', zh: '星月夜', es: 'La noche estrellada' },
  'モナ・リザ': { en: 'Mona Lisa', fr: 'La Joconde', zh: '蒙娜丽莎', es: 'La Gioconda' },
  '最後の晩餐': { en: 'The Last Supper', fr: 'La Cène', zh: '最后的晚餐', es: 'La última cena' },
  '印象・日の出': { en: 'Impression, Sunrise', fr: 'Impression, soleil levant', zh: '印象·日出', es: 'Impresión, sol naciente' },
  '睡蓮': { en: 'Water Lilies', fr: 'Les Nymphéas', zh: '睡莲', es: 'Los nenúfares' },
  'ゲルニカ': { en: 'Guernica', fr: 'Guernica', zh: '格尔尼卡', es: 'Guernica' },
  'アビニヨンの娘たち': { en: "Les Demoiselles d'Avignon", fr: 'Les Demoiselles d’Avignon', zh: '亚维农的少女', es: 'Las señoritas de Aviñón' },
  '叫び': { en: 'The Scream', fr: 'Le Cri', zh: '呐喊', es: 'El grito' },
  '真珠の耳飾りの少女': { en: 'Girl with a Pearl Earring', fr: 'La Jeune Fille à la perle', zh: '戴珍珠耳环的少女', es: 'La joven de la perla' },
  '記憶の固執': { en: 'The Persistence of Memory', fr: 'La Persistance de la mémoire', zh: '记忆的永恒', es: 'La persistencia de la memoria' },
  '神奈川沖浪裏': { en: 'The Great Wave off Kanagawa', fr: 'La Grande Vague de Kanagawa', zh: '神奈川冲浪里', es: 'La gran ola de Kanagawa' },
  '富嶽三十六景 神奈川沖浪裏': { en: 'The Great Wave off Kanagawa', fr: 'La Grande Vague de Kanagawa', zh: '神奈川冲浪里', es: 'La gran ola de Kanagawa' },
  '風神雷神図屏風': { en: 'Wind God and Thunder God Screens', fr: 'Les Dieux du vent et du tonnerre', zh: '风神雷神图屏风', es: 'Biombos del dios del viento y el dios del trueno' },
  '南瓜': { en: 'Pumpkin', fr: 'Citrouille', zh: '南瓜', es: 'Calabaza' },
  'ムーラン・ド・ラ・ギャレットの舞踏会': { en: 'Bal du moulin de la Galette', fr: 'Bal du moulin de la Galette', zh: '煎饼磨坊的舞会', es: 'Baile en el Moulin de la Galette' },
  '踊りの稽古場にて': { en: 'The Dance Class', fr: 'La Classe de danse', zh: '舞蹈课', es: 'La clase de danza' },
  '凱風快晴': { en: 'Fine Wind, Clear Morning', fr: 'Vent frais par matin clair', zh: '凯风快晴', es: 'Viento fresco, mañana clara' },
  '東海道五十三次': { en: 'The Fifty-three Stations of the Tōkaidō', fr: 'Les Cinquante-trois Stations du Tōkaidō', zh: '东海道五十三次', es: 'Las cincuenta y tres estaciones del Tōkaidō' },
  '色絵藤花文茶壺': { en: 'Tea Jar with Wisteria Design', fr: 'Jarre à thé au décor de glycines', zh: '色绘藤花纹茶壶', es: 'Tarro de té con decoración de glicinas' },
  '夜警': { en: 'The Night Watch', fr: 'La Ronde de nuit', zh: '夜巡', es: 'La ronda de noche' },
  'アテナイの学堂': { en: 'The School of Athens', fr: 'L’École d’Athènes', zh: '雅典学院', es: 'La escuela de Atenas' },
  '接吻': { en: 'The Kiss', fr: 'Le Baiser', zh: '吻', es: 'El beso' },
  '我が子を食らうサトゥルヌス': { en: 'Saturn Devouring His Son', fr: 'Saturne dévorant un de ses fils', zh: '农神吞噬其子', es: 'Saturno devorando a su hijo' },
  'ヴィーナスの誕生': { en: 'The Birth of Venus', fr: 'La Naissance de Vénus', zh: '维纳斯的诞生', es: 'El nacimiento de Venus' },
  'ダビデ像': { en: 'David', fr: 'Le David', zh: '大卫像', es: 'David' },
  '最後の審判': { en: 'The Last Judgment', fr: 'Le Jugement dernier', zh: '最后的审判', es: 'El Juicio Final' },
  'ジャガイモを食べる人々': { en: 'The Potato Eaters', fr: 'Les Mangeurs de pommes de terre', zh: '吃土豆的人', es: 'Los comedores de patatas' },
  '夜のカフェテラス': { en: 'Café Terrace at Night', fr: 'Terrasse du café le soir', zh: '夜间露天咖啡座', es: 'Terraza de café por la noche' },
  'カラスのいる麦畑': { en: 'Wheatfield with Crows', fr: 'Champ de blé aux corbeaux', zh: '麦田群鸦', es: 'Trigal con cuervos' },
  // Catalogue rows whose Japanese title is not the one the sources use, which
  // is the whole reason their picture could not be found.
  'アトリエの中の画家': { en: 'The Art of Painting', fr: 'L’Art de la peinture', zh: '绘画艺术', es: 'El arte de la pintura' },
  '薔薇': { en: 'Roses', fr: 'Roses', zh: '玫瑰', es: 'Rosas' },
  '水浴': { en: 'The Large Bathers', fr: 'Les Grandes Baigneuses', zh: '大浴女', es: 'Las grandes bañistas' },
  'リンゴとオレンジ': { en: 'Apples and Oranges', fr: 'Pommes et oranges', zh: '苹果与橙子', es: 'Manzanas y naranjas' },
  '病める少女': { en: 'The Sick Child', fr: 'L’Enfant malade', zh: '病中的孩子', es: 'La niña enferma' },
  '黒い正方形': { en: 'Black Square', fr: 'Carré noir', zh: '黑方块', es: 'Cuadrado negro' },
  '鮭': { en: 'Salmon', fr: 'Saumon', zh: '鲑鱼', es: 'Salmón' },
  // Titles the guide itself likes to use for two Vermeers, which the catalogue
  // and Wikipedia write differently — without these their pictures never load.
  // The catalogue's own spelling comes last of each pair: a translated name
  // resolves back to it, not to the variant the guide made up.
  '牛乳注ぎ': { en: 'The Milkmaid', fr: 'La Laitière', zh: '倒牛奶的女仆', es: 'La lechera' },
  '牛乳を注ぐ女': { en: 'The Milkmaid', fr: 'La Laitière', zh: '倒牛奶的女仆', es: 'La lechera' },
  'レースの少女': { en: 'The Lacemaker', fr: 'La Dentellière', zh: '花边女工', es: 'La encajera' },
  'レースを編む女': { en: 'The Lacemaker', fr: 'La Dentellière', zh: '花边女工', es: 'La encajera' },
};

export const NAMES: Record<string, Translations> = { ...ARTIST_NAMES, ...ARTWORK_NAMES };

/**
 * The names the guide speaks for works the catalogue and the sources list
 * under another title. A search finds nothing for the spoken form, so it is
 * replaced by the catalogued one before an artwork is looked up.
 */
export const SPOKEN_TITLES: Record<string, string> = {
  'レースの少女': 'レースを編む女',
  'レース編みの少女': 'レースを編む女',
  '牛乳注ぎ': '牛乳を注ぐ女',
  'ミルクを注ぐ女': '牛乳を注ぐ女',
  '絵画芸術': 'アトリエの中の画家',
  '画家のアトリエ': 'アトリエの中の画家'
};

/** The catalogued title for a name the guide made up, or the name itself. */
export function catalogueTitle(title: string): string {
  const trimmed = title.trim();
  return SPOKEN_TITLES[trimmed] ?? trimmed;
}
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
