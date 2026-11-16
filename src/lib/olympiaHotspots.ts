import type { HotspotSet } from './hotspots';

/** Measured against the complete 960 x 654 Commons reproduction below. */
export const OLYMPIA_HOTSPOTS: HotspotSet = {
  title: 'オランピア',
  artist: 'エドゥアール・マネ',
  aliases: ['Olympia'],
  file: 'Edouard Manet - Olympia - Google Art Project 3.jpg',
  hotspots: [
    {
      id: 'gaze', label: 'まっすぐな眼差し',
      detail: '画面左上の顔に注目してください。女性の目は鑑賞者へまっすぐ向けられています。',
      x: 0.25, y: 0.3, zoom: 3.4,
      keywords: ['眼差し', 'まなざし', '視線', '目', '顔'],
      i18n: {
        en: { label: 'The direct gaze', detail: 'Look at the face in the upper left. Her eyes meet the viewer directly.', keywords: ['gaze', 'eyes', 'face'] },
        fr: { label: 'Le regard direct', detail: 'Observez le visage en haut à gauche. Ses yeux rencontrent directement ceux du spectateur.', keywords: ['regard', 'yeux', 'visage'] },
        zh: { label: '直视的目光', detail: '请看画面左上方的面孔。她的双眼正直视着观者。', keywords: ['目光', '眼睛', '面孔'] },
        es: { label: 'La mirada directa', detail: 'Observe el rostro en la parte superior izquierda. Sus ojos miran directamente al espectador.', keywords: ['mirada', 'ojos', 'rostro'] },
      },
    },
    {
      id: 'cat', label: '背を丸めた黒猫',
      detail: '画面右端、女性の足元にいる黒猫です。暗い背景の中に、目と立ち上がった尾が見えます。',
      x: 0.938, y: 0.642, zoom: 3.2,
      keywords: ['黒猫', '猫', '尾', 'しっぽ'],
      i18n: {
        en: { label: 'The black cat', detail: 'At the far right, a black cat stands by her feet. Notice its eyes and raised tail against the dark background.', keywords: ['cat', 'tail'] },
        fr: { label: 'Le chat noir', detail: 'Tout à droite, un chat noir se tient près de ses pieds. Ses yeux et sa queue dressée se détachent sur le fond sombre.', keywords: ['chat', 'queue'] },
        zh: { label: '弓背的黑猫', detail: '画面最右侧，女子脚边站着一只黑猫。请注意暗色背景中的双眼和竖起的尾巴。', keywords: ['黑猫', '猫', '尾巴'] },
        es: { label: 'El gato negro', detail: 'En el extremo derecho, un gato negro está junto a sus pies. Distinga sus ojos y su cola erguida contra el fondo oscuro.', keywords: ['gato', 'cola'] },
      },
    },
    {
      id: 'bouquet', label: '紙に包まれた花束',
      detail: '画面右側の人物が抱える花束です。白い包み紙の中に、青や赤、白の花がまとまって描かれています。',
      x: 0.655, y: 0.443, zoom: 2.9,
      keywords: ['花束', '花', '包み紙', '侍女'],
      i18n: {
        en: { label: 'The wrapped bouquet', detail: 'The attendant on the right holds a bouquet. Blue, red and white flowers gather inside the white wrapping.', keywords: ['bouquet', 'flowers', 'attendant'] },
        fr: { label: 'Le bouquet enveloppé', detail: 'Le personnage à droite porte un bouquet. Des fleurs bleues, rouges et blanches sont rassemblées dans un papier blanc.', keywords: ['bouquet', 'fleurs', 'papier'] },
        zh: { label: '纸包花束', detail: '右侧人物抱着一束花。白色包纸中，蓝、红、白色的花朵聚集在一起。', keywords: ['花束', '花朵', '包纸'] },
        es: { label: 'El ramo envuelto', detail: 'La acompañante a la derecha sostiene un ramo. Flores azules, rojas y blancas se agrupan dentro del papel blanco.', keywords: ['ramo', 'flores', 'papel'] },
      },
    },
    {
      id: 'ribbon', label: '首元の黒いリボン',
      detail: '顔のすぐ下にある細い黒いリボンです。明るい首元と黒い線の対比に注目してください。',
      x: 0.263, y: 0.377, zoom: 4,
      keywords: ['リボン', '首元', '首飾り'],
      i18n: {
        en: { label: 'The black neck ribbon', detail: 'Just below her face is a narrow black ribbon. Notice its dark line against the light skin of her neck.', keywords: ['ribbon', 'neck', 'choker'] },
        fr: { label: 'Le ruban noir au cou', detail: 'Juste sous le visage se trouve un fin ruban noir. Remarquez le contraste avec la peau claire du cou.', keywords: ['ruban', 'cou', 'collier'] },
        zh: { label: '颈间的黑色丝带', detail: '面孔正下方是一条细黑丝带。请留意黑色线条与明亮颈部的对比。', keywords: ['丝带', '颈部', '项圈'] },
        es: { label: 'La cinta negra del cuello', detail: 'Justo debajo del rostro hay una cinta negra estrecha. Observe su contraste con la piel clara del cuello.', keywords: ['cinta', 'cuello', 'gargantilla'] },
      },
    },
  ],
};
