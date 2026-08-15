/**
 * Curated viewing points ("hotspots") for well-known artworks.
 *
 * Coordinates are hand-placed against one pinned Wikimedia Commons file per
 * artwork, so the guide must display that exact file — a Commons *search*
 * can return a detail shot or a different version and the marks would land on
 * the wrong part of the picture. LLMs cannot see the image either, so asking
 * a model for coordinates would only produce plausible-looking guesses.
 */

import { Locale } from './i18n';

/** Wording of one point in a language other than Japanese. */
interface HotspotText {
  label: string;
  detail: string;
  keywords: string[];
}

export interface Hotspot {
  id: string;
  /** Caption shown next to the mark while it is focused. */
  label: string;
  /** One or two sentences read on the panel when the visitor taps the mark. */
  detail: string;
  /** Same point in the other guide languages; narration is matched per language. */
  i18n: Record<Exclude<Locale, 'ja'>, HotspotText>;
  /** Centre of the point of interest, 0–1 of the image frame. */
  x: number;
  y: number;
  /** Magnification used when focusing. */
  zoom: number;
  /** Narration wording that should bring this point into focus. */
  keywords: string[];
}

export interface HotspotSet {
  title: string;
  artist: string;
  /** Extra titles that should resolve to this set (series names, short forms). */
  aliases: string[];
  /** Wikimedia Commons file name the coordinates were measured on. */
  file: string;
  hotspots: Hotspot[];
}

export const HOTSPOT_SETS: HotspotSet[] = [
  {
    title: '富嶽三十六景 神奈川沖浪裏',
    artist: '葛飾北斎',
    aliases: [
      '神奈川沖浪裏',
      '神奈川沖浪裡',
      'グレート・ウェーブ',
      'the great wave off kanagawa',
      'the great wave',
      'la grande vague de kanagawa',
      '神奈川冲浪里',
    ],
    file: 'Tsunami by hokusai 19th century.jpg',
    hotspots: [
      {
        id: 'claw',
        label: '波の爪',
        detail: '砕ける波頭が、白い鉤爪のように舟へ伸びています。北斎は水しぶきの一粒までを図案化し、自然の力を生き物のように描きました。',
        x: 0.36,
        y: 0.2,
        zoom: 2.4,
        keywords: ['波', '大波', '波頭', '爪', 'しぶき', '飛沫', 'うねり'],
        i18n: {
          en: {
            label: 'The claw of the wave',
            detail: 'The breaking crest reaches for the boats like white claws. Hokusai stylised every drop of spray, turning the force of nature into a living creature.',
            keywords: ['wave', 'crest', 'claw', 'spray', 'foam', 'swell'],
          },
          fr: {
            label: 'La griffe de la vague',
            detail: 'La crête qui se brise s’étire vers les barques comme des griffes blanches. Hokusai a stylisé chaque goutte d’écume, faisant de la force de la nature un être vivant.',
            keywords: ['vague', 'crête', 'griffe', 'écume', 'embrun', 'houle'],
          },
          zh: {
            label: '浪的利爪',
            detail: '碎裂的浪头如白色利爪般伸向小船。北斋把每一滴浪花都图案化，使自然之力如同活物。',
            keywords: ['浪', '大浪', '浪头', '爪', '浪花', '波涛'],
          },
        },
      },
      {
        id: 'fuji',
        label: '小さな富士山',
        detail: '画面の中央下、波の谷間に富士山が小さく座っています。主役のはずの富士を遠景に退けたことで、波の巨大さが際立ちます。',
        x: 0.63,
        y: 0.71,
        zoom: 3,
        keywords: ['富士', '富士山', '遠景', '雪'],
        i18n: {
          en: {
            label: 'The small Mount Fuji',
            detail: 'Low in the centre, Fuji sits in the trough of the wave. By pushing the supposed subject into the distance, Hokusai makes the wave feel enormous.',
            keywords: ['Fuji', 'mountain', 'distance', 'snow'],
          },
          fr: {
            label: 'Le petit mont Fuji',
            detail: 'Au centre, en bas, le Fuji se tient dans le creux de la vague. En reléguant le sujet attendu à l’arrière-plan, Hokusai rend la vague immense.',
            keywords: ['Fuji', 'montagne', 'lointain', 'neige'],
          },
          zh: {
            label: '小小的富士山',
            detail: '画面中下方、浪谷之间坐着小小的富士山。本应是主角的富士被推向远景，反而突显了浪的巨大。',
            keywords: ['富士', '富士山', '远景', '雪'],
          },
        },
      },
      {
        id: 'boats',
        label: '押送船と漕ぎ手',
        detail: '三艘の舟には、身をかがめた漕ぎ手たちが乗っています。逃げるのではなく波に沿って舟を操る姿が、この絵に緊張を与えています。',
        x: 0.17,
        y: 0.66,
        zoom: 2.8,
        keywords: ['舟', '船', '漕ぎ手', '人', '押送船'],
        i18n: {
          en: {
            label: 'The boats and their rowers',
            detail: 'Three fast cargo boats carry crouching rowers. They are not fleeing but steering along the wave, and that is what gives the print its tension.',
            keywords: ['boat', 'boats', 'rower', 'crew', 'men'],
          },
          fr: {
            label: 'Les barques et leurs rameurs',
            detail: 'Trois barques rapides portent des rameurs courbés. Ils ne fuient pas : ils épousent la vague, et c’est de là que vient la tension de l’estampe.',
            keywords: ['barque', 'bateau', 'rameur', 'hommes', 'équipage'],
          },
          zh: {
            label: '船与划手',
            detail: '三艘快船上是低伏的划手。他们并非逃避，而是顺着浪势操船，这才是画面张力的来源。',
            keywords: ['船', '小船', '划手', '人'],
          },
        },
      },
      {
        id: 'cartouche',
        label: '題箋と落款',
        detail: '左上の枠が「冨嶽三十六景 神奈川沖浪裏」の題箋、その下が「北斎改為一筆」の落款です。輸入品のベロ藍（プルシアンブルー）が全体を支えています。',
        x: 0.07,
        y: 0.11,
        zoom: 3.2,
        keywords: ['落款', '署名', '題', 'ベロ藍', 'プルシアンブルー', '藍', '版画', '摺り'],
        i18n: {
          en: {
            label: 'Title cartouche and signature',
            detail: 'The box at the top left holds the series title, with Hokusai’s signature below it. Imported Prussian blue carries the whole print.',
            keywords: ['signature', 'title', 'cartouche', 'Prussian blue', 'blue', 'print', 'woodblock'],
          },
          fr: {
            label: 'Cartouche et signature',
            detail: 'Le cadre en haut à gauche porte le titre de la série, et au-dessous la signature d’Hokusai. Le bleu de Prusse importé soutient toute l’estampe.',
            keywords: ['signature', 'titre', 'cartouche', 'bleu de Prusse', 'bleu', 'estampe'],
          },
          zh: {
            label: '题筺与落款',
            detail: '左上方的方框是系列题筺，下方是北斋的落款。进口的普鲁士蓝支撑起整幅画面。',
            keywords: ['落款', '签名', '题', '普鲁士蓝', '蓝', '版画'],
          },
        },
      },
    ],
  },
  {
    title: '星月夜',
    artist: 'フィンセント・ファン・ゴッホ',
    aliases: ['星月夜（サン＝レミ）', 'the starry night', 'starry night', 'la nuit étoilée', '星降る夜'],
    file: 'Van Gogh - Starry Night - Google Art Project.jpg',
    hotspots: [
      {
        id: 'swirl',
        label: '渦巻く夜空',
        detail: '空を横切る大きな渦。実際の夜空には無いもので、ゴッホが感じた宇宙の運動そのものが筆の跡として残されています。',
        x: 0.5,
        y: 0.36,
        zoom: 2.4,
        keywords: ['渦', 'うねり', '夜空', '空', '筆致', 'タッチ', '流れ'],
        i18n: {
          en: {
            label: 'The swirling night sky',
            detail: 'A great spiral crosses the sky. No such thing is visible at night: what remains in the brushstrokes is the motion Van Gogh felt in the universe.',
            keywords: ['swirl', 'spiral', 'sky', 'night sky', 'brushstroke', 'stars'],
          },
          fr: {
            label: 'Le ciel nocturne tourbillonnant',
            detail: 'Une grande spirale traverse le ciel. Rien de tel n’existe la nuit : ce que la touche conserve, c’est le mouvement que Van Gogh sentait dans l’univers.',
            keywords: ['tourbillon', 'spirale', 'ciel', 'nuit', 'touche'],
          },
          zh: {
            label: '漩涡的夜空',
            detail: '一道巨大的漩涡横跨夜空。现实的夜空并无此景，笔触里留下的是梵高感受到的宇宙运动。',
            keywords: ['漩涡', '旋涡', '夜空', '天空', '笔触'],
          },
        },
      },
      {
        id: 'cypress',
        label: '燃え上がる糸杉',
        detail: '手前で黒い炎のように立ち上がるのは糸杉。ヨーロッパでは墓地の木であり、地上と天空をつなぐ柱として画面を貫いています。',
        x: 0.2,
        y: 0.62,
        zoom: 2.2,
        keywords: ['糸杉', '木', '手前', '死', '炎'],
        i18n: {
          en: {
            label: 'The burning cypress',
            detail: 'The dark shape rising in the foreground like a black flame is a cypress: in Europe a graveyard tree, here a column joining earth and sky.',
            keywords: ['cypress', 'tree', 'foreground', 'flame', 'death'],
          },
          fr: {
            label: 'Le cyprès en flammes',
            detail: 'La forme sombre qui monte au premier plan comme une flamme noire est un cyprès : arbre des cimetières en Europe, ici colonne entre terre et ciel.',
            keywords: ['cyprès', 'arbre', 'premier plan', 'flamme', 'mort'],
          },
          zh: {
            label: '燃烧般的柏树',
            detail: '前景中如黑色火焰般竖起的是柏树。在欧洲它是墓地之树，在这里则是连接大地与天空的柱子。',
            keywords: ['柏树', '树', '前景', '火焰', '死亡'],
          },
        },
      },
      {
        id: 'moon',
        label: '黄金の月',
        detail: '右上で渦を巻く月。ゴッホは黄色をこの絵の希望の色として使い、厚く盛り上げた絵具で光そのものを立体にしました。',
        x: 0.89,
        y: 0.17,
        zoom: 2.6,
        keywords: ['月', '黄色', '光', '星', '金色'],
        i18n: {
          en: {
            label: 'The golden moon',
            detail: 'The moon spirals at the top right. Van Gogh used yellow as the colour of hope here, and the thick paint turns light itself into something solid.',
            keywords: ['moon', 'yellow', 'light', 'gold', 'star'],
          },
          fr: {
            label: 'La lune dorée',
            detail: 'La lune tournoie en haut à droite. Van Gogh fait du jaune la couleur de l’espoir, et la pâte épaisse donne un relief à la lumière elle-même.',
            keywords: ['lune', 'jaune', 'lumière', 'or', 'étoile'],
          },
          zh: {
            label: '金色的月亮',
            detail: '右上方旋转的月亮。梵高把黄色当作希望的颜色，堆叠的颜料让光本身有了厚度。',
            keywords: ['月', '黄色', '光', '星', '金色'],
          },
        },
      },
      {
        id: 'village',
        label: '眠る村と尖塔',
        detail: '麓に広がる村は、療養先サン＝レミには無い北方風の風景です。故郷オランダの記憶が、糸杉より高い尖塔として描き込まれました。',
        x: 0.56,
        y: 0.8,
        zoom: 2.4,
        keywords: ['村', '教会', '尖塔', '家', 'サン＝レミ', '故郷'],
        i18n: {
          en: {
            label: 'The sleeping village and its spire',
            detail: 'The village below is northern, unlike anything around the asylum at Saint-Rémy. A memory of the Netherlands, painted as a spire taller than the cypress.',
            keywords: ['village', 'church', 'spire', 'houses', 'Saint-Rémy', 'home'],
          },
          fr: {
            label: 'Le village endormi et son clocher',
            detail: 'Le village en contrebas est nordique, étranger à Saint-Rémy. Un souvenir des Pays-Bas, peint sous la forme d’un clocher plus haut que le cyprès.',
            keywords: ['village', 'église', 'clocher', 'maisons', 'Saint-Rémy', 'pays natal'],
          },
          zh: {
            label: '熟睡的村庄与尖塔',
            detail: '山脚下的村庄是北方风格，并不存在于疗养地圣雷米。故乡荷兰的记忆，被画成高过柏树的尖塔。',
            keywords: ['村', '教堂', '尖塔', '房屋', '圣雷米', '故乡'],
          },
        },
      },
    ],
  },
  {
    title: 'モナ・リザ',
    artist: 'レオナルド・ダ・ヴィンチ',
    aliases: ['モナリザ', 'ラ・ジョコンダ', 'mona lisa', 'la joconde', '蒙娜丽莎'],
    file: 'Mona Lisa, by Leonardo da Vinci, from C2RMF retouched.jpg',
    hotspots: [
      {
        id: 'smile',
        label: '微笑む口元',
        detail: '口の端は輪郭線を持たず、影が霧のように溶けています。この技法がスフマート。見る角度で笑っているかどうかが変わります。',
        x: 0.46,
        y: 0.32,
        zoom: 2.8,
        keywords: ['微笑', 'ほほえみ', '笑み', '口', 'スフマート', '曖昧'],
        i18n: {
          en: {
            label: 'The smiling mouth',
            detail: 'The corners of the mouth have no outline; the shadows dissolve like mist. That technique is sfumato, and it is why the smile changes with your angle.',
            keywords: ['smile', 'mouth', 'lips', 'sfumato', 'ambiguous'],
          },
          fr: {
            label: 'La bouche souriante',
            detail: 'Les commissures n’ont aucun contour : l’ombre s’y dissout comme une brume. C’est le sfumato, et c’est pourquoi le sourire change selon l’angle.',
            keywords: ['sourire', 'bouche', 'lèvres', 'sfumato', 'ambigu'],
          },
          zh: {
            label: '微笑的嘴角',
            detail: '嘴角没有轮廓线，阴影如雾般消融。这就是晕涂法，也是笑容随角度变化的原因。',
            keywords: ['微笑', '笑容', '嘴', '晕涂', '模糊'],
          },
        },
      },
      {
        id: 'eyes',
        label: 'こちらを追う視線',
        detail: '瞳はわずかに正面を外れ、それでも鑑賞者を追ってくるように感じられます。まつげと眉が描かれていないことも謎めいた印象を強めています。',
        x: 0.45,
        y: 0.215,
        zoom: 2.8,
        keywords: ['視線', '瞳', '目', 'まなざし', '眉'],
        i18n: {
          en: {
            label: 'The gaze that follows you',
            detail: 'The eyes look slightly off centre and yet seem to follow the viewer. The missing eyelashes and eyebrows add to the mystery.',
            keywords: ['gaze', 'eyes', 'look', 'eyebrows'],
          },
          fr: {
            label: 'Le regard qui vous suit',
            detail: 'Les yeux ne fixent pas tout à fait de face, et pourtant ils semblent vous suivre. L’absence de cils et de sourcils renforce le mystère.',
            keywords: ['regard', 'yeux', 'sourcils'],
          },
          zh: {
            label: '追随你的目光',
            detail: '目光略微偏离正面，却仍似乎在追随观者。没有画出睫毛与眉毛，更添神秘。',
            keywords: ['目光', '眼睛', '瞳', '眉毛'],
          },
        },
      },
      {
        id: 'hands',
        label: '重ねられた手',
        detail: '肘掛けに置かれた手は、当時の肖像画では珍しい安らいだ姿勢です。指先の柔らかさが、この人物を生きた存在にしています。',
        x: 0.4,
        y: 0.83,
        zoom: 2.4,
        keywords: ['手', '指', '姿勢', '肘掛け', '衣'],
        i18n: {
          en: {
            label: 'The folded hands',
            detail: 'Resting on the arm of the chair, the hands take a relaxed pose rare in portraits of the time. Their softness makes the sitter feel alive.',
            keywords: ['hands', 'fingers', 'pose', 'armrest', 'sleeve'],
          },
          fr: {
            label: 'Les mains posées',
            detail: 'Posées sur l’accoudoir, les mains adoptent une attitude détendue, rare dans les portraits de l’époque. Leur douceur rend le modèle vivant.',
            keywords: ['mains', 'doigts', 'pose', 'accoudoir', 'manche'],
          },
          zh: {
            label: '交叠的双手',
            detail: '搭在扶手上的双手姿态放松，在当时的胖像中十分少见。指尖的柔软让人物显得鲜活。',
            keywords: ['手', '手指', '姿势', '扶手', '衣'],
          },
        },
      },
      {
        id: 'landscape',
        label: '左右で食い違う風景',
        detail: '背景の地平線は右のほうが高く描かれています。遠くほど青く霞ませる空気遠近法とあわせ、人物を非現実的な空間に浮かべています。',
        x: 0.86,
        y: 0.29,
        zoom: 2.4,
        keywords: ['背景', '風景', '地平線', '空気遠近法', '霞', '山', '道', '橋'],
        i18n: {
          en: {
            label: 'A landscape that does not line up',
            detail: 'The horizon sits higher on the right than on the left. With aerial perspective hazing the distance in blue, the sitter floats in an unreal space.',
            keywords: ['background', 'landscape', 'horizon', 'perspective', 'haze', 'mountains', 'bridge'],
          },
          fr: {
            label: 'Un paysage qui ne coïncide pas',
            detail: 'L’horizon est plus haut à droite qu’à gauche. Avec la perspective aérienne qui bleuit le lointain, le modèle flotte dans un espace irréel.',
            keywords: ['fond', 'paysage', 'horizon', 'perspective', 'brume', 'montagnes', 'pont'],
          },
          zh: {
            label: '左右不一致的风景',
            detail: '背景的地平线右高左低。配合让远处发蓝的空气透视，人物仿佛浮在一个非现实的空间里。',
            keywords: ['背景', '风景', '地平线', '透视', '雾', '山', '桥'],
          },
        },
      },
    ],
  },
  {
    title: '真珠の耳飾りの少女',
    artist: 'ヨハネス・フェルメール',
    aliases: [
      '青いターバンの少女',
      'girl with a pearl earring',
      'la jeune fille à la perle',
      '戴珍珠耳环的少女',
    ],
    file: 'Meisje met de parel.jpg',
    hotspots: [
      {
        id: 'pearl',
        label: '真珠の耳飾り',
        detail: '近づくと、真珠は白い絵具のたった二筆です。輪郭は無く、鋭い光と柔らかい反射だけで球体に見せています。',
        x: 0.62,
        y: 0.545,
        zoom: 3,
        keywords: ['真珠', '耳飾り', 'イヤリング', '光', '反射'],
        i18n: {
          en: {
            label: 'The pearl earring',
            detail: 'Up close the pearl is just two strokes of white paint. It has no outline: a sharp highlight and a soft reflection are enough to make a sphere.',
            keywords: ['pearl', 'earring', 'light', 'reflection'],
          },
          fr: {
            label: 'La perle',
            detail: 'De près, la perle n’est faite que de deux touches de blanc. Sans contour : un éclat vif et un reflet doux suffisent à suggérer une sphère.',
            keywords: ['perle', 'boucle d’oreille', 'lumière', 'reflet'],
          },
          zh: {
            label: '珍珠耳环',
            detail: '走近看，珍珠只是两笔白颜料。它没有轮廓，仅靠锐利的高光与柔和的反光就成了球体。',
            keywords: ['珍珠', '耳环', '光', '反光'],
          },
        },
      },
      {
        id: 'eyes',
        label: '振り返るまなざし',
        detail: '肩越しに振り返った一瞬。瞳の縁のわずかな潤みが、少女がいま何かを言いかけたような気配を作っています。',
        x: 0.42,
        y: 0.42,
        zoom: 2.6,
        keywords: ['まなざし', '視線', '瞳', '目', '振り返', '一瞬'],
        i18n: {
          en: {
            label: 'The glance over the shoulder',
            detail: 'One instant of turning back. A faint moisture at the rim of the eyes makes it feel as though she were about to speak.',
            keywords: ['gaze', 'eyes', 'glance', 'turning', 'moment'],
          },
          fr: {
            label: 'Le regard par-dessus l’épaule',
            detail: 'Un instant : elle se retourne. Une légère humidité au bord des yeux donne l’impression qu’elle allait parler.',
            keywords: ['regard', 'yeux', 'instant', 'se retourne'],
          },
          zh: {
            label: '回眸的目光',
            detail: '越过肩头回望的一瞬。眼眶边缘微微的湿润，仿佛少女正要开口。',
            keywords: ['目光', '眼睛', '回眸', '一瞬'],
          },
        },
      },
      {
        id: 'lips',
        label: '唇のきらめき',
        detail: '下唇の湿った光は、フェルメールが好んだ点状のハイライト。同じ技法が真珠にも使われ、画面全体に呼吸を与えています。',
        x: 0.38,
        y: 0.515,
        zoom: 3,
        keywords: ['唇', '口', 'ハイライト', '湿'],
        i18n: {
          en: {
            label: 'The glint on the lips',
            detail: 'The moist light on the lower lip is one of Vermeer’s dotted highlights. The same trick lights the pearl and makes the picture breathe.',
            keywords: ['lips', 'mouth', 'highlight', 'moist'],
          },
          fr: {
            label: 'L’éclat des lèvres',
            detail: 'La lumière humide sur la lèvre inférieure est l’un des rehauts pointés chéris de Vermeer. Le même procédé éclaire la perle.',
            keywords: ['lèvres', 'bouche', 'rehaut', 'humide'],
          },
          zh: {
            label: '嘴唇的光泽',
            detail: '下唇湿润的光，是维米尔偏爱的点状高光。同样的手法也用在珍珠上，让画面呼吸起来。',
            keywords: ['唇', '嘴', '高光', '湿润'],
          },
        },
      },
      {
        id: 'turban',
        label: '青いターバン',
        detail: '高価なラピスラズリから作るウルトラマリンを惜しみなく使った青。黄色い布と隣り合わせることで互いの鮮やかさを高めています。',
        x: 0.52,
        y: 0.26,
        zoom: 2.4,
        keywords: ['ターバン', '青', 'ウルトラマリン', 'ラピスラズリ', '黄色', '布'],
        i18n: {
          en: {
            label: 'The blue turban',
            detail: 'Ultramarine made from costly lapis lazuli, used without restraint. Set beside the yellow cloth, each colour makes the other more vivid.',
            keywords: ['turban', 'blue', 'ultramarine', 'lapis', 'yellow', 'cloth'],
          },
          fr: {
            label: 'Le turban bleu',
            detail: 'Un outremer tiré du coûteux lapis-lazuli, employé sans compter. Placé près du tissu jaune, chaque couleur avive l’autre.',
            keywords: ['turban', 'bleu', 'outremer', 'lapis', 'jaune', 'tissu'],
          },
          zh: {
            label: '蓝色头巾',
            detail: '用昂贵的青金石磨成的群青，毫不名惜地涂上。与黄色布相邻，两种颜色互相辉映。',
            keywords: ['头巾', '蓝', '群青', '青金石', '黄色', '布'],
          },
        },
      },
    ],
  },
  {
    title: '叫び',
    artist: 'エドヴァルド・ムンク',
    aliases: ['ムンクの叫び', 'the scream', 'le cri', '呐喊'],
    file: 'Edvard Munch, 1893, The Scream, oil, tempera and pastel on cardboard, 91 x 73 cm, National Gallery of Norway.jpg',
    hotspots: [
      {
        id: 'face',
        label: '耳をふさぐ顔',
        detail: '叫んでいるのはこの人物ではありません。ムンクの日記によれば、彼は「自然を貫く叫び」を聞き、それに耐えかねて耳をふさいでいます。',
        x: 0.52,
        y: 0.57,
        zoom: 2.4,
        keywords: ['顔', '叫', '耳', '人物', '口'],
        i18n: {
          en: {
            label: 'The face covering its ears',
            detail: 'This figure is not the one screaming. By Munch’s diary he heard “a scream passing through nature” and covered his ears against it.',
            keywords: ['face', 'scream', 'ears', 'figure', 'mouth'],
          },
          fr: {
            label: 'Le visage qui se bouche les oreilles',
            detail: 'Ce n’est pas ce personnage qui crie. Selon le journal de Munch, il entendit « un cri traversant la nature » et se boucha les oreilles.',
            keywords: ['visage', 'cri', 'oreilles', 'personnage', 'bouche'],
          },
          zh: {
            label: '捼住双耳的脸',
            detail: '呐喊的并不是这个人。根据蒙克的日记，他听见「穿透自然的呐喊」，于是捼住了耳朵。',
            keywords: ['脸', '呐喊', '耳', '人物', '嘴'],
          },
        },
      },
      {
        id: 'sky',
        label: '血のような空',
        detail: '波打つ赤い帯は夕焼けの記憶です。空だけが激しくうねり、それを見上げる人物の内側の動揺と一体になっています。',
        x: 0.45,
        y: 0.12,
        zoom: 2.2,
        keywords: ['空', '赤', '夕焼け', '雲', 'うねり'],
        i18n: {
          en: {
            label: 'The blood-red sky',
            detail: 'The waving red bands are a remembered sunset. Only the sky churns, and it merges with the turmoil inside the figure looking up at it.',
            keywords: ['sky', 'red', 'sunset', 'clouds'],
          },
          fr: {
            label: 'Le ciel couleur de sang',
            detail: 'Les bandes rouges ondulantes sont le souvenir d’un coucher de soleil. Seul le ciel s’agite, se confondant avec le trouble intérieur du personnage.',
            keywords: ['ciel', 'rouge', 'coucher de soleil', 'nuages'],
          },
          zh: {
            label: '血一样的天空',
            detail: '波动的红色条带是夕阳的记忆。只有天空在激烈翻涌，与仰望它的人物内心的骚动合为一体。',
            keywords: ['天空', '红', '夕阳', '云'],
          },
        },
      },
      {
        id: 'figures',
        label: '立ち去る二人',
        detail: '橋の奥にいる二人は何も気づかず歩き去ります。彼らの無関心が、手前の孤独をいっそう深くしています。',
        x: 0.07,
        y: 0.47,
        zoom: 3,
        keywords: ['二人', '人物', '橋の奥', '孤独', '無関心', '友人'],
        i18n: {
          en: {
            label: 'The two figures walking away',
            detail: 'The pair further along the bridge notice nothing and keep walking. Their indifference deepens the loneliness in the foreground.',
            keywords: ['two figures', 'friends', 'bridge', 'loneliness', 'indifference'],
          },
          fr: {
            label: 'Les deux silhouettes qui s’éloignent',
            detail: 'Les deux personnes plus loin sur le pont ne remarquent rien et continuent. Leur indifférence creuse la solitude du premier plan.',
            keywords: ['deux', 'silhouettes', 'pont', 'solitude', 'indifférence'],
          },
          zh: {
            label: '走开的两个人',
            detail: '桥的深处那两个人什么都没察觉，自顾走远。他们的冷漠让前景的孤独更深。',
            keywords: ['两个人', '人影', '桥', '孤独', '冷漠'],
          },
        },
      },
      {
        id: 'bridge',
        label: '突き刺さる橋の線',
        detail: '橋の手すりが鋭い斜めの線となって画面を切り裂きます。直線の風景とうねる空の対比が、落ち着かない感覚を生みます。',
        x: 0.25,
        y: 0.78,
        zoom: 2.2,
        keywords: ['橋', '斜め', '遠近', '手すり', '直線', '構図'],
        i18n: {
          en: {
            label: 'The stabbing line of the bridge',
            detail: 'The railing cuts across the picture as a sharp diagonal. Straight landscape against churning sky is what makes the image so unsettling.',
            keywords: ['bridge', 'diagonal', 'perspective', 'railing', 'line', 'composition'],
          },
          fr: {
            label: 'La ligne tranchante du pont',
            detail: 'La rambarde traverse l’image en une diagonale aiguë. Ce paysage rectiligne, opposé au ciel ondulant, crée le malaise.',
            keywords: ['pont', 'diagonale', 'perspective', 'rambarde', 'ligne', 'composition'],
          },
          zh: {
            label: '刺入画面的桥线',
            detail: '桥的护栏化作锐利的斜线划开画面。笔直的风景与翻涌的天空形成对比，令人不安。',
            keywords: ['桥', '斜线', '透视', '护栏', '直线', '构图'],
          },
        },
      },
    ],
  },
  {
    title: '睡蓮',
    artist: 'クロード・モネ',
    aliases: ['睡蓮の池', 'water lilies', 'nympheas', 'les nymphéas', 'nymphéas', '睡莲'],
    file: 'Claude Monet - Water Lilies - 1906, Ryerson.jpg',
    hotspots: [
      {
        id: 'flower',
        label: '咲いている花',
        detail: '水面に浮かぶ淡紅色の花。厚く置かれた数筆だけで、花弁の重さと水の張力が感じ取れます。',
        x: 0.42,
        y: 0.775,
        zoom: 2.8,
        keywords: ['花', '睡蓮', '淡紅', 'ピンク', '咲'],
        i18n: {
          en: {
            label: 'A flower in bloom',
            detail: 'A pale pink blossom floating on the surface. A few thick strokes are enough to convey the weight of the petals and the tension of the water.',
            keywords: ['flower', 'lily', 'pink', 'bloom'],
          },
          fr: {
            label: 'Une fleur éclose',
            detail: 'Une fleur rose pâle flotte à la surface. Quelques touches épaisses suffisent à rendre le poids des pétales et la tension de l’eau.',
            keywords: ['fleur', 'nymphéa', 'rose', 'éclose'],
          },
          zh: {
            label: '盛开的花',
            detail: '浮在水面上的淡粉色花朵。仅凭几笔厚涂，就能感到花瓣的重量与水的张力。',
            keywords: ['花', '睡莲', '粉色', '盛开'],
          },
        },
      },
      {
        id: 'reflection',
        label: '水に映る空',
        detail: '青と灰の広がりは水そのものではなく、水面に映った空です。空を描かずに空を見せる、モネの逆転した風景画です。',
        x: 0.28,
        y: 0.45,
        zoom: 2.2,
        keywords: ['空', '映', '反射', '水面', '雲', '青'],
        i18n: {
          en: {
            label: 'The sky reflected in the water',
            detail: 'The spread of blue and grey is not the water itself but the sky mirrored on it — Monet’s inverted landscape, showing the sky without painting it.',
            keywords: ['sky', 'reflection', 'surface', 'clouds', 'blue'],
          },
          fr: {
            label: 'Le ciel reflété dans l’eau',
            detail: 'L’étendue bleue et grise n’est pas l’eau mais le ciel qui s’y reflète : un paysage inversé, où Monet montre le ciel sans le peindre.',
            keywords: ['ciel', 'reflet', 'surface', 'nuages', 'bleu'],
          },
          zh: {
            label: '映在水中的天空',
            detail: '那片蓝与灰并非水本身，而是水面倒映的天空。不画天空却让人看见天空，这是莫奈的倒置风景。',
            keywords: ['天空', '倒映', '反射', '水面', '云', '蓝'],
          },
        },
      },
      {
        id: 'pads',
        label: '奥へ連なる葉',
        detail: '楕円の葉は上へ行くほど平たくなり、それだけで奥行きが生まれます。地平線も岸も描かれていません。',
        x: 0.75,
        y: 0.38,
        zoom: 2.4,
        keywords: ['葉', '奥行き', '構図', '地平線', '岸', '池'],
        i18n: {
          en: {
            label: 'Leaves receding into depth',
            detail: 'The oval pads flatten as they rise up the canvas, and that alone creates depth. Neither horizon nor bank is painted.',
            keywords: ['leaves', 'pads', 'depth', 'composition', 'horizon', 'pond'],
          },
          fr: {
            label: 'Les feuilles qui s’éloignent',
            detail: 'Les feuilles ovales s’aplatissent en montant dans la toile, et cela suffit à créer la profondeur. Ni horizon ni rive ne sont peints.',
            keywords: ['feuilles', 'profondeur', 'composition', 'horizon', 'rive', 'bassin'],
          },
          zh: {
            label: '向深处延伸的叶',
            detail: '椭圆的叶片越往上越扭平，仅此就产生了空间深度。画中既没有地平线，也没有岸。',
            keywords: ['叶', '深度', '构图', '地平线', '岸', '池塘'],
          },
        },
      },
      {
        id: 'signature',
        label: '署名',
        detail: '右下に「Claude Monet 1906」。ジヴェルニーの自宅の庭で、晩年のモネはこの池だけを繰り返し描き続けました。',
        x: 0.85,
        y: 0.94,
        zoom: 3,
        keywords: ['署名', 'ジヴェルニー', '庭', '晩年', '1906'],
        i18n: {
          en: {
            label: 'The signature',
            detail: '“Claude Monet 1906” at the lower right. In the garden of his house at Giverny, the elderly Monet painted this pond over and over.',
            keywords: ['signature', 'Giverny', 'garden', '1906'],
          },
          fr: {
            label: 'La signature',
            detail: '« Claude Monet 1906 » en bas à droite. Dans le jardin de sa maison de Giverny, Monet âgé a peint ce bassin encore et encore.',
            keywords: ['signature', 'Giverny', 'jardin', '1906'],
          },
          zh: {
            label: '签名',
            detail: '右下角写着「Claude Monet 1906」。在吉韦尼自家的花园里，晚年的莫奈反复描绘这个池塘。',
            keywords: ['签名', '吉韦尼', '花园', '1906'],
          },
        },
      },
    ],
  },
];

/** One point with its label, detail and keywords in the visitor's language. */
export function localizeHotspot(hotspot: Hotspot, locale: Locale): Hotspot {
  if (locale === 'ja') return hotspot;
  const text = hotspot.i18n[locale];
  return { ...hotspot, label: text.label, detail: text.detail, keywords: text.keywords };
}

export function localizeHotspotSet(set: HotspotSet, locale: Locale): HotspotSet {
  if (locale === 'ja') return set;
  return { ...set, hotspots: set.hotspots.map(hotspot => localizeHotspot(hotspot, locale)) };
}

/** Commons Special:FilePath resolves a file name to the image itself. */
export function hotspotImageUrl(file: string, width = 1200): string {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${width}`;
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[\s　・]/g, '');
}

export function findHotspotSet(title: string, artist: string): HotspotSet | null {
  const wanted = normalize(title);
  if (!wanted) return null;

  return (
    HOTSPOT_SETS.find(set => {
      const names = [set.title, ...set.aliases].map(normalize);
      const titleMatches = names.some(name => wanted === name || wanted.includes(name));
      if (!titleMatches) return false;
      // An artist is only a tiebreaker: visitors often leave the field empty.
      const givenArtist = normalize(artist);
      return !givenArtist || normalize(set.artist).includes(givenArtist) || givenArtist.includes(normalize(set.artist));
    }) ?? null
  );
}

/** Picks the point the narration is talking about right now, if any. */
export function matchHotspot(set: HotspotSet, spokenText: string): Hotspot | null {
  if (!spokenText) return null;

  // Western keywords are whole words, so match case-insensitively.
  const haystack = spokenText.toLowerCase();
  let best: { hotspot: Hotspot; at: number } | null = null;
  for (const hotspot of set.hotspots) {
    for (const keyword of hotspot.keywords) {
      const at = haystack.indexOf(keyword.toLowerCase());
      if (at !== -1 && (!best || at < best.at)) {
        best = { hotspot, at };
      }
    }
  }
  return best?.hotspot ?? null;
}
