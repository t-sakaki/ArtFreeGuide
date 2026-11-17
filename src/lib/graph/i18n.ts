import type { Locale } from '../i18n';
import type { GraphRelationType } from './types';

export interface GraphUIText {
  mapTitle: string;
  mapSubtitle: string;
  liveBadge: string;
  snapshotBadge: string;
  tourTitle: string;
  tourSubtitle: string;
  fromLabel: string;
  toLabel: string;
  buildTour: string;
  buildingTour: string;
  startTour: string;
  noPathFound: string;
  sameWorkError: string;
  presetsLabel: string;
  openWork: string;
  nodeKinds: Record<'artwork' | 'artist' | 'movement' | 'motif' | 'technique', string>;
  relationLabels: Record<GraphRelationType, string>;
  graphBridgeTitle: string;
  presets: { label: string; from: string; to: string }[];
}

const JA: GraphUIText = {
  mapTitle: '知識グラフ・つながりマップ',
  mapSubtitle: '影響関係・モチーフ・技法から次の名画へジャンプできます',
  liveBadge: 'Neo4j Live',
  snapshotBadge: 'Knowledge Graph',
  tourTitle: '2作品をつなぐ動的ルート',
  tourSubtitle: '始点と終点を選ぶと、知識グラフの最短経路でオリジナル音声ツアーを自動編成します',
  fromLabel: '出発する作品',
  toLabel: 'たどり着きたい作品',
  buildTour: '経路を探索',
  buildingTour: '経路を探索中...',
  startTour: 'このルートでツアー開始',
  noPathFound: 'この2作品をつなぐ経路が見つかりませんでした',
  sameWorkError: '異なる2つの作品を選んでください',
  presetsLabel: '人気ルート例',
  openWork: 'この作品のガイドを開く',
  nodeKinds: {
    artwork: '作品',
    artist: '作家',
    movement: '流派・時代',
    motif: 'モチーフ',
    technique: '技法',
  },
  relationLabels: {
    INFLUENCED_BY: '影響関係',
    SHARES_MOTIF: '共通モチーフ',
    SAME_MOVEMENT: '同じ流派',
    CONTEMPORARY_OF: '同時代の共鳴',
    BY_ARTIST: '同じ画家',
  },
  graphBridgeTitle: '鑑賞履歴とのつながり（知識グラフ）',
  presets: [
    { label: '🌊 北斎 → モネ（ジャポニスム）', from: '富嶽三十六景 神奈川沖浪裏', to: '睡蓮' },
    { label: '🏛️ ルネサンス → 近代絵画', from: 'ヴィーナスの誕生', to: 'ゲルニカ' },
    { label: '🌓 光のオランダ → 夢の超現実', from: '真珠の耳飾りの少女', to: '記憶の固執' },
  ],
};

const EN: GraphUIText = {
  mapTitle: 'Art Knowledge Graph',
  mapSubtitle: 'Explore influences, shared motifs, and techniques across artworks',
  liveBadge: 'Neo4j Live',
  snapshotBadge: 'Knowledge Graph',
  tourTitle: 'Dynamic Path Tour',
  tourSubtitle: 'Pick any two works to generate a custom audio tour along the shortest graph path',
  fromLabel: 'Start artwork',
  toLabel: 'Destination artwork',
  buildTour: 'Find Path',
  buildingTour: 'Finding path...',
  startTour: 'Start This Guided Tour',
  noPathFound: 'No path was found between those two artworks',
  sameWorkError: 'Please choose two different artworks',
  presetsLabel: 'Try a sample route',
  openWork: 'Open guide for this work',
  nodeKinds: {
    artwork: 'Artwork',
    artist: 'Artist',
    movement: 'Movement',
    motif: 'Motif',
    technique: 'Technique',
  },
  relationLabels: {
    INFLUENCED_BY: 'Influence',
    SHARES_MOTIF: 'Shared Motif',
    SAME_MOVEMENT: 'Same Movement',
    CONTEMPORARY_OF: 'Contemporary',
    BY_ARTIST: 'Same Artist',
  },
  graphBridgeTitle: 'Connections to your recent listening',
  presets: [
    { label: '🌊 Hokusai → Monet (Japonisme)', from: '富嶽三十六景 神奈川沖浪裏', to: '睡蓮' },
    { label: '🏛️ Renaissance → Modern Art', from: 'ヴィーナスの誕生', to: 'ゲルニカ' },
    { label: '🌓 Dutch Light → Surrealism', from: '真珠の耳飾りの少女', to: '記憶の固執' },
  ],
};

const FR: GraphUIText = {
  ...EN,
  mapTitle: 'Graphe des connaissances artistiques',
  mapSubtitle: 'Explorez influences, motifs communs et techniques entre les œuvres',
  tourTitle: 'Parcours dynamique entre deux œuvres',
  tourSubtitle: 'Choisissez deux œuvres pour créer une visite guidée selon le plus court chemin du graphe',
  fromLabel: 'Œuvre de départ',
  toLabel: 'Œuvre d’arrivée',
  buildTour: 'Tracer le parcours',
  buildingTour: 'Recherche...',
  startTour: 'Démarrer ce parcours',
  relationLabels: {
    INFLUENCED_BY: 'Influence',
    SHARES_MOTIF: 'Motif partagé',
    SAME_MOVEMENT: 'Même mouvement',
    CONTEMPORARY_OF: 'Contemporain',
    BY_ARTIST: 'Même artiste',
  },
  graphBridgeTitle: 'Liens avec vos écoutes récentes',
};

const ES: GraphUIText = {
  ...EN,
  mapTitle: 'Grafo de conocimiento artístico',
  mapSubtitle: 'Explora influencias, motivos compartidos y técnicas entre obras',
  tourTitle: 'Ruta dinámica entre dos obras',
  tourSubtitle: 'Elige dos obras para generar un recorrido por la ruta más corta del grafo',
  fromLabel: 'Obra inicial',
  toLabel: 'Obra final',
  buildTour: 'Buscar ruta',
  buildingTour: 'Buscando ruta...',
  startTour: 'Iniciar este recorrido',
  relationLabels: {
    INFLUENCED_BY: 'Influencia',
    SHARES_MOTIF: 'Motivo común',
    SAME_MOVEMENT: 'Mismo movimiento',
    CONTEMPORARY_OF: 'Contemporáneo',
    BY_ARTIST: 'Mismo artista',
  },
  graphBridgeTitle: 'Conexiones con tu historial reciente',
};

const ZH: GraphUIText = {
  ...EN,
  mapTitle: '艺术知识图谱',
  mapSubtitle: '通过影响关系、共同母题与技法跳转到下一幅名作',
  tourTitle: '连接两幅作品的动态导览路线',
  tourSubtitle: '选择起点与终点，利用知识图谱最短路径自动编排专属导览',
  fromLabel: '起点作品',
  toLabel: '终点作品',
  buildTour: '探索路径',
  buildingTour: '正在探索路径...',
  startTour: '按此路线开始导览',
  relationLabels: {
    INFLUENCED_BY: '艺术影响',
    SHARES_MOTIF: '共同母题',
    SAME_MOVEMENT: '同一流派',
    CONTEMPORARY_OF: '同时代共鸣',
    BY_ARTIST: '同一画家',
  },
  graphBridgeTitle: '与近期收听作品的关联（知识图谱）',
};

export function getGraphUIText(locale: Locale): GraphUIText {
  switch (locale) {
    case 'ja':
      return JA;
    case 'fr':
      return FR;
    case 'es':
      return ES;
    case 'zh':
      return ZH;
    default:
      return EN;
  }
}

export function formatRelationLabel(type: GraphRelationType, locale: Locale): string {
  return getGraphUIText(locale).relationLabels[type] ?? type;
}
