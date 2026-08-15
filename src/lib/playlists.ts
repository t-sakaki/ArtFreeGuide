/**
 * Curated tours: an ordered set of artworks that tells one story.
 * The guide text itself is still generated per artwork by the LLM; a tour only
 * decides the order and gives the visitor a narrative frame.
 */
import { Locale } from './i18n';
import { localizeName } from './names';

export interface PlaylistItem {
  title: string;
  artist: string;
  /** One line shown while the tour moves to this artwork. */
  cue: string;
}

/** Tour wording per language; the `cues` array follows `items` in order. */
type PlaylistText = Record<Exclude<Locale, 'ja'>, { title: string; subtitle: string; cues: string[] }>;

export interface Playlist {
  id: string;
  title: string;
  subtitle: string;
  emoji: string;
  items: PlaylistItem[];
  i18n: PlaylistText;
}

export const PLAYLISTS: Playlist[] = [
  {
    id: 'impressionism',
    title: '光をつかまえた画家たち',
    subtitle: '印象派が「見えたまま」を描くまで',
    emoji: '🌅',
    items: [
      { title: '印象・日の出', artist: 'クロード・モネ', cue: '「印象派」という名前が生まれた一枚から始めます' },
      { title: '睡蓮', artist: 'クロード・モネ', cue: 'モネは晩年、庭の池だけを描き続けました' },
      { title: 'ムーラン・ド・ラ・ギャレットの舞踏会', artist: 'ピエール＝オーギュスト・ルノワール', cue: '木漏れ日の下の、パリの日曜日へ' },
      { title: '踊りの稽古場にて', artist: 'エドガー・ドガ', cue: '屋外を離れ、舞台裏の一瞬をとらえます' },
      { title: '星月夜', artist: 'フィンセント・ファン・ゴッホ', cue: '光の記録から、心の風景へ' },
    ],
    i18n: {
      en: {
        title: 'The painters who caught the light',
        subtitle: 'How Impressionism learned to paint what the eye sees',
        cues: [
          'We start with the painting that gave Impressionism its name',
          'In his last years Monet painted almost nothing but this pond',
          'Into a Parisian Sunday under dappled sunlight',
          'Away from the open air, to a moment backstage',
          'From recording light to painting an inner landscape',
        ],
      },
      fr: {
        title: 'Les peintres qui ont saisi la lumière',
        subtitle: 'Comment l’impressionnisme s’est mis à peindre ce que l’œil voit',
        cues: [
          'Commençons par le tableau qui a donné son nom à l’impressionnisme',
          'À la fin de sa vie, Monet ne peignait presque plus que ce bassin',
          'Vers un dimanche parisien sous la lumière tamisée',
          'Loin du plein air, vers un instant en coulisses',
          'De la lumière observée au paysage intérieur',
        ],
      },
      zh: {
        title: '捕捉光线的画家们',
        subtitle: '印象派如何画下「眼睛看到的样子」',
        cues: [
          '从让「印象派」得名的那幅画开始',
          '晚年的莫奈几乎只画自家花园的池塘',
          '走进树影斑驳下的巴黎星期天',
          '离开户外，捕捉后台的一瞬',
          '从记录光线，走向心中的风景',
        ],
      },
      es: {
        title: 'Los pintores que atraparon la luz',
        subtitle: 'Cómo el impresionismo aprendió a pintar lo que ve el ojo',
        cues: [
          'Empezamos por el cuadro que dio nombre al impresionismo',
          'En sus últimos años Monet apenas pintó otra cosa que este estanque',
          'Hacia un domingo parisino bajo la luz tamizada',
          'Lejos del aire libre, a un instante entre bastidores',
          'De registrar la luz a pintar un paisaje interior',
        ],
      },
    },
  },
  {
    id: 'hokusai',
    title: '北斎と日本の美',
    subtitle: '波、風神雷神、そして琳派へ',
    emoji: '🌊',
    items: [
      { title: '富嶽三十六景 神奈川沖浪裏', artist: '葛飾北斎', cue: '世界でもっとも知られた波から' },
      { title: '凱風快晴', artist: '葛飾北斎', cue: '同じシリーズの、静かな赤富士へ' },
      { title: '東海道五十三次', artist: '歌川広重', cue: '北斎のライバルが描いた旅の風景' },
      { title: '風神雷神図屏風', artist: '俵屋宗達', cue: '浮世絵より前、金地に躍る神々へ' },
      { title: '色絵藤花文茶壺', artist: '野々村仁清', cue: '絵画を離れ、やきものの美で締めくくります' },
    ],
    i18n: {
      en: {
        title: 'Hokusai and the beauty of Japan',
        subtitle: 'The wave, the thunder gods, and the Rinpa school',
        cues: [
          'Beginning with the best known wave in the world',
          'To the quiet red Fuji of the same series',
          'Travel scenes by Hokusai’s great rival',
          'Before woodblock prints: gods dancing on gold',
          'Leaving painting behind, we close with ceramics',
        ],
      },
      fr: {
        title: 'Hokusai et la beauté du Japon',
        subtitle: 'La vague, les dieux du tonnerre, puis l’école Rinpa',
        cues: [
          'Commençons par la vague la plus célèbre du monde',
          'Vers le Fuji rouge et paisible de la même série',
          'Les paysages de voyage du grand rival d’Hokusai',
          'Avant l’estampe : des dieux dansant sur fond d’or',
          'Quittons la peinture pour finir par la céramique',
        ],
      },
      zh: {
        title: '北斋与日本之美',
        subtitle: '浪、风神雷神，再到琳派',
        cues: [
          '从世界上最著名的那道浪开始',
          '走向同一系列中静谧的赤富士',
          '北斋劲敌笔下的旅途风景',
          '在浮世绘之前：金地上舞动的神明',
          '离开绘画，以陶瓷之美收尾',
        ],
      },
      es: {
        title: 'Hokusai y la belleza de Japón',
        subtitle: 'La ola, los dioses del trueno y la escuela Rinpa',
        cues: [
          'Comenzamos por la ola más famosa del mundo',
          'Hacia el Fuji rojo y sereno de la misma serie',
          'Paisajes de viaje del gran rival de Hokusai',
          'Antes de la estampa: dioses danzando sobre oro',
          'Dejamos la pintura y cerramos con la cerámica',
        ],
      },
    },
  },
  {
    id: 'anxiety',
    title: '不安のかたち',
    subtitle: '近代が抱えた叫びと悪夢',
    emoji: '😱',
    items: [
      { title: '叫び', artist: 'エドヴァルド・ムンク', cue: '近代の不安を象徴する一枚から' },
      { title: '我が子を食らうサトゥルヌス', artist: 'フランシスコ・デ・ゴヤ', cue: 'ゴヤが自宅の壁に描いた「黒い絵」へ' },
      { title: '記憶の固執', artist: 'サルバドール・ダリ', cue: '不安は夢の形をとりはじめます' },
      { title: 'ゲルニカ', artist: 'パブロ・ピカソ', cue: 'そして、現実の戦争へ' },
    ],
    i18n: {
      en: {
        title: 'The shapes of anxiety',
        subtitle: 'The screams and nightmares of the modern age',
        cues: [
          'Starting with the image of modern anxiety itself',
          'To the “black paintings” Goya put on his own walls',
          'Anxiety begins to take the shape of a dream',
          'And then, to a real war',
        ],
      },
      fr: {
        title: 'Les formes de l’angoisse',
        subtitle: 'Les cris et les cauchemars de l’époque moderne',
        cues: [
          'Commençons par l’image même de l’angoisse moderne',
          'Vers les « peintures noires » que Goya peignit chez lui',
          'L’angoisse prend la forme d’un rêve',
          'Puis vers une guerre bien réelle',
        ],
      },
      zh: {
        title: '不安的形状',
        subtitle: '近代的呐喊与噩梦',
        cues: [
          '从象征近代不安的那幅画开始',
          '走向戈雅画在自家墙上的「黑色绘画」',
          '不安开始呈现出梦的形状',
          '然后，走向真实的战争',
        ],
      },
      es: {
        title: 'Las formas de la angustia',
        subtitle: 'Los gritos y las pesadillas de la edad moderna',
        cues: [
          'Empezamos por la imagen misma de la angustia moderna',
          'Hacia las «pinturas negras» que Goya pintó en su propia casa',
          'La angustia empieza a tomar forma de sueño',
          'Y después, hacia una guerra real',
        ],
      },
    },
  },
  {
    id: 'renaissance',
    title: 'ルネサンスの巨匠たち',
    subtitle: '人間を主役にした時代',
    emoji: '🏛️',
    items: [
      { title: 'ヴィーナスの誕生', artist: 'サンドロ・ボッティチェッリ', cue: '神話が再び描かれはじめた頃から' },
      { title: 'モナ・リザ', artist: 'レオナルド・ダ・ヴィンチ', cue: 'もっとも有名な微笑みへ' },
      { title: '最後の晩餐', artist: 'レオナルド・ダ・ヴィンチ', cue: '同じ画家が壁に挑んだ大作' },
      { title: 'ダビデ像', artist: 'ミケランジェロ・ブオナローティ', cue: '絵画から彫刻へ、理想の人体' },
      { title: '最後の審判', artist: 'ミケランジェロ・ブオナローティ', cue: '巨匠の到達点、システィーナ礼拝堂へ' },
    ],
    i18n: {
      en: {
        title: 'Masters of the Renaissance',
        subtitle: 'The age that put people at the centre',
        cues: [
          'From the moment myth was painted again',
          'To the most famous smile of all',
          'The same painter, taking on a wall',
          'From painting to sculpture: the ideal body',
          'To the Sistine Chapel, where the master arrives',
        ],
      },
      fr: {
        title: 'Les maîtres de la Renaissance',
        subtitle: 'L’époque qui a mis l’humain au centre',
        cues: [
          'Depuis le retour de la mythologie en peinture',
          'Vers le sourire le plus célèbre du monde',
          'Le même peintre, à l’assaut d’un mur',
          'De la peinture à la sculpture : le corps idéal',
          'Vers la chapelle Sixtine, sommet du maître',
        ],
      },
      zh: {
        title: '文艺复兴的巨匠',
        subtitle: '把人放在中心的时代',
        cues: [
          '从神话重新被描绘的年代开始',
          '走向最著名的微笑',
          '同一位画家挑战墙面的巨作',
          '从绘画到雕塑：理想的人体',
          '走向西斯廷礼拜堂，巨匠的顶点',
        ],
      },
      es: {
        title: 'Los maestros del Renacimiento',
        subtitle: 'La época que puso a la persona en el centro',
        cues: [
          'Desde el momento en que el mito volvió a pintarse',
          'Hacia la sonrisa más famosa de todas',
          'El mismo pintor, enfrentándose a un muro',
          'De la pintura a la escultura: el cuerpo ideal',
          'Hacia la Capilla Sixtina, cima del maestro',
        ],
      },
    },
  },
  {
    id: 'vangogh',
    title: 'ゴッホ、10年の物語',
    subtitle: '一人の画家の人生をたどる',
    emoji: '🌻',
    items: [
      { title: 'ジャガイモを食べる人々', artist: 'フィンセント・ファン・ゴッホ', cue: '暗い色で農民を描いた、画家の出発点' },
      { title: 'ひまわり', artist: 'フィンセント・ファン・ゴッホ', cue: '南フランスの光が、色を変えます' },
      { title: '夜のカフェテラス', artist: 'フィンセント・ファン・ゴッホ', cue: '黒を使わずに描かれた夜' },
      { title: '星月夜', artist: 'フィンセント・ファン・ゴッホ', cue: '療養院の窓から見た、渦巻く空' },
      { title: 'カラスのいる麦畑', artist: 'フィンセント・ファン・ゴッホ', cue: '最晩年の麦畑へ' },
    ],
    i18n: {
      en: {
        title: 'Van Gogh, a story of ten years',
        subtitle: 'Following the life of one painter',
        cues: [
          'Peasants in dark colours: where the painter began',
          'The light of southern France changes his colours',
          'A night painted without using black',
          'The swirling sky seen from an asylum window',
          'To the wheatfields of his final weeks',
        ],
      },
      fr: {
        title: 'Van Gogh, dix années',
        subtitle: 'Sur les traces de la vie d’un peintre',
        cues: [
          'Des paysans aux couleurs sombres : le point de départ',
          'La lumière du Midi change sa palette',
          'Une nuit peinte sans utiliser de noir',
          'Le ciel tourbillonnant vu depuis l’asile',
          'Vers les champs de blé des dernières semaines',
        ],
      },
      zh: {
        title: '梵高，十年的故事',
        subtitle: '追随一位画家的一生',
        cues: [
          '用暗色描绘农民，画家的起点',
          '南法的阳光改变了他的色彩',
          '不用黑色画出的夜晚',
          '从疗养院窗口望见的漩涡星空',
          '走向最后时期的麦田',
        ],
      },
      es: {
        title: 'Van Gogh, la historia de diez años',
        subtitle: 'Siguiendo la vida de un solo pintor',
        cues: [
          'Campesinos en tonos oscuros: el punto de partida del pintor',
          'La luz del sur de Francia cambia sus colores',
          'Una noche pintada sin usar el negro',
          'El cielo en remolino visto desde la ventana del sanatorio',
          'Hacia los trigales de sus últimas semanas',
        ],
      },
    },
  },
];

/** A tour with its wording, titles and artists in the visitor's language. */
export function localizePlaylist(playlist: Playlist, locale: Locale): Playlist {
  if (locale === 'ja') return playlist;
  const text = playlist.i18n[locale];

  return {
    ...playlist,
    title: text.title,
    subtitle: text.subtitle,
    items: playlist.items.map((item, index) => ({
      title: localizeName(item.title, locale),
      artist: localizeName(item.artist, locale),
      cue: text.cues[index] ?? item.cue,
    })),
  };
}

export function findPlaylist(id: string | null | undefined): Playlist | null {
  if (!id) return null;
  return PLAYLISTS.find(p => p.id === id) ?? null;
}
