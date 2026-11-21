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
type PlaylistText = Partial<Record<Exclude<Locale, 'ja'>, { title: string; subtitle: string; cues: string[] }>>;

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
  {
    id: 'light-and-shadow',
    title: '光と影のドラマ',
    subtitle: 'バロックから近代へ、光の描き方をたどる',
    emoji: '🌓',
    items: [
      { title: '夜警', artist: 'レンブラント・ファン・レイン', cue: '闇の中から人物が浮かび上がる、群像劇から始めます' },
      { title: '真珠の耳飾りの少女', artist: 'ヨハネス・フェルメール', cue: '今度は静かな光が、少女の瞳と真珠に宿ります' },
      { title: '我が子を食らうサトゥルヌス', artist: 'フランシスコ・デ・ゴヤ', cue: '光は失われ、闇そのものが主役になります' },
      { title: '星月夜', artist: 'フィンセント・ファン・ゴッホ', cue: '夜空の光が、渦を巻いて動きはじめます' },
      { title: '記憶の固執', artist: 'サルバドール・ダリ', cue: '最後は、光も時間も溶け出す夢の風景へ' },
    ],
    i18n: {
      en: {
        title: 'The drama of light and shadow',
        subtitle: 'How painters handled light, from the Baroque to the modern age',
        cues: [
          'We start with figures emerging out of the darkness',
          'Now a quieter light, on a girl’s eyes and her pearl',
          'The light is gone; darkness itself takes the lead',
          'The light of the night sky begins to swirl',
          'We close with a dream where light and time melt',
        ],
      },
      fr: {
        title: 'Le drame de la lumière et de l’ombre',
        subtitle: 'La lumière des peintres, du baroque à l’époque moderne',
        cues: [
          'Commençons par des personnages surgissant de l’obscurité',
          'Une lumière plus calme, sur un regard et une perle',
          'La lumière disparaît : l’obscurité devient le sujet',
          'La lumière du ciel nocturne se met à tourbillonner',
          'Terminons par un rêve où la lumière et le temps fondent',
        ],
      },
      zh: {
        title: '光与影的戏剧',
        subtitle: '从巴洛克到近代，画家如何描绘光',
        cues: [
          '从黑暗中浮现的群像开始',
          '这次是静谧的光，落在少女的眼眸与珍珠上',
          '光消失了，黑暗本身成为主角',
          '夜空的光开始旋转流动',
          '最后走进光与时间一同融化的梦境',
        ],
      },
      es: {
        title: 'El drama de la luz y la sombra',
        subtitle: 'Cómo pintaron la luz, del barroco a la edad moderna',
        cues: [
          'Empezamos con figuras que emergen de la oscuridad',
          'Ahora una luz más serena, en unos ojos y una perla',
          'La luz desaparece: la oscuridad se vuelve protagonista',
          'La luz del cielo nocturno empieza a girar',
          'Cerramos en un sueño donde la luz y el tiempo se derriten',
        ],
      },
    },
  },
  {
    id: 'passion-colors',
    title: '情熱の色彩',
    subtitle: '黄金と赤、そして静けさへ',
    emoji: '🎨',
    items: [
      { title: 'ひまわり', artist: 'フィンセント・ファン・ゴッホ', cue: '黄色があふれ出す、情熱の始まりです' },
      { title: '接吻', artist: 'グスタフ・クリムト', cue: '金箔の輝きが、永遠の愛を包みます' },
      { title: 'ゲルニカ', artist: 'パブロ・ピカソ', cue: '色が消え、白と黒の叫びだけが残ります' },
      { title: '叫び', artist: 'エドヴァルド・ムンク', cue: '渦巻く赤い空の下、不安が響きます' },
      { title: '睡蓮', artist: 'クロード・モネ', cue: '最後は穏やかな色のなかで、心を静めましょう' },
    ],
    i18n: {
      en: {
        title: 'Colours of passion',
        subtitle: 'Gold and red, and then quiet',
        cues: [
          'Passion begins where the yellow overflows',
          'Gold leaf wraps itself around an eternal embrace',
          'Colour disappears; only a black and white scream is left',
          'Anxiety echoes under a swirling red sky',
          'We end in calm colours, letting the mind settle',
        ],
      },
      fr: {
        title: 'Les couleurs de la passion',
        subtitle: 'L’or et le rouge, puis le calme',
        cues: [
          'La passion commence là où le jaune déborde',
          'La feuille d’or enveloppe une étreinte éternelle',
          'La couleur disparaît : il ne reste qu’un cri en noir et blanc',
          'L’angoisse résonne sous un ciel rouge tourbillonnant',
          'Finissons dans des couleurs apaisées',
        ],
      },
      zh: {
        title: '热情的色彩',
        subtitle: '金与红，然后归于宁静',
        cues: [
          '热情从满溢的黄色开始',
          '金箔的光辉包裹着永恒的爱',
          '色彩消失，只剩下黑白的呐喊',
          '在旋转的红色天空下，不安回响',
          '最后在沉静的色彩中平复心绪',
        ],
      },
      es: {
        title: 'Los colores de la pasión',
        subtitle: 'Oro y rojo, y después la calma',
        cues: [
          'La pasión empieza donde el amarillo se desborda',
          'El pan de oro envuelve un abrazo eterno',
          'El color desaparece: solo queda un grito en blanco y negro',
          'La angustia resuena bajo un cielo rojo en remolino',
          'Terminamos en colores serenos, para calmar la mirada',
        ],
      },
    },
  },
  {
    id: 'renaissance-ideal',
    title: 'ルネサンスの理想美',
    subtitle: '調和と均衡、そしてその崩壊',
    emoji: '🏛️',
    items: [
      { title: 'アテナイの学堂', artist: 'ラファエロ・サンティ', cue: '知性と調和が支配する空間から始めます' },
      { title: 'ヴィーナスの誕生', artist: 'サンドロ・ボッティチェッリ', cue: '流れる曲線が描く、理想の女性像へ' },
      { title: 'ダビデ像', artist: 'ミケランジェロ・ブオナローティ', cue: '絵画から彫刻へ、大理石に宿る理想の肉体' },
      { title: 'モナ・リザ', artist: 'レオナルド・ダ・ヴィンチ', cue: '謎めいた微笑みが、見る者を引き込みます' },
      { title: 'アビニヨンの娘たち', artist: 'パブロ・ピカソ', cue: 'そして調和は崩れ、近代美術の扉が開きます' },
    ],
    i18n: {
      en: {
        title: 'The Renaissance ideal',
        subtitle: 'Harmony and balance — and how they broke',
        cues: [
          'We begin in a space ruled by reason and harmony',
          'Flowing curves draw the ideal female figure',
          'From painting to sculpture: the ideal body in marble',
          'An enigmatic smile draws the viewer in',
          'And then harmony breaks, opening the door to modern art',
        ],
      },
      fr: {
        title: 'L’idéal de la Renaissance',
        subtitle: 'Harmonie et équilibre — puis leur rupture',
        cues: [
          'Commençons dans un espace régi par la raison et l’harmonie',
          'Des courbes fluides dessinent la figure féminine idéale',
          'De la peinture à la sculpture : le corps idéal dans le marbre',
          'Un sourire énigmatique attire le regard',
          'Puis l’harmonie se brise et l’art moderne commence',
        ],
      },
      zh: {
        title: '文艺复兴的理想之美',
        subtitle: '和谐与均衡，以及它们的崩塌',
        cues: [
          '从理性与和谐主宰的空间开始',
          '流动的曲线勾勒出理想的女性形象',
          '从绘画走向雕塑：大理石中的理想肉体',
          '神秘的微笑将观者深深吸引',
          '接着和谐崩塌，近代美术的大门打开',
        ],
      },
      es: {
        title: 'El ideal del Renacimiento',
        subtitle: 'Armonía y equilibrio, y su ruptura',
        cues: [
          'Empezamos en un espacio regido por la razón y la armonía',
          'Curvas fluidas dibujan la figura femenina ideal',
          'De la pintura a la escultura: el cuerpo ideal en mármol',
          'Una sonrisa enigmática atrae la mirada',
          'Y entonces la armonía se rompe y nace el arte moderno',
        ],
      },
    },
  },
  {
    id: 'orsay-joy-of-living',
    title: 'オルセー、いまを生きる歓び',
    subtitle: '働くこと、祝うこと、そして夜空を見上げること',
    emoji: '✨',
    items: [
      { title: '落ち穂拾い', artist: 'ジャン＝フランソワ・ミレー', cue: '夕暮れの畑で身をかがめる、静かな暮らしの祈りから始めます' },
      { title: '床削り', artist: 'ギュスターヴ・カイユボット', cue: 'パリの室内へ。光のなかで働く人々の力強い背中を見つめます' },
      { title: 'パリ、モントルグイユ通り、1878年6月30日の祝祭', artist: 'クロード・モネ', cue: '仕事の手を止め、三色旗がはためく祝祭の街角へ繰り出しましょう' },
      { title: 'アレアレア', artist: 'ポール・ゴーギャン', cue: '遠くタヒチの楽園で、赤い大地と音色に身を委ねます' },
      { title: 'ローヌ川の星月夜', artist: 'フィンセント・ファン・ゴッホ', cue: '最後は水面に星がゆらめく、アルルの静かな夜空で締めくくります' },
    ],
    i18n: {
      en: {
        title: 'Orsay: The joy of living now',
        subtitle: 'Working, celebrating, and looking up at the night sky',
        cues: [
          'We begin at dusk in the fields, with a quiet prayer of daily labour',
          'Indoors in Paris, watching the strong backs of men at work in the light',
          'Stepping out into a street alive with tricolour flags on a festival day',
          'Far away in Tahiti, surrendering to red earth and gentle music',
          'We close beneath the quiet night sky of Arles, where stars shimmer on the water',
        ],
      },
      fr: {
        title: 'Orsay : la joie de vivre au présent',
        subtitle: 'Travailler, célébrer et lever les yeux vers la nuit',
        cues: [
          'Commençons au crépuscule dans les champs, par une prière silencieuse du labeur',
          'À l’intérieur à Paris, devant le dos vigoureux des ouvriers dans la lumière',
          'Sortons dans une rue pavoisée de drapeaux un jour de fête',
          'Loin à Tahiti, au rythme de la terre rouge et d’une douce mélodie',
          'Terminons sous la nuit paisible d’Arles, où les étoiles miroitent sur le fleuve',
        ],
      },
      zh: {
        title: '奥赛：活在当下的欢愉',
        subtitle: '劳作、欢庆，然后仰望星空',
        cues: [
          '从暮色田野里俯身劳作的静谧祈祷开始',
          '走进巴黎的室内，凝视光影中劳动者坚实的背影',
          '停下手中的活，走向三色旗飘扬的欢庆街头',
          '远赴塔希提的乐园，沉醉于红土与悠扬乐声之中',
          '最后在星光摇曳于河面的阿尔勒静夜里收尾',
        ],
      },
      es: {
        title: 'Orsay: la alegría de vivir el presente',
        subtitle: 'Trabajar, celebrar y mirar el cielo nocturno',
        cues: [
          'Empezamos al caer la tarde en el campo, con la quietud del trabajo diario',
          'Entramos en un piso de París para ver a los obreros trabajar bajo la luz',
          'Salimos a una calle festiva, vibrante de banderas tricolores',
          'Lejos, en Tahití, dejándonos llevar por la tierra roja y la música',
          'Cerramos bajo la noche serena de Arlés, con estrellas reflejadas en el río',
        ],
      },
    },
  },
  {
    id: 'turner-sublime',
    title: 'ターナーと崇高の光',
    subtitle: '荒れ狂う自然から、蒸気と光の抽象へ',
    emoji: '⛵',
    items: [
      { title: 'グリゾン州の雪崩', artist: 'J.M.W. ターナー', cue: '自然が牙をむく一瞬の恐怖——ロマン主義が語った「崇高」から始めます' },
      { title: '戦艦テメレール', artist: 'J.M.W. ターナー', cue: '帆船の時代が終わり、蒸気船に曳かれてゆく夕暮れの海へ' },
      { title: '奴隷船', artist: 'J.M.W. ターナー', cue: '嵐の海に浮かぶのは、近代の歴史が抱えた深い痛みでした' },
      { title: '雨、蒸気、速度――グレート・ウェスタン鉄道', artist: 'J.M.W. ターナー', cue: '雨と煙を突き抜ける蒸気機関車。産業革命のスピードが画面を溶かします' },
      { title: 'ノラム城、日の出', artist: 'J.M.W. ターナー', cue: '最後は輪郭さえ溶け出し、光そのものになった朝の風景で締めくくります' },
    ],
    i18n: {
      en: {
        title: 'Turner and the sublime light',
        subtitle: 'From untamed nature to steam and pure light',
        cues: [
          'We begin with nature’s sudden terror — what Romanticism called the sublime',
          'A sailing warship towed away by steam under a burning evening sky',
          'Out on the stormy sea floats a dark reckoning with modern history',
          'A locomotive cuts through rain and smoke, dissolving speed into atmosphere',
          'We close where even outlines melt away into morning light itself',
        ],
      },
      fr: {
        title: 'Turner et la lumière sublime',
        subtitle: 'De la nature déchaînée à la vapeur et à la lumière pure',
        cues: [
          'Commençons par la terreur soudaine de la nature : le sublime romantique',
          'Un navire de guerre à voile remorqué par la vapeur au crépuscule',
          'Dans la mer déchaînée affleure une blessure profonde de l’histoire moderne',
          'Une locomotive perce la pluie et la fumée, mêlant vitesse et atmosphère',
          'Terminons là où les contours mêmes se dissolvent dans la lumière du matin',
        ],
      },
      zh: {
        title: '透纳与崇高之光',
        subtitle: '从狂暴的自然，走向蒸汽与光的抽象',
        cues: [
          '从自然骤然露出的惊惧力量开始——浪漫主义所言的「崇高」',
          '暮色海面上，旧时代的风帆战舰正被蒸汽船拖向终点',
          '风暴汹涌的大海中，浮现出近代历史深沉的伤痛',
          '蒸汽机车穿过暴雨与浓烟，工业革命的速度融化了画面',
          '最后，连轮廓也消融在晨光之中，只留下纯粹的光本身',
        ],
      },
      es: {
        title: 'Turner y la luz sublime',
        subtitle: 'De la naturaleza indómita al vapor y a la luz pura',
        cues: [
          'Empezamos con el terror súbito de la naturaleza: lo que el romanticismo llamó sublime',
          'Un navío de vela remolcado por el vapor bajo un cielo encendido',
          'En el mar tempestuoso aflora una herida profunda de la historia moderna',
          'Una locomotora atraviesa la lluvia y el humo, disolviendo la velocidad en luz',
          'Cerramos donde incluso los contornos se funden en la luz de la mañana',
        ],
      },
    },
  },
  {
    id: 'louvre-renaissance',
    title: 'ルーヴル、ルネサンスのまなざし',
    subtitle: '技法の革新、肖像の魂、そして旅する知性',
    emoji: '🖼️',
    items: [
      { title: '岩窟の聖母', artist: 'レオナルド・ダ・ヴィンチ', cue: 'スフマートと光影が聖なる情景を一変させた、レオナルドの革新から始めます' },
      { title: '美しきフェロニエール', artist: 'レオナルド・ダ・ヴィンチ', cue: '静かな視線の奥に、人物の複雑な心まで描き出す肖像芸術の極みへ' },
      { title: '田園の合奏', artist: 'ティツィアーノ・ヴェチェッリオ', cue: '光と色彩の都ヴェネツィアが奏でる、詩情ゆたかな田園の響き' },
      { title: 'サイ', artist: 'アルブレヒト・デューラー', cue: '実物を見ずに、旅人の言葉と版画の力で世界を描き出した知性の冒険' },
      { title: 'カナの婚礼', artist: 'パオロ・ヴェロネーゼ', cue: '最後は祝祭のにぎわいに満ちた、ルーヴル最大のルネサンス大作で締めくくります' },
    ],
    i18n: {
      en: {
        title: 'Louvre: Visions of the Renaissance',
        subtitle: 'New techniques, living portraits, and travelling minds',
        cues: [
          'We begin with Leonardo’s revolution in sfumato and shadow inside a sacred cave',
          'Into a portrait whose quiet gaze reveals a living mind within',
          'To the poetic colour and music of Venice in the open countryside',
          'Drawn from travellers’ tales alone, a print that carried an unseen animal across Europe',
          'We close at a grand Renaissance feast, the largest canvas in the Louvre',
        ],
      },
      fr: {
        title: 'Louvre : regards de la Renaissance',
        subtitle: 'Invention technique, âme du portrait et curiosité du monde',
        cues: [
          'Commençons par la révolution du sfumato et de l’ombre chez Léonard',
          'Vers un portrait dont le regard silencieux laisse affleurer la vie intérieure',
          'À la couleur et à la poésie vénitiennes, au cœur d’un paysage pastoral',
          'Dessiné d’après de simples récits, une estampe qui fit voyager l’inconnu à travers l’Europe',
          'Terminons au cœur d’un festin vénitien, la plus vaste toile du Louvre',
        ],
      },
      zh: {
        title: '卢浮宫：文艺复兴的凝视',
        subtitle: '技法的革新、肖像的灵魂与远行的求知欲',
        cues: [
          '从达·芬奇以晕涂法与明暗革新圣像画的时刻开始',
          '走进一幅静谧肖像的深邃目光，感受人物内心的波澜',
          '来到威尼斯画派的田园诗境，倾听色彩与乐声的合奏',
          '仅凭旅人传述与版画之力，在纸上重现未曾亲见的远方奇兽',
          '最后在卢浮宫最宏大的文艺复兴盛宴画卷中收尾',
        ],
      },
      es: {
        title: 'Louvre: miradas del Renacimiento',
        subtitle: 'Técnica, alma del retrato y curiosidad por el mundo',
        cues: [
          'Empezamos con la revolución del sfumato y la sombra en Leonardo',
          'Hacia un retrato cuya mirada serena deja entrever la vida interior',
          'Al color y la poesía de Venecia en un paisaje pastoral',
          'Dibujado solo a partir de relatos, un grabado que llevó lo desconocido por toda Europa',
          'Cerramos en un gran banquete renacentista, el lienzo más monumental del Louvre',
        ],
      },
    },
  },
  {
    id: 'paris-theater',
    title: '劇場をめぐる19世紀パリ',
    subtitle: 'ロマン派の悲劇から、舞台袖と夜のカフェ＝コンセールへ',
    emoji: '🎭',
    items: [
      { title: '墓地のハムレットとホレイショー', artist: 'ウジェーヌ・ドラクロワ', cue: 'シェイクスピアの悲劇に心を震わせた、ロマン主義のドラマから幕を開けます' },
      { title: 'クリスパンとスカパン', artist: 'オノレ・ドーミエ', cue: '喜劇の役者たちの巧みな駆け引きを、鋭い明暗と風刺の筆でとらえます' },
      { title: '舞台の踊り子', artist: 'エドガー・ドガ', cue: '照明を浴びる華やかなエトワールと、舞台袖のわずかな緊張感' },
      { title: 'フォリー・ベルジェールのバー', artist: 'エドゥアール・マネ', cue: '鏡の奥に広がる観客席。華やかな娯楽場の喧騒と、ひとりの孤独なまなざし' },
      { title: 'ムーラン・ルージュにて', artist: 'アンリ・ド・トゥールーズ＝ロートレック', cue: '最後はガス灯と緑の影が揺れるモンマルトルの夜へご案内します' },
    ],
    i18n: {
      en: {
        title: 'Stage and spotlight in 19th-century Paris',
        subtitle: 'From Shakespearean drama to backstage dancers and cabaret nights',
        cues: [
          'We raise the curtain on Romantic drama inspired by Shakespeare’s tragic stage',
          'To comic actors caught mid-scheme under Daumier’s sharp theatrical light',
          'Into the footlights of the Opéra, where a star dancer glides past the wings',
          'Behind the marble bar of a lively music hall, a quiet gaze meets the mirrored crowd',
          'We close in the gaslit shadows and nightlife of Montmartre’s Moulin Rouge',
        ],
      },
      fr: {
        title: 'Scènes et coulisses du Paris du XIXe siècle',
        subtitle: 'Du drame shakespearien aux danseuses de l’Opéra et aux cabarets',
        cues: [
          'Levons le rideau sur le drame romantique inspiré par le théâtre de Shakespeare',
          'Place aux comédiens surpris en pleine intrigue dans le clair-obscur de Daumier',
          'Sous les feux de la rampe à l’Opéra, une étoile s’élance devant les coulisses',
          'Derrière le comptoir d’un café-concert animé, un regard silencieux face au miroir',
          'Terminons dans les ombres électriques et la nuit du Moulin-Rouge à Montmartre',
        ],
      },
      zh: {
        title: '剧场与聚光灯下的十九世纪巴黎',
        subtitle: '从莎士比亚悲剧，走向歌剧院后台与蒙马特夜色',
        cues: [
          '从受莎士比亚戏剧启发的浪漫主义悲剧拉开帷幕',
          '走近杜米埃笔下明暗交错的喜剧舞台与狡黠对白',
          '步入巴黎歌剧院的聚光灯下，看首席舞者在舞台侧幕间起舞',
          '在喧闹游乐厅的大理石吧台后，静谧目光与镜中人群交错',
          '最后置身蒙马特红磨坊摇曳的煤气灯光与夜色之中',
        ],
      },
      es: {
        title: 'Escena y candilejas en el París del siglo XIX',
        subtitle: 'Del drama shakespeariano a los bastidores de la Ópera y el cabaret',
        cues: [
          'Alzamos el telón con el drama romántico inspirado en el teatro de Shakespeare',
          'A dos actores cómicos sorprendidos en plena intriga bajo la luz de Daumier',
          'Bajo las candilejas de la Ópera, una bailarina estrella se desliza ante los bastidores',
          'Tras la barra de un bullicioso café-concierto, una mirada serena frente al espejo',
          'Cerramos entre las sombras y luces de gas del Moulin Rouge en Montmartre',
        ],
      },
    },
  },
];

/** A tour with its wording, titles and artists in the visitor's language. */
export function localizePlaylist(playlist: Playlist, locale: Locale): Playlist {
  if (locale === 'ja') return playlist;
  const text = playlist.i18n[locale] ?? playlist.i18n['en'] ?? {
    title: playlist.title,
    subtitle: playlist.subtitle,
    cues: playlist.items.map(i => i.cue),
  };

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

export function findPlaylist(id: string | null | undefined, playlists: Playlist[] = PLAYLISTS): Playlist | null {
  if (!id) return null;
  return playlists.find(p => p.id === id) ?? null;
}

/**
 * Combine dynamic D1 featured tours ahead of bundled static tours,
 * deduplicating by `id` so a dynamic tour can also override a static one.
 */
export function mergePlaylists(dynamicTours: Playlist[], staticTours: Playlist[] = PLAYLISTS): Playlist[] {
  if (!dynamicTours.length) return staticTours;
  const seen = new Set<string>();
  const merged: Playlist[] = [];
  for (const tour of [...dynamicTours, ...staticTours]) {
    if (seen.has(tour.id)) continue;
    seen.add(tour.id);
    merged.push(tour);
  }
  return merged;
}
