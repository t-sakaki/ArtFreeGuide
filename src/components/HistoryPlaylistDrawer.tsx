'use client';

import React, { useEffect, useState } from 'react';
import { PlaylistSummary } from '@/types/knowledgeBase';

export interface HistoryEntryItem {
  title: string;
  artist: string;
  imageUrl?: string | null;
  artistSlug?: string | null;
  artworkSlug?: string | null;
  timestamp?: string;
}

interface HistoryPlaylistDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  history: HistoryEntryItem[];
  historyIndex: number;
  onSelectHistory: (index: number) => void;
  onClearHistory: () => void;
  currentPlaylistSlug?: string | null;
  onSelectPlaylist: (slug: string) => void;
}

export default function HistoryPlaylistDrawer({
  isOpen,
  onClose,
  history,
  historyIndex,
  onSelectHistory,
  onClearHistory,
  currentPlaylistSlug,
  onSelectPlaylist,
}: HistoryPlaylistDrawerProps) {
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState<boolean>(true);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setLoadingPlaylists(true);

    fetch('/api/playlists')
      .then((res) => res.json())
      .then((data) => {
        if (isMounted) {
          if (Array.isArray(data.playlists)) {
            setPlaylists(data.playlists);
          }
          setLoadingPlaylists(false);
        }
      })
      .catch((err) => {
        console.error('[HistoryPlaylistDrawer] Error loading playlists:', err);
        if (isMounted) {
          setLoadingPlaylists(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center animate-fade-in select-none">
      {/* Backdrop overlay (Clicking outside closes drawer) */}
      <div
        className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Drawer Container */}
      <div className="relative w-full max-w-lg bg-slate-950 border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 md:p-6 z-10 max-h-[85vh] flex flex-col overflow-hidden animate-slide-up">
        {/* Top Handle Pill */}
        <div className="w-12 h-1 bg-slate-800 rounded-full mx-auto mb-4 shrink-0" />

        {/* Drawer Header */}
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-900 font-sans shrink-0">
          <h3 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
            <span className="text-teal-400 text-lg">📜</span> 履歴 & プレイリスト
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition-all flex items-center justify-center text-sm"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Main Content Area */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-6 scrollbar-thin font-sans">
          
          {/* Section B: プレイリスト (Tour Playlists from DB) */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-300 tracking-wider uppercase flex items-center gap-1.5">
                <span className="text-teal-400">🏛️</span> ガイドツアー (プレイリスト)
              </h4>
              <span className="text-[10px] text-slate-500 font-medium">横スクロールで選択</span>
            </div>

            {loadingPlaylists ? (
              <div className="flex gap-3 overflow-x-auto pb-2 pt-1">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="w-40 sm:w-44 shrink-0 bg-slate-900/60 border border-slate-800/80 rounded-2xl p-3 space-y-2.5 animate-pulse"
                  >
                    <div className="w-full h-24 bg-slate-850 rounded-xl"></div>
                    <div className="h-3 bg-slate-850 rounded w-3/4"></div>
                    <div className="h-2.5 bg-slate-850 rounded w-1/2"></div>
                  </div>
                ))}
              </div>
            ) : playlists.length > 0 ? (
              <div className="flex gap-3 overflow-x-auto pb-2 pt-1 scrollbar-thin">
                {playlists.map((pl) => {
                  const isCurrent = currentPlaylistSlug === pl.slug;
                  return (
                    <div
                      key={pl.id}
                      onClick={() => {
                        onSelectPlaylist(pl.slug);
                        onClose();
                      }}
                      className={`w-40 sm:w-44 shrink-0 rounded-2xl p-3 cursor-pointer border transition-all duration-300 group flex flex-col justify-between ${
                        isCurrent
                          ? 'bg-teal-500/10 border-teal-500/50 shadow-lg shadow-teal-500/10'
                          : 'bg-slate-900/50 border-slate-850 hover:border-teal-500/40 hover:bg-slate-900 shadow-md'
                      }`}
                    >
                      <div>
                        <div className="relative w-full h-24 rounded-xl overflow-hidden bg-slate-950 border border-slate-850 flex items-center justify-center">
                          {pl.thumbnailUrl ? (
                            <img
                              src={pl.thumbnailUrl}
                              alt={pl.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            />
                          ) : (
                            <span className="text-2xl text-slate-600">🏛️</span>
                          )}
                          <span className="absolute top-1.5 right-1.5 bg-slate-950/80 backdrop-blur-md text-teal-400 font-mono font-bold text-[9px] px-1.5 py-0.5 rounded-full border border-teal-500/30">
                            {pl.itemCount}作品
                          </span>
                        </div>

                        <h5 className="font-bold text-xs text-slate-100 group-hover:text-teal-300 transition-colors mt-2.5 line-clamp-1">
                          {pl.name}
                        </h5>
                        {pl.description && (
                          <p className="text-[10px] text-slate-400 line-clamp-2 mt-1 leading-relaxed">
                            {pl.description}
                          </p>
                        )}
                      </div>

                      <div className="mt-3 pt-2 border-t border-slate-850/80 flex items-center justify-between text-[10px] text-teal-400 font-semibold group-hover:translate-x-0.5 transition-transform">
                        <span>ツアーを開始</span>
                        <span>→</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-slate-500 text-xs py-4 text-center bg-slate-900/30 border border-slate-900 rounded-xl">
                プレイリストが見つかりませんでした
              </div>
            )}
          </section>

          {/* Section A: 最近の履歴 (Recently Viewed) */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-300 tracking-wider uppercase flex items-center gap-1.5">
                <span className="text-teal-400">📜</span> 最近の閲覧履歴
              </h4>
              {history.length > 0 && (
                <span className="text-[10px] font-mono text-teal-400 font-bold bg-teal-500/10 px-2 py-0.5 rounded-full border border-teal-500/20">
                  {history.length}件
                </span>
              )}
            </div>

            {history.length === 0 ? (
              <div className="text-slate-500 text-xs py-8 text-center bg-slate-900/30 border border-slate-900 rounded-2xl leading-relaxed">
                閲覧履歴はありません。<br />
                作品解説を再生するとここに自動保存されます。
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1 scrollbar-thin">
                {history.map((entry, idx) => {
                  const isActive = idx === historyIndex;
                  return (
                    <div
                      key={idx}
                      onClick={() => {
                        onSelectHistory(idx);
                        onClose();
                      }}
                      className={`flex items-center gap-3 p-2.5 rounded-xl cursor-pointer border transition-all ${
                        isActive
                          ? 'bg-teal-500/10 border-teal-500/40 text-teal-300 font-bold shadow-sm'
                          : 'bg-slate-900/40 border-slate-850 hover:border-slate-800 hover:bg-slate-900 text-slate-300 hover:text-white'
                      }`}
                    >
                      <div className="w-11 h-11 rounded-lg overflow-hidden bg-slate-950 border border-slate-850 flex items-center justify-center shrink-0">
                        {entry.imageUrl ? (
                          <img
                            src={entry.imageUrl}
                            alt={entry.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-xs text-slate-500">🖼️</span>
                        )}
                      </div>

                      <div className="flex-1 min-w-0 text-left">
                        <p className="font-semibold text-xs truncate">{entry.title}</p>
                        <p className="text-[10px] text-slate-400 truncate mt-0.5">
                          {entry.artist || '作者不明'}
                        </p>
                      </div>

                      {isActive && (
                        <span className="text-[10px] bg-teal-500 text-slate-950 font-bold px-2 py-0.5 rounded-full shrink-0 font-mono">
                          再生中
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {history.length > 0 && (
              <div className="pt-2">
                <button
                  onClick={() => {
                    if (confirm('閲覧履歴をすべて消去しますか？')) {
                      onClearHistory();
                    }
                  }}
                  className="w-full py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 rounded-xl text-xs font-bold active:scale-95 transition-all flex items-center justify-center gap-1.5"
                >
                  <span>🗑️</span>
                  <span>履歴をクリア</span>
                </button>
              </div>
            )}
          </section>

        </div>
      </div>
    </div>
  );
}
