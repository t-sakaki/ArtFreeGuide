import { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_LOCALE } from '@/lib/i18n';
import { DROPOFF_KIND, GUIDE_CORRECTIONS_TABLE, proposeGuideCorrection } from '@/lib/guideCorrections';

/** Below this many samples, an average is noise, not a finding. */
const MIN_SAMPLES = 3;
/** Rows scanned per query. Generous for the traffic this app sees today. */
const SAMPLE_LIMIT = 5000;
const EVENTS_LIMIT = 20000;
/** How many artworks/corrections a report bothers to show. */
const REPORT_LIMIT = 20;
/** Below this, a low average is worth a rewrite attempt, not just a mention in the report. */
const AUTO_PROPOSE_MAX_COMPLETION = 0.3;
const AUTO_PROPOSE_MIN_SAMPLES = 5;
/** Caps LLM spend per report load; a backlog is worked through over repeat visits. */
const AUTO_PROPOSE_BATCH = 2;

export interface GuideQualityRow {
  title: string;
  artist: string;
  samples: number;
  /** 0–1: how far into the guide, on average, a listen went. */
  avgCompletion: number;
}

export interface CorrectionImpactRow {
  title: string;
  artist: string;
  resolvedAt: string;
  before: { samples: number; avgCompletion: number };
  after: { samples: number; avgCompletion: number };
}

export interface RecommendationCtrRow {
  basis: 'artwork' | 'blend' | 'taste';
  impressions: number;
  clicks: number;
  ctr: number;
}

interface HistorySample {
  segment_index: number | null;
  segment_count: number | null;
}

function completionRatio(row: HistorySample): number | null {
  if (!row.segment_count || row.segment_count <= 0) return null;
  return Math.min(Math.max(row.segment_index ?? 0, 0), row.segment_count) / row.segment_count;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** A nested one-to-one select comes back as an object, but PostgREST can also hand back a one-item array. */
function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * Where visitors stop listening, per artwork — worst completion first.
 * Finds a boring or broken section without waiting for someone to report it.
 */
export async function loadGuideQuality(supabase: SupabaseClient): Promise<GuideQualityRow[]> {
  const { data, error } = await supabase
    .from('viewing_history')
    .select('segment_index, segment_count, artworks(title, artist)')
    .not('segment_count', 'is', null)
    .gt('segment_count', 1)
    .limit(SAMPLE_LIMIT);

  if (error || !data) return [];

  const groups = new Map<string, { title: string; artist: string; ratios: number[] }>();
  for (const row of data as Array<HistorySample & { artworks: unknown }>) {
    const artwork = firstOf(row.artworks as { title: string; artist: string } | { title: string; artist: string }[] | null);
    const ratio = completionRatio(row);
    if (!artwork || ratio === null) continue;

    const key = `${artwork.title}::${artwork.artist}`;
    const group = groups.get(key) ?? { title: artwork.title, artist: artwork.artist, ratios: [] };
    group.ratios.push(ratio);
    groups.set(key, group);
  }

  return Array.from(groups.values())
    .filter(group => group.ratios.length >= MIN_SAMPLES)
    .map(group => ({
      title: group.title,
      artist: group.artist,
      samples: group.ratios.length,
      avgCompletion: average(group.ratios)
    }))
    .sort((a, b) => a.avgCompletion - b.avgCompletion)
    .slice(0, REPORT_LIMIT);
}

/**
 * Turns the worst rows of `loadGuideQuality()` into standing `guide_corrections`
 * proposals, so the report stops being something a person has to act on by
 * hand. Nothing is published here — the proposal lands in the same admin
 * queue a visitor's own report would, and only an approval there rewrites
 * the archive. Skips an artwork that already has a pending dropoff proposal,
 * so repeat report loads don't pile up duplicates.
 */
export async function proposeDropoffCorrections(
  supabase: SupabaseClient,
  guideQuality: GuideQualityRow[]
): Promise<{ queued: number }> {
  const candidates = guideQuality.filter(
    row => row.samples >= AUTO_PROPOSE_MIN_SAMPLES && row.avgCompletion < AUTO_PROPOSE_MAX_COMPLETION
  );

  let queued = 0;
  for (const candidate of candidates) {
    if (queued >= AUTO_PROPOSE_BATCH) break;

    const { data: existing } = await supabase
      .from(GUIDE_CORRECTIONS_TABLE)
      .select('id')
      .eq('title', candidate.title)
      .eq('artist', candidate.artist)
      .eq('kind', DROPOFF_KIND)
      .eq('status', 'pending')
      .maybeSingle();
    if (existing) continue;

    const comment = `平均完聴率 ${Math.round(candidate.avgCompletion * 100)}%（サンプル${candidate.samples}件）— 最後まで聴かれずに離脱する訪問者が多いガイドです。`;

    try {
      const proposed = await proposeGuideCorrection({
        title: candidate.title,
        artist: candidate.artist,
        locale: DEFAULT_LOCALE,
        kind: DROPOFF_KIND,
        comment,
        excerpt: ''
      });
      if (proposed) queued += 1;
    } catch (error) {
      // One bad candidate must not stop the rest of the report from loading.
      console.warn('Dropoff correction proposal failed:', error);
    }
  }

  return { queued };
}

/**
 * For each approved correction, average completion before vs. after the
 * moment it was actually published (`resolved_at`) — not when it was filed,
 * since the archive only changes at approval. Skips corrections without
 * enough listens on both sides to say anything.
 */
export async function loadCorrectionImpact(supabase: SupabaseClient): Promise<CorrectionImpactRow[]> {
  const { data: corrections, error } = await supabase
    .from('guide_corrections')
    .select('title, artist, resolved_at')
    .eq('status', 'approved')
    .not('resolved_at', 'is', null)
    .order('resolved_at', { ascending: false })
    .limit(REPORT_LIMIT);

  if (error || !corrections || corrections.length === 0) return [];

  const results: CorrectionImpactRow[] = [];

  for (const correction of corrections as Array<{ title: string; artist: string; resolved_at: string }>) {
    const { data: artwork } = await supabase
      .from('artworks')
      .select('id')
      .eq('title', correction.title)
      .eq('artist', correction.artist)
      .maybeSingle<{ id: string }>();
    if (!artwork) continue;

    const { data: history } = await supabase
      .from('viewing_history')
      .select('segment_index, segment_count, viewed_at')
      .eq('artwork_id', artwork.id)
      .not('segment_count', 'is', null)
      .gt('segment_count', 1);
    if (!history) continue;

    const before: number[] = [];
    const after: number[] = [];
    for (const row of history as Array<HistorySample & { viewed_at: string }>) {
      const ratio = completionRatio(row);
      if (ratio === null) continue;
      (row.viewed_at < correction.resolved_at ? before : after).push(ratio);
    }

    if (before.length < MIN_SAMPLES || after.length < MIN_SAMPLES) continue;

    results.push({
      title: correction.title,
      artist: correction.artist,
      resolvedAt: correction.resolved_at,
      before: { samples: before.length, avgCompletion: average(before) },
      after: { samples: after.length, avgCompletion: average(after) }
    });
  }

  return results;
}

/**
 * Click-through by `basis` — the same value /api/recommendations already
 * returns. Compares plain similarity ('artwork') against the taste-vector
 * personalised shelves ('blend' / 'taste'), so personalising is judged by
 * whether it earns clicks rather than assumed to help.
 */
export async function loadRecommendationCtr(supabase: SupabaseClient): Promise<RecommendationCtrRow[]> {
  const { data, error } = await supabase
    .from('recommendation_events')
    .select('kind, basis')
    .limit(EVENTS_LIMIT);

  if (error || !data) return [];

  const counts = new Map<string, { impressions: number; clicks: number }>();
  for (const row of data as Array<{ kind: string; basis: string }>) {
    const entry = counts.get(row.basis) ?? { impressions: 0, clicks: 0 };
    if (row.kind === 'impression') entry.impressions += 1;
    else if (row.kind === 'click') entry.clicks += 1;
    counts.set(row.basis, entry);
  }

  return Array.from(counts.entries())
    .map(([basis, { impressions, clicks }]) => ({
      basis: basis as RecommendationCtrRow['basis'],
      impressions,
      clicks,
      ctr: impressions > 0 ? clicks / impressions : 0
    }))
    .sort((a, b) => b.impressions - a.impressions);
}
