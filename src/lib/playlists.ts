/**
 * Curated tours: an ordered set of artworks that tells one story.
 * The guide text itself is still generated per artwork by the LLM; a tour only
 * decides the order and gives the visitor a narrative frame.
 */
export interface PlaylistItem {
  title: string;
  artist: string;
  /** One line shown while the tour moves to this artwork. */
  cue: string;
}

export interface Playlist {
  id: string;
  title: string;
  subtitle: string;
  emoji: string;
  items: PlaylistItem[];
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
  },
];

export function findPlaylist(id: string | null | undefined): Playlist | null {
  if (!id) return null;
  return PLAYLISTS.find(p => p.id === id) ?? null;
}
