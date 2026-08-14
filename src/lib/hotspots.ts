/**
 * Curated viewing points ("hotspots") for well-known artworks.
 *
 * Coordinates are hand-placed against one pinned Wikimedia Commons file per
 * artwork, so the guide must display that exact file — a Commons *search*
 * can return a detail shot or a different version and the marks would land on
 * the wrong part of the picture. LLMs cannot see the image either, so asking
 * a model for coordinates would only produce plausible-looking guesses.
 */

export interface Hotspot {
  id: string;
  /** Caption shown next to the mark while it is focused. */
  label: string;
  /** One or two sentences read on the panel when the visitor taps the mark. */
  detail: string;
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
    aliases: ['神奈川沖浪裏', '神奈川沖浪裡', 'グレート・ウェーブ', 'the great wave off kanagawa'],
    file: 'Tsunami by hokusai 19th century.jpg',
    hotspots: [
      {
        id: 'claw',
        label: '波の爪',
        detail: '砕ける波頭が、白い鉤爪のように舟へ伸びています。北斎は水しぶきの一粒までを図案化し、自然の力を生き物のように描きました。',
        x: 0.3,
        y: 0.25,
        zoom: 2.4,
        keywords: ['波', '大波', '波頭', '爪', 'しぶき', '飛沫', 'うねり'],
      },
      {
        id: 'fuji',
        label: '小さな富士山',
        detail: '画面の中央下、波の谷間に富士山が小さく座っています。主役のはずの富士を遠景に退けたことで、波の巨大さが際立ちます。',
        x: 0.63,
        y: 0.71,
        zoom: 3,
        keywords: ['富士', '富士山', '遠景', '雪'],
      },
      {
        id: 'boats',
        label: '押送船と漕ぎ手',
        detail: '三艘の舟には、身をかがめた漕ぎ手たちが乗っています。逃げるのではなく波に沿って舟を操る姿が、この絵に緊張を与えています。',
        x: 0.17,
        y: 0.66,
        zoom: 2.8,
        keywords: ['舟', '船', '漕ぎ手', '人', '押送船'],
      },
      {
        id: 'cartouche',
        label: '題箋と落款',
        detail: '左上の枠が「冨嶽三十六景 神奈川沖浪裏」の題箋、その下が「北斎改為一筆」の落款です。輸入品のベロ藍（プルシアンブルー）が全体を支えています。',
        x: 0.07,
        y: 0.11,
        zoom: 3.2,
        keywords: ['落款', '署名', '題', 'ベロ藍', 'プルシアンブルー', '藍', '版画', '摺り'],
      },
    ],
  },
  {
    title: '星月夜',
    artist: 'フィンセント・ファン・ゴッホ',
    aliases: ['星月夜（サン＝レミ）', 'the starry night', '星降る夜'],
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
      },
      {
        id: 'cypress',
        label: '燃え上がる糸杉',
        detail: '手前で黒い炎のように立ち上がるのは糸杉。ヨーロッパでは墓地の木であり、地上と天空をつなぐ柱として画面を貫いています。',
        x: 0.2,
        y: 0.62,
        zoom: 2.2,
        keywords: ['糸杉', '木', '手前', '死', '炎'],
      },
      {
        id: 'moon',
        label: '黄金の月',
        detail: '右上で渦を巻く月。ゴッホは黄色をこの絵の希望の色として使い、厚く盛り上げた絵具で光そのものを立体にしました。',
        x: 0.89,
        y: 0.17,
        zoom: 2.6,
        keywords: ['月', '黄色', '光', '星', '金色'],
      },
      {
        id: 'village',
        label: '眠る村と尖塔',
        detail: '麓に広がる村は、療養先サン＝レミには無い北方風の風景です。故郷オランダの記憶が、糸杉より高い尖塔として描き込まれました。',
        x: 0.56,
        y: 0.8,
        zoom: 2.4,
        keywords: ['村', '教会', '尖塔', '家', 'サン＝レミ', '故郷'],
      },
    ],
  },
  {
    title: 'モナ・リザ',
    artist: 'レオナルド・ダ・ヴィンチ',
    aliases: ['モナリザ', 'ラ・ジョコンダ', 'mona lisa'],
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
      },
      {
        id: 'eyes',
        label: 'こちらを追う視線',
        detail: '瞳はわずかに正面を外れ、それでも鑑賞者を追ってくるように感じられます。まつげと眉が描かれていないことも謎めいた印象を強めています。',
        x: 0.45,
        y: 0.215,
        zoom: 2.8,
        keywords: ['視線', '瞳', '目', 'まなざし', '眉'],
      },
      {
        id: 'hands',
        label: '重ねられた手',
        detail: '肘掛けに置かれた手は、当時の肖像画では珍しい安らいだ姿勢です。指先の柔らかさが、この人物を生きた存在にしています。',
        x: 0.4,
        y: 0.83,
        zoom: 2.4,
        keywords: ['手', '指', '姿勢', '肘掛け', '衣'],
      },
      {
        id: 'landscape',
        label: '左右で食い違う風景',
        detail: '背景の地平線は右のほうが高く描かれています。遠くほど青く霞ませる空気遠近法とあわせ、人物を非現実的な空間に浮かべています。',
        x: 0.86,
        y: 0.29,
        zoom: 2.4,
        keywords: ['背景', '風景', '地平線', '空気遠近法', '霞', '山', '道', '橋'],
      },
    ],
  },
  {
    title: '真珠の耳飾りの少女',
    artist: 'ヨハネス・フェルメール',
    aliases: ['青いターバンの少女', 'girl with a pearl earring'],
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
      },
      {
        id: 'eyes',
        label: '振り返るまなざし',
        detail: '肩越しに振り返った一瞬。瞳の縁のわずかな潤みが、少女がいま何かを言いかけたような気配を作っています。',
        x: 0.42,
        y: 0.42,
        zoom: 2.6,
        keywords: ['まなざし', '視線', '瞳', '目', '振り返', '一瞬'],
      },
      {
        id: 'lips',
        label: '唇のきらめき',
        detail: '下唇の湿った光は、フェルメールが好んだ点状のハイライト。同じ技法が真珠にも使われ、画面全体に呼吸を与えています。',
        x: 0.38,
        y: 0.515,
        zoom: 3,
        keywords: ['唇', '口', 'ハイライト', '湿'],
      },
      {
        id: 'turban',
        label: '青いターバン',
        detail: '高価なラピスラズリから作るウルトラマリンを惜しみなく使った青。黄色い布と隣り合わせることで互いの鮮やかさを高めています。',
        x: 0.52,
        y: 0.26,
        zoom: 2.4,
        keywords: ['ターバン', '青', 'ウルトラマリン', 'ラピスラズリ', '黄色', '布'],
      },
    ],
  },
  {
    title: '叫び',
    artist: 'エドヴァルド・ムンク',
    aliases: ['ムンクの叫び', 'the scream'],
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
      },
      {
        id: 'sky',
        label: '血のような空',
        detail: '波打つ赤い帯は夕焼けの記憶です。空だけが激しくうねり、それを見上げる人物の内側の動揺と一体になっています。',
        x: 0.45,
        y: 0.12,
        zoom: 2.2,
        keywords: ['空', '赤', '夕焼け', '雲', 'うねり'],
      },
      {
        id: 'figures',
        label: '立ち去る二人',
        detail: '橋の奥にいる二人は何も気づかず歩き去ります。彼らの無関心が、手前の孤独をいっそう深くしています。',
        x: 0.07,
        y: 0.47,
        zoom: 3,
        keywords: ['二人', '人物', '橋の奥', '孤独', '無関心', '友人'],
      },
      {
        id: 'bridge',
        label: '突き刺さる橋の線',
        detail: '橋の手すりが鋭い斜めの線となって画面を切り裂きます。直線の風景とうねる空の対比が、落ち着かない感覚を生みます。',
        x: 0.25,
        y: 0.78,
        zoom: 2.2,
        keywords: ['橋', '斜め', '遠近', '手すり', '直線', '構図'],
      },
    ],
  },
  {
    title: '睡蓮',
    artist: 'クロード・モネ',
    aliases: ['睡蓮の池', 'water lilies', 'nympheas'],
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
      },
      {
        id: 'reflection',
        label: '水に映る空',
        detail: '青と灰の広がりは水そのものではなく、水面に映った空です。空を描かずに空を見せる、モネの逆転した風景画です。',
        x: 0.28,
        y: 0.45,
        zoom: 2.2,
        keywords: ['空', '映', '反射', '水面', '雲', '青'],
      },
      {
        id: 'pads',
        label: '奥へ連なる葉',
        detail: '楕円の葉は上へ行くほど平たくなり、それだけで奥行きが生まれます。地平線も岸も描かれていません。',
        x: 0.75,
        y: 0.38,
        zoom: 2.4,
        keywords: ['葉', '奥行き', '構図', '地平線', '岸', '池'],
      },
      {
        id: 'signature',
        label: '署名',
        detail: '右下に「Claude Monet 1906」。ジヴェルニーの自宅の庭で、晩年のモネはこの池だけを繰り返し描き続けました。',
        x: 0.85,
        y: 0.94,
        zoom: 3,
        keywords: ['署名', 'ジヴェルニー', '庭', '晩年', '1906'],
      },
    ],
  },
];

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

  let best: { hotspot: Hotspot; at: number } | null = null;
  for (const hotspot of set.hotspots) {
    for (const keyword of hotspot.keywords) {
      const at = spokenText.indexOf(keyword);
      if (at !== -1 && (!best || at < best.at)) {
        best = { hotspot, at };
      }
    }
  }
  return best?.hotspot ?? null;
}
