/**
 * Five-language support (Japanese, English, French, Spanish, Chinese).
 *
 * The visitor's language decides three separate things: the words on screen
 * (this file), the language the guide is written in (the prompt sent by
 * `/api/chat`) and the voice used by the browser's speech engine. They are kept
 * in one place so adding a language is a matter of adding one dictionary.
 */

export const LOCALES = ['ja', 'en', 'fr', 'es', 'zh'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'ja';

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

export const LOCALE_MENU: { locale: Locale; flag: string; label: string }[] = [
  { locale: 'ja', flag: '🇯🇵', label: '日本語' },
  { locale: 'en', flag: '🇬🇧', label: 'English' },
  { locale: 'fr', flag: '🇫🇷', label: 'Français' },
  { locale: 'es', flag: '🇪🇸', label: 'Español' },
  { locale: 'zh', flag: '🇨🇳', label: '中文' },
];

/** BCP-47 tags handed to `SpeechSynthesisUtterance.lang`. */
export const SPEECH_LANG: Record<Locale, string> = {
  ja: 'ja-JP',
  en: 'en-US',
  fr: 'fr-FR',
  es: 'es-ES',
  zh: 'zh-CN',
};

/** How the guide is asked to write, in the language it must write in. */
export const OUTPUT_LANGUAGE_INSTRUCTION: Record<Locale, string> = {
  ja: 'すべてのテキストを日本語で書いてください。',
  en: 'Write every field in natural English. Do not use Japanese.',
  fr: 'Rédigez tous les champs en français naturel. N’utilisez pas le japonais.',
  es: 'Redacta todos los campos en español natural. No uses japonés.',
  zh: '请用自然的简体中文撰写所有字段，不要使用日语。',
};

/** Names of the sentence-splitting punctuation differ, so does the guide's voice. */
export interface UIStrings {
  htmlLang: string;
  tagline: string;
  hub: {
    tours: string;
    tourItems: (count: number) => string;
    singleWork: string;
    searchByName: string;
    openHistory: (count: number) => string;
    onTour: string;
    endTour: string;
    findNext: string;
  };
  form: {
    artworkLabel: string;
    artworkPlaceholder: string;
    artistLabel: string;
    artistPlaceholder: string;
    ready: string;
    maybe: string;
    generating: string;
    generate: string;
  };
  header: {
    search: string;
    share: string;
    history: string;
    language: string;
  };
  image: {
    loading: string;
    noImage: string;
    searchCommons: string;
    zoomHotspots: string;
    zoom: string;
    failed: string;
    shareHotspot: string;
    close: string;
    hotspotHint: string;
    noHotspots: string;
  };
  tour: {
    prev: string;
    next: string;
    end: string;
    stopAuto: string;
    nextUp: (title: string, cue: string) => string;
    finished: (title: string) => string;
  };
  guide: {
    loading: string;
    busy: string;
    unavailable: string;
    parseError: string;
    deepDiveHeader: string;
  };
  ask: {
    placeholder: string;
    voice: string;
    thinking: string;
    submit: string;
    yourQuestion: string;
    failed: string;
    deepDiveLoading: string;
    deepDive: string;
  };
  feedback: {
    heart: string;
    report: string;
    reportPlaceholder: string;
    close: string;
    regenerating: string;
    regenerate: string;
    send: string;
    thanks: string;
    regenerateToast: string;
  };
  recommendations: string;
  player: {
    position: string;
    speed: string;
    prevWork: string;
    backSentence: string;
    forwardSentence: string;
    nextWork: string;
    playHere: string;
  };
  history: {
    title: string;
    empty: string;
    unknownArtist: string;
    clearConfirm: string;
    clear: string;
  };
  share: {
    hotspot: (artwork: string, hotspot: string) => string;
    guide: string;
    menuOpened: string;
    copied: string;
    copyFailed: string;
  };
  loadingSteps: string[];
}

const ja: UIStrings = {
  htmlLang: 'ja',
  tagline: 'AIキュレーターが贈る、あなたのための特別な音声ガイド。美術作品をもっと深く、もっと身近に。',
  hub: {
    tours: 'テーマで巡るツアー',
    tourItems: count => `全${count}作品・自動で次へ`,
    singleWork: '1作品だけ聴く',
    searchByName: '名前で探す',
    openHistory: count => `閲覧履歴を見る (${count})`,
    onTour: 'ツアー中',
    endTour: '終了する',
    findNext: 'つぎに聴くものをさがす',
  },
  form: {
    artworkLabel: '作品名',
    artworkPlaceholder: '例: ひまわり、モナ・リザ',
    artistLabel: '作者名',
    artistPlaceholder: '例: ゴッホ、ダ・ヴィンチ',
    ready: 'すぐ聴ける',
    maybe: 'もしかして',
    generating: 'AIキュレーターが分析中...',
    generate: '音声ガイドを生成',
  },
  header: {
    search: 'さがす',
    share: 'この解説を共有',
    history: '履歴',
    language: '言語を切り替える',
  },
  image: {
    loading: '画像を読み込み中...',
    zoomHotspots: '🔍 見どころを拡大',
    zoom: '🔍 拡大',
    failed: '作品画像を取得できませんでした',
    noImage: '画像なし',
    searchCommons: 'Wikimedia Commons で画像を探す',
    shareHotspot: 'この見どころを共有',
    close: '閉じる',
    hotspotHint: '見どころをタップすると、その部分を拡大して解説します。',
    noHotspots: 'この作品にはまだ見どころの登録がありません。',
  },
  tour: {
    prev: '前へ',
    next: '次へ',
    end: '終了',
    stopAuto: '自動再生を止める',
    nextUp: (title, cue) => `次は「${title}」— ${cue}`,
    finished: title => `「${title}」はこれで終わりです。お疲れさまでした`,
  },
  guide: {
    loading: '解説を読み込み中...',
    busy: '現在、大変混雑しているため音声ガイドを生成できません。しばらく時間をおいてから再度お試しください。',
    unavailable: '現在、音声ガイドサービスをご利用いただけません。しばらく時間をおいてから再度お試しください。',
    parseError: '音声ガイドの解析中にエラーが発生しました。もう一度生成をお試しください。',
    deepDiveHeader: 'ディープな深掘りエピソードへようこそ',
  },
  ask: {
    placeholder: 'この作品について質問する',
    voice: '声で質問する',
    thinking: '考え中…',
    submit: '聞く',
    yourQuestion: 'あなたの質問:',
    failed: '回答を生成できませんでした。少し時間をおいてお試しください',
    deepDiveLoading: '探究中…',
    deepDive: '🔍 裏話・エピソード',
  },
  feedback: {
    heart: 'この解説にハートを送る',
    report: '気になる点',
    reportPlaceholder: '気になった点や不具合（例: 事実が違う、読み上げが不自然、画像が別の作品）',
    close: '閉じる',
    regenerating: '作り直し中…',
    regenerate: '🔄 解説を作り直す',
    send: '送信する',
    thanks: 'ご報告ありがとうございます',
    regenerateToast: '解説を作り直しています…',
  },
  recommendations: '💡 次におすすめの作品',
  player: {
    position: '音声ガイドの再生位置',
    speed: '再生速度を変更',
    prevWork: '前作品',
    backSentence: '1文戻る',
    forwardSentence: '1文進む',
    nextWork: '次作品',
    playHere: '🎧 ここから再生',
  },
  history: {
    title: '閲覧履歴',
    empty: '履歴はありません。ガイドを生成するとここに保存されます。',
    unknownArtist: '作者不明',
    clearConfirm: '閲覧履歴をすべて消去しますか？',
    clear: '履歴をクリア',
  },
  share: {
    hotspot: (artwork, hotspot) => `「${artwork}」の見どころ「${hotspot}」を聴いてみて！`,
    guide: 'この作品のAI音声ガイドを聴いてみて！',
    menuOpened: '共有メニューを起動しました',
    copied: '共有URLをクリップボードにコピーしました！',
    copyFailed: 'コピーに失敗しました',
  },
  loadingSteps: [
    '作品の資料を探しています...',
    '時代背景を読み解いています...',
    '画家の人生をたどっています...',
    '見どころを整理しています...',
    '音声ガイドの原稿を書いています...',
  ],
};

const en: UIStrings = {
  htmlLang: 'en',
  tagline: 'A personal audio guide written for you by an AI curator. Art, closer and deeper.',
  hub: {
    tours: 'Guided tours by theme',
    tourItems: count => `${count} works · plays on automatically`,
    singleWork: 'Just one work',
    searchByName: 'Search by name',
    openHistory: count => `Listening history (${count})`,
    onTour: 'On tour',
    endTour: 'End tour',
    findNext: 'Find what to listen to next',
  },
  form: {
    artworkLabel: 'Artwork',
    artworkPlaceholder: 'e.g. Sunflowers, Mona Lisa',
    artistLabel: 'Artist',
    artistPlaceholder: 'e.g. Van Gogh, Da Vinci',
    ready: 'Ready to play',
    maybe: 'Did you mean',
    generating: 'The AI curator is looking...',
    generate: 'Create the audio guide',
  },
  header: {
    search: 'Browse',
    share: 'Share this guide',
    history: 'History',
    language: 'Change language',
  },
  image: {
    loading: 'Loading the image...',
    zoomHotspots: '🔍 Zoom into the details',
    zoom: '🔍 Zoom',
    failed: 'The image could not be loaded',
    noImage: 'No image',
    searchCommons: 'Look for an image on Wikimedia Commons',
    shareHotspot: 'Share this detail',
    close: 'Close',
    hotspotHint: 'Tap a marked detail to zoom in and hear about it.',
    noHotspots: 'No details have been mapped for this work yet.',
  },
  tour: {
    prev: 'Previous',
    next: 'Next',
    end: 'End',
    stopAuto: 'Stop autoplay',
    nextUp: (title, cue) => `Next: “${title}” — ${cue}`,
    finished: title => `That was the last work of “${title}”. Thank you for listening.`,
  },
  guide: {
    loading: 'Loading the guide...',
    busy: 'The guide service is very busy right now. Please try again in a moment.',
    unavailable: 'The guide service is unavailable right now. Please try again in a moment.',
    parseError: 'Something went wrong while reading the guide. Please try generating it again.',
    deepDiveHeader: 'Welcome to the deeper story',
  },
  ask: {
    placeholder: 'Ask about this artwork',
    voice: 'Ask with your voice',
    thinking: 'Thinking…',
    submit: 'Ask',
    yourQuestion: 'Your question:',
    failed: 'The answer could not be generated. Please try again shortly.',
    deepDiveLoading: 'Digging…',
    deepDive: '🔍 Behind the scenes',
  },
  feedback: {
    heart: 'Send a heart to this guide',
    report: 'Report an issue',
    reportPlaceholder: 'What felt wrong? (e.g. a wrong fact, odd narration, the wrong picture)',
    close: 'Close',
    regenerating: 'Rewriting…',
    regenerate: '🔄 Rewrite this guide',
    send: 'Send',
    thanks: 'Thank you for the report',
    regenerateToast: 'Rewriting the guide…',
  },
  recommendations: '💡 Listen to these next',
  player: {
    position: 'Playback position',
    speed: 'Change the speed',
    prevWork: 'Previous',
    backSentence: 'Back',
    forwardSentence: 'Forward',
    nextWork: 'Next',
    playHere: '🎧 Start here',
  },
  history: {
    title: 'Listening history',
    empty: 'Nothing here yet. Guides you create are saved here.',
    unknownArtist: 'Unknown artist',
    clearConfirm: 'Erase the whole listening history?',
    clear: 'Clear history',
  },
  share: {
    hotspot: (artwork, hotspot) => `Listen to “${hotspot}” in ${artwork}!`,
    guide: 'Listen to the AI audio guide for this artwork!',
    menuOpened: 'Opened the share menu',
    copied: 'Link copied to the clipboard!',
    copyFailed: 'Could not copy the link',
  },
  loadingSteps: [
    'Gathering material about the work...',
    'Reading the period it was made in...',
    'Following the artist’s life...',
    'Picking out the details to look at...',
    'Writing your audio guide...',
  ],
};

const fr: UIStrings = {
  htmlLang: 'fr',
  tagline: 'Un audioguide personnel écrit pour vous par un conservateur IA. L’art, de plus près.',
  hub: {
    tours: 'Parcours thématiques',
    tourItems: count => `${count} œuvres · enchaînement automatique`,
    singleWork: 'Une seule œuvre',
    searchByName: 'Rechercher par nom',
    openHistory: count => `Historique d’écoute (${count})`,
    onTour: 'Parcours en cours',
    endTour: 'Terminer',
    findNext: 'Trouver la prochaine écoute',
  },
  form: {
    artworkLabel: 'Œuvre',
    artworkPlaceholder: 'ex. Les Tournesols, La Joconde',
    artistLabel: 'Artiste',
    artistPlaceholder: 'ex. Van Gogh, De Vinci',
    ready: 'Prêt à écouter',
    maybe: 'Peut-être',
    generating: 'Le conservateur IA cherche...',
    generate: 'Créer l’audioguide',
  },
  header: {
    search: 'Explorer',
    share: 'Partager ce guide',
    history: 'Historique',
    language: 'Changer de langue',
  },
  image: {
    loading: 'Chargement de l’image...',
    zoomHotspots: '🔍 Zoomer sur les détails',
    zoom: '🔍 Zoomer',
    failed: 'Impossible de charger l’image',
    noImage: 'Sans image',
    searchCommons: 'Chercher une image sur Wikimedia Commons',
    shareHotspot: 'Partager ce détail',
    close: 'Fermer',
    hotspotHint: 'Touchez un détail signalé pour l’agrandir et l’écouter.',
    noHotspots: 'Aucun détail n’est encore repéré pour cette œuvre.',
  },
  tour: {
    prev: 'Précédent',
    next: 'Suivant',
    end: 'Terminer',
    stopAuto: 'Arrêter l’enchaînement',
    nextUp: (title, cue) => `Ensuite : « ${title} » — ${cue}`,
    finished: title => `C’était la dernière œuvre de « ${title} ». Merci de votre écoute.`,
  },
  guide: {
    loading: 'Chargement du commentaire...',
    busy: 'Le service est très sollicité en ce moment. Réessayez dans un instant.',
    unavailable: 'Le service d’audioguide est indisponible. Réessayez dans un instant.',
    parseError: 'Une erreur est survenue à la lecture du guide. Relancez la génération.',
    deepDiveHeader: 'Bienvenue dans les coulisses',
  },
  ask: {
    placeholder: 'Posez une question sur cette œuvre',
    voice: 'Poser la question à voix haute',
    thinking: 'Réflexion…',
    submit: 'Demander',
    yourQuestion: 'Votre question :',
    failed: 'La réponse n’a pas pu être générée. Réessayez dans un instant.',
    deepDiveLoading: 'Exploration…',
    deepDive: '🔍 Coulisses et anecdotes',
  },
  feedback: {
    heart: 'Envoyer un cœur à ce guide',
    report: 'Signaler',
    reportPlaceholder: 'Qu’est-ce qui ne va pas ? (fait erroné, lecture étrange, mauvaise image)',
    close: 'Fermer',
    regenerating: 'Réécriture…',
    regenerate: '🔄 Réécrire ce commentaire',
    send: 'Envoyer',
    thanks: 'Merci pour votre signalement',
    regenerateToast: 'Réécriture du commentaire…',
  },
  recommendations: '💡 À écouter ensuite',
  player: {
    position: 'Position de lecture',
    speed: 'Changer la vitesse',
    prevWork: 'Précédent',
    backSentence: 'Reculer',
    forwardSentence: 'Avancer',
    nextWork: 'Suivant',
    playHere: '🎧 Écouter ici',
  },
  history: {
    title: 'Historique d’écoute',
    empty: 'Rien pour l’instant. Les guides créés apparaîtront ici.',
    unknownArtist: 'Artiste inconnu',
    clearConfirm: 'Effacer tout l’historique d’écoute ?',
    clear: 'Effacer l’historique',
  },
  share: {
    hotspot: (artwork, hotspot) => `Écoutez « ${hotspot} » dans ${artwork} !`,
    guide: 'Écoutez l’audioguide IA de cette œuvre !',
    menuOpened: 'Menu de partage ouvert',
    copied: 'Lien copié dans le presse-papiers !',
    copyFailed: 'Échec de la copie',
  },
  loadingSteps: [
    'Recherche de documentation sur l’œuvre...',
    'Lecture du contexte historique...',
    'Sur les traces de la vie de l’artiste...',
    'Repérage des détails à observer...',
    'Rédaction de votre audioguide...',
  ],
};

const zh: UIStrings = {
  htmlLang: 'zh',
  tagline: 'AI 策展人为你写的专属语音导览，让艺术更近一点。',
  hub: {
    tours: '主题导览路线',
    tourItems: count => `共 ${count} 件 · 自动播放下一件`,
    singleWork: '只听一件作品',
    searchByName: '按名称搜索',
    openHistory: count => `收听记录（${count}）`,
    onTour: '导览中',
    endTour: '结束导览',
    findNext: '找找接下来听什么',
  },
  form: {
    artworkLabel: '作品名称',
    artworkPlaceholder: '例：向日葵、蒙娜丽莎',
    artistLabel: '作者',
    artistPlaceholder: '例：梵高、达·芬奇',
    ready: '可立即收听',
    maybe: '你是否想找',
    generating: 'AI 策展人正在查阅...',
    generate: '生成语音导览',
  },
  header: {
    search: '浏览',
    share: '分享这段导览',
    history: '记录',
    language: '切换语言',
  },
  image: {
    loading: '正在加载图片...',
    zoomHotspots: '🔍 放大看点',
    zoom: '🔍 放大',
    failed: '无法获取作品图片',
    noImage: '暂无图片',
    searchCommons: '在 Wikimedia Commons 上查找图片',
    shareHotspot: '分享这个看点',
    close: '关闭',
    hotspotHint: '点击标记的看点，即可放大并听讲解。',
    noHotspots: '这件作品还没有登记看点。',
  },
  tour: {
    prev: '上一件',
    next: '下一件',
    end: '结束',
    stopAuto: '停止自动播放',
    nextUp: (title, cue) => `接下来：《${title}》— ${cue}`,
    finished: title => `《${title}》到此结束，感谢收听。`,
  },
  guide: {
    loading: '正在加载讲解...',
    busy: '当前访问量过大，暂时无法生成语音导览，请稍后再试。',
    unavailable: '语音导览服务暂时不可用，请稍后再试。',
    parseError: '解析语音导览时出错，请重新生成。',
    deepDiveHeader: '欢迎进入幕后故事',
  },
  ask: {
    placeholder: '就这件作品提问',
    voice: '用语音提问',
    thinking: '思考中…',
    submit: '提问',
    yourQuestion: '你的问题：',
    failed: '未能生成回答，请稍后再试。',
    deepDiveLoading: '挖掘中…',
    deepDive: '🔍 幕后故事',
  },
  feedback: {
    heart: '为这段讲解点心',
    report: '反馈问题',
    reportPlaceholder: '哪里不对？（例如：事实有误、朗读不自然、图片不符）',
    close: '关闭',
    regenerating: '重写中…',
    regenerate: '🔄 重新生成讲解',
    send: '发送',
    thanks: '感谢你的反馈',
    regenerateToast: '正在重新生成讲解…',
  },
  recommendations: '💡 接下来推荐',
  player: {
    position: '播放进度',
    speed: '调整语速',
    prevWork: '上一件',
    backSentence: '退一句',
    forwardSentence: '进一句',
    nextWork: '下一件',
    playHere: '🎧 从这里播放',
  },
  history: {
    title: '收听记录',
    empty: '还没有记录。生成导览后会保存在这里。',
    unknownArtist: '作者不详',
    clearConfirm: '要清除全部收听记录吗？',
    clear: '清除记录',
  },
  share: {
    hotspot: (artwork, hotspot) => `来听听《${artwork}》里的「${hotspot}」！`,
    guide: '来听听这件作品的 AI 语音导览！',
    menuOpened: '已打开分享菜单',
    copied: '链接已复制到剪贴板！',
    copyFailed: '复制失败',
  },
  loadingSteps: [
    '正在查找作品资料...',
    '正在梳理时代背景...',
    '正在追溯画家的一生...',
    '正在整理看点...',
    '正在撰写语音导览稿...',
  ],
};

const es: UIStrings = {
  htmlLang: 'es',
  tagline:
    'Una audioguía personal escrita para ti por un conservador con IA. El arte, más cerca y más hondo.',
  hub: {
    tours: 'Recorridos temáticos',
    tourItems: count => `${count} obras · avanza solo`,
    singleWork: 'Solo una obra',
    searchByName: 'Buscar por nombre',
    openHistory: count => `Historial de escucha (${count})`,
    onTour: 'En recorrido',
    endTour: 'Terminar',
    findNext: 'Buscar qué escuchar después',
  },
  form: {
    artworkLabel: 'Obra',
    artworkPlaceholder: 'p. ej. Los girasoles, La Gioconda',
    artistLabel: 'Artista',
    artistPlaceholder: 'p. ej. Van Gogh, Da Vinci',
    ready: 'Listo para escuchar',
    maybe: 'Quizás',
    generating: 'El conservador con IA está buscando...',
    generate: 'Crear la audioguía',
  },
  header: {
    search: 'Explorar',
    share: 'Compartir esta guía',
    history: 'Historial',
    language: 'Cambiar de idioma',
  },
  image: {
    loading: 'Cargando la imagen...',
    zoomHotspots: '🔍 Ampliar los detalles',
    zoom: '🔍 Ampliar',
    failed: 'No se ha podido cargar la imagen',
    noImage: 'Sin imagen',
    searchCommons: 'Buscar una imagen en Wikimedia Commons',
    shareHotspot: 'Compartir este detalle',
    close: 'Cerrar',
    hotspotHint: 'Toca un detalle marcado para ampliarlo y escucharlo.',
    noHotspots: 'Todavía no hay detalles marcados en esta obra.',
  },
  tour: {
    prev: 'Anterior',
    next: 'Siguiente',
    end: 'Terminar',
    stopAuto: 'Detener el avance automático',
    nextUp: (title, cue) => `A continuación: «${title}» — ${cue}`,
    finished: title => `Era la última obra de «${title}». Gracias por escuchar.`,
  },
  guide: {
    loading: 'Cargando el comentario...',
    busy: 'El servicio está muy saturado ahora mismo. Inténtalo de nuevo en un momento.',
    unavailable: 'La audioguía no está disponible ahora mismo. Inténtalo de nuevo en un momento.',
    parseError: 'Ha ocurrido un error al leer la guía. Prueba a generarla otra vez.',
    deepDiveHeader: 'Bienvenido a la historia oculta',
  },
  ask: {
    placeholder: 'Pregunta sobre esta obra',
    voice: 'Preguntar con la voz',
    thinking: 'Pensando…',
    submit: 'Preguntar',
    yourQuestion: 'Tu pregunta:',
    failed: 'No se ha podido generar la respuesta. Inténtalo de nuevo en un momento.',
    deepDiveLoading: 'Indagando…',
    deepDive: '🔍 Entre bastidores',
  },
  feedback: {
    heart: 'Enviar un corazón a esta guía',
    report: 'Señalar un problema',
    reportPlaceholder: '¿Qué no encaja? (p. ej. un dato erróneo, una locución rara, otra imagen)',
    close: 'Cerrar',
    regenerating: 'Reescribiendo…',
    regenerate: '🔄 Rehacer esta guía',
    send: 'Enviar',
    thanks: 'Gracias por avisar',
    regenerateToast: 'Rehaciendo la guía…',
  },
  recommendations: '💡 Escucha estas a continuación',
  player: {
    position: 'Posición de reproducción',
    speed: 'Cambiar la velocidad',
    prevWork: 'Anterior',
    backSentence: 'Atrás',
    forwardSentence: 'Adelante',
    nextWork: 'Siguiente',
    playHere: '🎧 Empezar aquí',
  },
  history: {
    title: 'Historial de escucha',
    empty: 'Aún no hay nada. Las guías que crees se guardarán aquí.',
    unknownArtist: 'Artista desconocido',
    clearConfirm: '¿Borrar todo el historial de escucha?',
    clear: 'Borrar el historial',
  },
  share: {
    hotspot: (artwork, hotspot) => `¡Escucha «${hotspot}» en ${artwork}!`,
    guide: '¡Escucha la audioguía con IA de esta obra!',
    menuOpened: 'Se ha abierto el menú de compartir',
    copied: '¡Enlace copiado al portapapeles!',
    copyFailed: 'No se ha podido copiar el enlace',
  },
  loadingSteps: [
    'Reuniendo documentación sobre la obra...',
    'Leyendo la época en que se hizo...',
    'Siguiendo la vida del artista...',
    'Eligiendo los detalles que mirar...',
    'Escribiendo tu audioguía...',
  ],
};

export const UI: Record<Locale, UIStrings> = { ja, en, fr, es, zh };
