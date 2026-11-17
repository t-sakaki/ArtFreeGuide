'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Locale } from '@/lib/i18n';
import { localizeName } from '@/lib/names';
import { getGraphUIText } from '@/lib/graph/i18n';
import type {
  DynamicTourResult,
  GraphSubgraph,
  GraphVisualEdge,
  GraphVisualNode,
} from '@/lib/graph/types';

interface GraphArtworkOption {
  key: string;
  title: string;
  artist: string;
  year?: string;
  movement?: string;
}

interface Props {
  title?: string;
  artist?: string;
  locale: Locale;
  onSelectArtwork: (title: string, artist: string) => void;
  onStartDynamicTour: (tour: DynamicTourResult) => void;
}

interface PositionedNode {
  node: GraphVisualNode;
  x: number;
  y: number;
  edge?: GraphVisualEdge;
}

const SVG_W = 560;
const SVG_H = 340;
const CENTER_X = SVG_W / 2;
const CENTER_Y = SVG_H / 2;

function layoutRadialNodes(graph: GraphSubgraph): PositionedNode[] {
  const center = graph.nodes.find(n => n.isCenter);
  const others = graph.nodes.filter(n => !n.isCenter);
  const positioned: PositionedNode[] = [];

  if (center) {
    positioned.push({ node: center, x: CENTER_X, y: CENTER_Y });
  }

  // Group artworks on outer ring and metadata (artist, movement, motif, technique) closer
  const artworkNodes = others.filter(n => n.kind === 'artwork');
  const conceptNodes = others.filter(n => n.kind !== 'artwork');

  const edgeByTarget = new Map<string, GraphVisualEdge>();
  for (const edge of graph.edges) {
    edgeByTarget.set(edge.to, edge);
  }

  artworkNodes.forEach((node, idx) => {
    const angle = (-Math.PI / 2) + (idx / Math.max(1, artworkNodes.length)) * Math.PI * 2;
    const rx = 205;
    const ry = 122;
    positioned.push({
      node,
      x: CENTER_X + Math.cos(angle) * rx,
      y: CENTER_Y + Math.sin(angle) * ry,
      edge: edgeByTarget.get(node.id),
    });
  });

  conceptNodes.forEach((node, idx) => {
    const angle = (-Math.PI / 4) + (idx / Math.max(1, conceptNodes.length)) * Math.PI * 2;
    const rx = 112;
    const ry = 76;
    positioned.push({
      node,
      x: CENTER_X + Math.cos(angle) * rx,
      y: CENTER_Y + Math.sin(angle) * ry,
      edge: edgeByTarget.get(node.id),
    });
  });

  return positioned;
}

function nodeColors(kind: GraphVisualNode['kind'], isCenter?: boolean, isSelected?: boolean) {
  if (isCenter) {
    return {
      fill: '#0f766e',
      stroke: '#5eead4',
      text: '#f8fafc',
      badge: 'bg-teal-500/20 text-teal-200 border-teal-400/50',
    };
  }
  if (kind === 'artwork') {
    return {
      fill: isSelected ? '#164e63' : '#0f172a',
      stroke: isSelected ? '#22d3ee' : '#2dd4bf',
      text: '#e2e8f0',
      badge: 'bg-cyan-500/15 text-cyan-200 border-cyan-500/40',
    };
  }
  if (kind === 'artist') {
    return {
      fill: '#1e1b4b',
      stroke: '#818cf8',
      text: '#e0e7ff',
      badge: 'bg-indigo-500/15 text-indigo-200 border-indigo-400/40',
    };
  }
  if (kind === 'movement') {
    return {
      fill: '#3b0764',
      stroke: '#c084fc',
      text: '#f3e8ff',
      badge: 'bg-purple-500/15 text-purple-200 border-purple-400/40',
    };
  }
  if (kind === 'technique') {
    return {
      fill: '#451a03',
      stroke: '#fbbf24',
      text: '#fef3c7',
      badge: 'bg-amber-500/15 text-amber-200 border-amber-400/40',
    };
  }
  return {
    fill: '#1e293b',
    stroke: '#64748b',
    text: '#cbd5e1',
    badge: 'bg-slate-800 text-slate-300 border-slate-700',
  };
}

export default function ArtGraphMap({
  title = '',
  artist = '',
  locale,
  onSelectArtwork,
  onStartDynamicTour,
}: Props) {
  const t = getGraphUIText(locale);
  const [graph, setGraph] = useState<GraphSubgraph | null>(null);
  const [artworks, setArtworks] = useState<GraphArtworkOption[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [fromTitle, setFromTitle] = useState<string>('富嶽三十六景 神奈川沖浪裏');
  const [toTitle, setToTitle] = useState<string>('睡蓮');
  const [tourPreview, setTourPreview] = useState<DynamicTourResult | null>(null);
  const [tourLoading, setTourLoading] = useState(false);
  const [tourError, setTourError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ locale });
    if (title.trim()) params.set('title', title.trim());
    if (artist.trim()) params.set('artist', artist.trim());

    fetch(`/api/graph?${params.toString()}`)
      .then(res => (res.ok ? res.json() : null))
      .then((data: { graph?: GraphSubgraph | null; artworks?: GraphArtworkOption[] } | null) => {
        if (cancelled || !data) return;
        setGraph(data.graph ?? null);
        if (Array.isArray(data.artworks) && data.artworks.length > 0) {
          setArtworks(data.artworks);
        }
        setSelectedNodeId(null);
      })
      .catch(() => {
        if (!cancelled) setGraph(null);
      });

    return () => {
      cancelled = true;
    };
  }, [title, artist, locale]);

  useEffect(() => {
    if (graph?.centerTitle) {
      setFromTitle(graph.centerTitle);
      if (toTitle === graph.centerTitle) {
        const alt = artworks.find(a => a.title !== graph.centerTitle);
        if (alt) setToTitle(alt.title);
      }
    }
  }, [graph?.centerTitle, artworks, toTitle]);

  const positioned = useMemo(() => (graph ? layoutRadialNodes(graph) : []), [graph]);
  const selectedItem = useMemo(
    () => positioned.find(p => p.node.id === selectedNodeId) ?? null,
    [positioned, selectedNodeId]
  );

  const runPathSearch = useCallback(
    async (start: string, end: string) => {
      if (!start || !end || start === end) {
        setTourError(t.sameWorkError);
        setTourPreview(null);
        return;
      }
      setTourLoading(true);
      setTourError(null);
      try {
        const res = await fetch('/api/graph', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'path',
            fromTitle: start,
            toTitle: end,
            locale,
          }),
        });
        const data = (await res.json()) as { tour?: DynamicTourResult | null };
        if (!res.ok || !data.tour) {
          setTourPreview(null);
          setTourError(t.noPathFound);
        } else {
          setTourPreview(data.tour);
        }
      } catch {
        setTourPreview(null);
        setTourError(t.noPathFound);
      } finally {
        setTourLoading(false);
      }
    },
    [locale, t.noPathFound, t.sameWorkError]
  );

  if (!graph && artworks.length === 0) return null;

  return (
    <section className="w-full space-y-4 select-none font-sans">
      {/* 1. Interactive Knowledge Graph Map when viewing a known artwork */}
      {graph && (
        <div className="bg-slate-900/45 border border-slate-800/90 rounded-2xl p-4 space-y-3 shadow-lg">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold text-slate-200 tracking-wider uppercase flex items-center gap-1.5">
                <span>🕸️</span>
                <span>{t.mapTitle}</span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">{t.mapSubtitle}</p>
            </div>
            <span
              className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-mono border ${
                graph.source === 'neo4j'
                  ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
                  : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300'
              }`}
            >
              {graph.source === 'neo4j' ? `● ${t.liveBadge}` : `◆ ${t.snapshotBadge}`}
            </span>
          </div>

          <div className="w-full overflow-hidden rounded-xl bg-slate-950/90 border border-slate-800/80">
            <svg
              viewBox={`0 0 ${SVG_W} ${SVG_H}`}
              className="w-full h-auto block"
              role="img"
              aria-label={t.mapTitle}
            >
              <defs>
                <radialGradient id="artgraph-glow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="rgba(20, 184, 166, 0.16)" />
                  <stop offset="100%" stopColor="rgba(2, 6, 23, 0)" />
                </radialGradient>
              </defs>
              <rect width={SVG_W} height={SVG_H} fill="url(#artgraph-glow)" />

              {/* Edges */}
              {positioned
                .filter(p => !p.node.isCenter)
                .map(p => {
                  const isArtwork = p.node.kind === 'artwork';
                  const isSelected = p.node.id === selectedNodeId;
                  const midX = (CENTER_X + p.x) / 2;
                  const midY = (CENTER_Y + p.y) / 2;
                  return (
                    <g key={`edge-${p.node.id}`}>
                      <line
                        x1={CENTER_X}
                        y1={CENTER_Y}
                        x2={p.x}
                        y2={p.y}
                        stroke={isSelected ? '#22d3ee' : isArtwork ? '#14b8a6' : '#334155'}
                        strokeWidth={isSelected ? 2.2 : isArtwork ? 1.5 : 1}
                        strokeDasharray={isArtwork ? undefined : '3 3'}
                        strokeOpacity={isArtwork ? 0.75 : 0.6}
                      />
                      {isArtwork && p.edge?.label && (
                        <g transform={`translate(${midX}, ${midY})`}>
                          <rect
                            x={-30}
                            y={-8}
                            width={60}
                            height={16}
                            rx={8}
                            fill="#020617"
                            stroke="#1e293b"
                            strokeWidth={1}
                          />
                          <text
                            textAnchor="middle"
                            dominantBaseline="central"
                            fill="#67e8f9"
                            fontSize="8.5"
                            fontWeight="600"
                          >
                            {p.edge.label}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}

              {/* Nodes */}
              {positioned.map(p => {
                const isSelected = p.node.id === selectedNodeId;
                const colors = nodeColors(p.node.kind, p.node.isCenter, isSelected);
                const maxChars = p.node.kind === 'artwork' ? 12 : 10;
                const shortLabel =
                  p.node.label.length > maxChars
                    ? `${p.node.label.slice(0, maxChars - 1)}…`
                    : p.node.label;
                const pillW = Math.max(78, Math.min(132, shortLabel.length * 9.5 + 22));
                const pillH = p.node.isCenter ? 36 : p.node.kind === 'artwork' ? 30 : 22;

                return (
                  <g
                    key={p.node.id}
                    transform={`translate(${p.x}, ${p.y})`}
                    onClick={() => setSelectedNodeId(p.node.id === selectedNodeId ? null : p.node.id)}
                    className="cursor-pointer"
                  >
                    <rect
                      x={-pillW / 2}
                      y={-pillH / 2}
                      width={pillW}
                      height={pillH}
                      rx={pillH / 2}
                      fill={colors.fill}
                      stroke={colors.stroke}
                      strokeWidth={p.node.isCenter || isSelected ? 2 : 1.2}
                    />
                    <text
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill={colors.text}
                      fontSize={p.node.isCenter ? '11' : p.node.kind === 'artwork' ? '10' : '9'}
                      fontWeight={p.node.kind === 'artwork' ? '700' : '500'}
                    >
                      {shortLabel}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Selected Node Detail Card */}
          {selectedItem && !selectedItem.node.isCenter && (
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                      nodeColors(selectedItem.node.kind).badge
                    }`}
                  >
                    {t.nodeKinds[selectedItem.node.kind]}
                  </span>
                  <span className="text-xs font-bold text-slate-100">
                    {selectedItem.node.label}
                  </span>
                  {selectedItem.node.sublabel && (
                    <span className="text-[11px] text-slate-400">
                      ({selectedItem.node.sublabel})
                    </span>
                  )}
                </div>
                {selectedItem.edge?.reason && (
                  <p className="text-[11px] text-cyan-200/85 leading-relaxed">
                    {selectedItem.edge.reason}
                  </p>
                )}
              </div>
              {selectedItem.node.kind === 'artwork' && selectedItem.node.title && (
                <button
                  type="button"
                  onClick={() =>
                    onSelectArtwork(selectedItem.node.title!, selectedItem.node.artist ?? '')
                  }
                  className="shrink-0 px-3 py-1.5 rounded-lg bg-teal-500/15 hover:bg-teal-500/25 border border-teal-400/40 text-teal-200 text-xs font-bold transition-all active:scale-95"
                >
                  {t.openWork} →
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* 2. Dynamic Shortest-Path Tour Builder */}
      {artworks.length > 1 && (
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-4 space-y-3 shadow-md">
          <div>
            <h3 className="text-xs font-bold text-slate-200 tracking-wider uppercase flex items-center gap-1.5">
              <span>🧭</span>
              <span>{t.tourTitle}</span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">{t.tourSubtitle}</p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <span className="text-[10px] text-slate-500 self-center mr-1">{t.presetsLabel}:</span>
            {t.presets.map(preset => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setFromTitle(preset.from);
                  setToTitle(preset.to);
                  runPathSearch(preset.from, preset.to);
                }}
                className="px-2.5 py-1 rounded-full bg-slate-950/70 border border-slate-800 hover:border-cyan-500/50 text-[10px] text-slate-300 hover:text-cyan-200 transition-all active:scale-95"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
            <label className="space-y-1 text-left">
              <span className="block text-[10px] text-slate-400">{t.fromLabel}</span>
              <select
                value={fromTitle}
                onChange={e => setFromTitle(e.target.value)}
                className="w-full bg-slate-950/90 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
              >
                {artworks.map(art => (
                  <option key={`from-${art.key}`} value={art.title}>
                    {localizeName(art.title, locale)} ({localizeName(art.artist, locale)})
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-left">
              <span className="block text-[10px] text-slate-400">{t.toLabel}</span>
              <select
                value={toTitle}
                onChange={e => setToTitle(e.target.value)}
                className="w-full bg-slate-950/90 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
              >
                {artworks.map(art => (
                  <option key={`to-${art.key}`} value={art.title}>
                    {localizeName(art.title, locale)} ({localizeName(art.artist, locale)})
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={() => runPathSearch(fromTitle, toTitle)}
              disabled={tourLoading}
              className="px-3.5 py-2 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/40 text-cyan-200 text-xs font-bold transition-all active:scale-95 disabled:opacity-50"
            >
              {tourLoading ? t.buildingTour : t.buildTour}
            </button>
          </div>

          {tourError && <p className="text-[11px] text-rose-300/90">{tourError}</p>}

          {tourPreview && tourPreview.steps.length >= 2 && (
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 space-y-2.5">
              <div className="space-y-2">
                {tourPreview.steps.map((step, idx) => (
                  <div key={`${step.title}-${idx}`} className="flex items-start gap-2.5 text-left">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-teal-500/15 border border-teal-500/40 text-teal-300 text-[10px] font-mono flex items-center justify-center mt-0.5">
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-slate-100">
                          {localizeName(step.title, locale)}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {localizeName(step.artist, locale)}
                        </span>
                        {step.relationLabel && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300">
                            {step.relationLabel}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed mt-0.5">
                        {step.cue}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => onStartDynamicTour(tourPreview)}
                className="w-full py-2 rounded-xl bg-teal-500/20 hover:bg-teal-500/30 border border-teal-400/50 text-teal-200 text-xs font-bold transition-all active:scale-[0.99]"
              >
                🎧 {t.startTour} ({tourPreview.steps.length})
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
