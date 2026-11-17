import { describe, expect, it } from 'vitest';
import {
  findArtworkPathTour,
  findHistoryGraphConnections,
  getArtworkNeighborhood,
  getGraphRecommendations,
  searchArtworksByGraphConcept,
} from './queries';

describe('Art Knowledge Graph queries (snapshot fallback)', () => {
  it('returns curated graph recommendations with relation labels and reasons', async () => {
    const result = await getGraphRecommendations('睡蓮', 'クロード・モネ', 5, 'ja');
    expect(result.source).toBe('snapshot');
    expect(result.recommendations.length).toBeGreaterThan(0);
    const hokusai = result.recommendations.find(r => r.title.includes('神奈川沖浪裏'));
    expect(hokusai).toBeDefined();
    expect(hokusai?.relationType).toBe('INFLUENCED_BY');
    expect(hokusai?.relationLabel).toBe('影響関係');
  });

  it('resolves English artwork titles via canonicalName', async () => {
    const result = await getGraphRecommendations('Water Lilies', 'Claude Monet', 4, 'en');
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.recommendations[0].relationLabel).toBeTruthy();
  });

  it('builds a neighborhood subgraph with center and connected nodes', async () => {
    const graph = await getArtworkNeighborhood('星月夜', 'フィンセント・ファン・ゴッホ', 'ja');
    expect(graph).not.toBeNull();
    expect(graph?.nodes.some(n => n.isCenter)).toBe(true);
    expect(graph?.nodes.some(n => n.kind === 'motif')).toBe(true);
    expect(graph?.edges.length).toBeGreaterThan(2);
  });

  it('finds shortest path tour between two distinct artworks', async () => {
    const tour = await findArtworkPathTour('富嶽三十六景 神奈川沖浪裏', '睡蓮', 'ja');
    expect(tour).not.toBeNull();
    expect(tour?.steps.length).toBeGreaterThanOrEqual(2);
    expect(tour?.steps[0].title).toBe('富嶽三十六景 神奈川沖浪裏');
    expect(tour?.steps[tour.steps.length - 1].title).toBe('睡蓮');
  });

  it('finds multi-hop path between Renaissance and Modern art', async () => {
    const tour = await findArtworkPathTour('ヴィーナスの誕生', 'ゲルニカ', 'ja');
    expect(tour).not.toBeNull();
    expect(tour?.steps.length).toBeGreaterThanOrEqual(2);
  });

  it('finds GraphRAG connections to recent viewing history', async () => {
    const hints = await findHistoryGraphConnections(
      '睡蓮',
      'クロード・モネ',
      [{ title: '富嶽三十六景 神奈川沖浪裏', artist: '葛飾北斎' }],
      'ja'
    );
    expect(hints.length).toBeGreaterThan(0);
    expect(hints[0].relatedTitle).toBe('富嶽三十六景 神奈川沖浪裏');
    expect(hints[0].hops).toBe(1);
  });

  it('searches artworks by concept/movement/motif like ジャポニスム or 浮世絵', async () => {
    const hits = await searchArtworksByGraphConcept('ジャポニスム', 5);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some(h => h.title.includes('神奈川沖浪裏') || h.title === '睡蓮')).toBe(true);
  });
});
