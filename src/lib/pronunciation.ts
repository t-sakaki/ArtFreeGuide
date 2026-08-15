/**
 * Reading dictionary for the speech synthesiser.
 *
 * The Web Speech API gives no way to supply readings (Chrome ignores SSML
 * `<phoneme>`), so the only lever is the string handed to the utterance.
 * Entries below are applied to that string only — the guide text on screen is
 * never touched, so the visitor still reads the original kanji.
 *
 * Write the replacement in katakana: Japanese voices read katakana literally,
 * which is what makes the correction stick.
 */
const READINGS: Record<string, string> = {
  // Country abbreviations, which are read character by character otherwise
  // (南仏 → みなみほとけ).
  南仏: 'ナンフツ',
  北仏: 'ホクフツ',
  仏文学: 'フツブンガク',
  訪仏: 'ホウフツ',
  渡仏: 'トフツ',
  在仏: 'ザイフツ',
  渡欧: 'トオウ',
  渡蘭: 'トラン',
  渡伊: 'トイ',

  // Japanese painters and schools
  北斎: 'ホクサイ',
  広重: 'ヒロシゲ',
  写楽: 'シャラク',
  歌麿: 'ウタマロ',
  若冲: 'ジャクチュウ',
  宗達: 'ソウタツ',
  光琳: 'コウリン',
  雪舟: 'セッシュウ',
  等伯: 'トウハク',
  応挙: 'オウキョ',
  琳派: 'リンパ',
  狩野派: 'カノウハ',
  土佐派: 'トサハ',

  // Japanese work titles and formats
  富嶽三十六景: 'フガクサンジュウロッケイ',
  神奈川沖浪裏: 'カナガワオキナミウラ',
  凱風快晴: 'ガイフウカイセイ',
  見返り美人: 'ミカエリビジン',
  燕子花図: 'カキツバタズ',
  風神雷神図: 'フウジンライジンズ',
  鳥獣戯画: 'チョウジュウギガ',
  洛中洛外図: 'ラクチュウラクガイズ',
  唐獅子: 'カラジシ',
  浮世絵: 'ウキヨエ',
  大和絵: 'ヤマトエ',
  水墨画: 'スイボクガ',
  山水画: 'サンスイガ',
  障壁画: 'ショウヘキガ',
  襖絵: 'フスマエ',
  屏風: 'ビョウブ',
  掛軸: 'カケジク',
  木版画: 'モクハンガ',
  木版: 'モクハン',
  金箔: 'キンパク',
  群青: 'グンジョウ',
  紺青: 'コンジョウ',
  藍色: 'アイイロ',
  朱色: 'シュイロ',

  // Western works and subjects
  最後の晩餐: 'サイゴノバンサン',
  最後の審判: 'サイゴノシンパン',
  受胎告知: 'ジュタイコクチ',
  聖母子: 'セイボシ',
  夜警: 'ヤケイ',
  睡蓮: 'スイレン',
  糸杉: 'イトスギ',
  麦畑: 'ムギバタケ',
  星月夜: 'ホシツキヨ',

  // Vocabulary that recurs in art writing and flips reading easily
  素描: 'ソビョウ',
  下絵: 'シタエ',
  筆致: 'ヒッチ',
  画布: 'ガフ',
  陰影: 'インエイ',
  明暗: 'メイアン',
  遠近法: 'エンキンホウ',
  静物画: 'セイブツガ',
  風俗画: 'フウゾクガ',
  花弁: 'カベン',
  人影: 'ヒトカゲ',
  谷間: 'タニマ',
  一角: 'イッカク',
  一室: 'イッシツ',
  一見: 'イッケン',
  人気: 'ニンキ',
  上手: 'ジョウズ',
  気配: 'ケハイ',
  生々しい: 'ナマナマシイ',
};

const PATTERN = new RegExp(
  Object.keys(READINGS)
    // Longest first, so 木版画 wins over 木版.
    .sort((a, b) => b.length - a.length)
    .map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|'),
  'g'
);

/**
 * Rewrite a guide sentence into what the synthesiser should say.
 * Display text must keep using the original string.
 */
export function toSpokenText(text: string): string {
  return text.replace(PATTERN, term => READINGS[term]);
}
