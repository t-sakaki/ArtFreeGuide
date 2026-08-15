'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { ensureAnonymousUser } from '@/lib/user';
import ArtworkStage from '@/components/ArtworkStage';
import { findHotspotSet, hotspotImageUrl, matchHotspot } from '@/lib/hotspots';
import { useRecommendations, useTasteProfile } from '@/hooks/useRecommendations';
import ForYouShelf from '@/components/ForYouShelf';
import {
  AmbientPlayer,
  MusicSpec,
  describeMusicSpec,
  guessMusicSpec,
  normalizeMusicSpec,
  specFromLegacyMood,
} from '@/lib/ambient';
import { PLAYLISTS, Playlist } from '@/lib/playlists';
import { suggestedQuestions } from '@/lib/questions';
import { toSpokenText } from '@/lib/pronunciation';
import ReactMarkdown from 'react-markdown';

interface ArtworkSuggestion {
  title: string;
  artist: string;
  isAi?: boolean;
  /** The archive already holds this guide, so it starts without generation. */
  isInstant?: boolean;
}

interface Recommendation {
  title: string;
  artist: string;
  reason: string;
  imageUrl: string | null;
  imageLoading: boolean;
}

interface GuideCacheEntry {
  short: string;
  standard: string;
  deep: string;
  imageUrl: string | null;
  imageError: boolean;
  searchQuery: string;
  recommendations: Recommendation[];
  music?: MusicSpec;
  /** Guides cached before the music spec existed */
  mood?: string;
}

interface HistoryEntry {
  title: string;
  artist: string;
  short: string;
  standard: string;
  deep: string;
  imageUrl: string | null;
  imageError: boolean;
  searchQuery: string;
  recommendations: Recommendation[];
  timestamp: string;
  music?: MusicSpec;
  /** History written before the music spec existed */
  mood?: string;
}

// The model's spec wins; then a legacy mood word; then keyword heuristics.
function resolveMusicSpec(
  music: unknown,
  legacyMood: unknown,
  fallbackText: string
): MusicSpec {
  if (music && typeof music === 'object') return normalizeMusicSpec(music);
  return specFromLegacyMood(legacyMood) ?? guessMusicSpec(fallbackText);
}

const PRESET_ARTWORKS: ArtworkSuggestion[] = [
  { title: 'ひまわり', artist: 'フィンセント・ファン・ゴッホ' },
  { title: '星月夜', artist: 'フィンセント・ファン・ゴッホ' },
  { title: 'モナ・リザ', artist: 'レオナルド・ダ・ヴィンチ' },
  { title: '最後の晩餐', artist: 'レオナルド・ダ・ヴィンチ' },
  { title: '印象・日の出', artist: 'クロード・モネ' },
  { title: '睡蓮', artist: 'クロード・モネ' },
  { title: 'ゲルニカ', artist: 'パブロ・ピカソ' },
  { title: 'アビニヨンの娘たち', artist: 'パブロ・ピカソ' },
  { title: '叫び', artist: 'エドヴァルド・ムンク' },
  { title: '真珠の耳飾りの少女', artist: 'ヨハネス・フェルメール' },
  { title: '記憶の固執', artist: 'サルバドール・ダリ' },
  { title: '神奈川沖浪裏', artist: '葛飾北斎' },
  { title: '風神雷神図屏風', artist: '俵屋宗達' },
  { title: '南瓜', artist: '草間彌生' },
];

// Shown on the landing screen so a visitor (or a demo) can start with one tap.
const QUICK_START_ARTWORKS: { title: string; artist: string; emoji: string }[] = [
  { title: '睡蓮', artist: 'クロード・モネ', emoji: '🪷' },
  { title: '星月夜', artist: 'フィンセント・ファン・ゴッホ', emoji: '🌌' },
  { title: 'モナ・リザ', artist: 'レオナルド・ダ・ヴィンチ', emoji: '🖼️' },
  { title: '真珠の耳飾りの少女', artist: 'ヨハネス・フェルメール', emoji: '💧' },
  { title: '叫び', artist: 'エドヴァルド・ムンク', emoji: '😱' },
  { title: '富嶽三十六景 神奈川沖浪裏', artist: '葛飾北斎', emoji: '🌊' },
];

const CURATOR_LOADING_MESSAGES = [
  '作品の資料を探しています...',
  '時代背景を読み解いています...',
  '画家の人生をたどっています...',
  '見どころを整理しています...',
  '音声ガイドの原稿を書いています...',
];

const PRESET_ARTISTS = [
  'フィンセント・ファン・ゴッホ',
  'レオナルド・ダ・ヴィンチ',
  'クロード・モネ',
  'パブロ・ピカソ',
  'エドヴァルド・ムンク',
  'ヨハネス・フェルメール',
  'サルバドール・ダリ',
  '葛飾北斎',
  '草間彌生',
  'アンディ・ウォーホル',
  'ピエール＝オーギュスト・ルノワール',
  'ミケランジェロ・ブオナローティ',
  'ジャン＝ミシェル・バスキア',
];

// LLM output occasionally leaks JSON escapes (literal \n, \") or wrapping quotes
// into the guide body. Normalise it before it ever reaches the screen or the TTS.
function sanitizeGuideText(text: string): string {
  return text
    .replace(/\\r\\n|\\r|\\n/g, '\n')
    .replace(/\\t/g, ' ')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/^[\s"']+|[\s"']+$/g, '')
    .trim();
}

class AudioController {
  private static speechTimeoutId: any = null;
  private static startTimeoutId: any = null;

  static clearQueue() {
    console.log('[AUDIO] Queue Cancelled');
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.resume(); // Unstick if paused
        window.speechSynthesis.cancel();
      } catch (e) {
        console.warn('[AUDIO] Cancel failed:', e);
      }
    }
    if (this.speechTimeoutId) {
      clearTimeout(this.speechTimeoutId);
      this.speechTimeoutId = null;
    }
    if (this.startTimeoutId) {
      clearTimeout(this.startTimeoutId);
      this.startTimeoutId = null;
    }
  }

  static forceUnlock() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.resume();
        const dummy = new SpeechSynthesisUtterance('');
        dummy.volume = 0;
        window.speechSynthesis.speak(dummy);
      } catch (e) {
        console.warn('[AUDIO] Force unlock failed:', e);
      }
    }
  }

  static speak(
    index: number,
    text: string,
    rate: number,
    onStart: () => void,
    onEnd: () => void,
    onError: (e: any) => void
  ) {
    this.clearQueue();

    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }

    // Give browser 50ms to register the cancellation
    setTimeout(() => {
      console.log(`[AUDIO] Attempting to speak sentence #${index}`);

      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.resume(); // Ensure speaking state is active
        } catch (e) {}
      }

      // The dictionary only affects what is spoken; the screen keeps the kanji.
      const utterance = new SpeechSynthesisUtterance(toSpokenText(text));
      utterance.lang = 'ja-JP';
      utterance.rate = rate;

      let hasFinished = false;

      const handleTransition = (type: 'end' | 'error' | 'timeout', detail?: any) => {
        if (hasFinished) return;
        hasFinished = true;

        if (this.speechTimeoutId) {
          clearTimeout(this.speechTimeoutId);
          this.speechTimeoutId = null;
        }
        if (this.startTimeoutId) {
          clearTimeout(this.startTimeoutId);
          this.startTimeoutId = null;
        }

        if (type === 'end') {
          onEnd();
        } else if (type === 'error') {
          onError(detail);
        } else {
          console.warn(`[AUDIO] Sentence #${index} Timeout! Forcing transition`);
          onEnd();
        }
      };

      // If speech fails to start in 2.5 seconds, force transition to avoid getting stuck
      this.startTimeoutId = setTimeout(() => {
        console.warn(`[AUDIO] Sentence #${index} failed to start in 2.5s. Skipping.`);
        handleTransition('timeout');
      }, 2500);

      utterance.onstart = () => {
        if (this.startTimeoutId) {
          clearTimeout(this.startTimeoutId);
          this.startTimeoutId = null;
        }
        console.log(`[AUDIO] Voice started for #${index}`);
        onStart();
      };

      utterance.onend = () => {
        console.log(`[AUDIO] Sentence #${index} Ended`);
        handleTransition('end');
      };

      utterance.onerror = (e) => {
        console.warn(`[AUDIO] Sentence #${index} Error:`, e);
        handleTransition('error', e);
      };

      // Safety timeout: 200ms per character, min 15 seconds
      const timeoutDuration = Math.max(15000, text.length * 200);
      this.speechTimeoutId = setTimeout(() => {
        handleTransition('timeout');
      }, timeoutDuration);

      window.speechSynthesis.speak(utterance);
    }, 50);
  }
}

export default function ArtFreeGuide() {
  const [artwork, setArtwork] = useState('');
  const [artist, setArtist] = useState('');
  const [loading, setLoading] = useState(false);

  // Personalized Explanation Modes
  const [responseShort, setResponseShort] = useState('');
  const [responseStandard, setResponseStandard] = useState('');
  const [responseDeep, setResponseDeep] = useState('');
  const [explanationMode, setExplanationMode] = useState<'short' | 'standard' | 'deep'>('short');

  // Client-side cache for fetched guides
  const [guideCache, setGuideCache] = useState<Record<string, GuideCacheEntry>>({});

  // History State
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [showHistorySidebar, setShowHistorySidebar] = useState(false);

  // Compact Interface Drawer / Popover States
  const [showInputDrawer, setShowInputDrawer] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  // Toast Notification State
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // Autocomplete States
  const [artworkSuggestions, setArtworkSuggestions] = useState<ArtworkSuggestion[]>([]);
  const [showArtworkSuggestions, setShowArtworkSuggestions] = useState(false);
  const [focusedArtworkIndex, setFocusedArtworkIndex] = useState(-1);
  const [suggestCache, setSuggestCache] = useState<Record<string, ArtworkSuggestion[]>>({});

  const [artistSuggestions, setArtistSuggestions] = useState<string[]>([]);
  const [showArtistSuggestions, setShowArtistSuggestions] = useState(false);
  const [focusedArtistIndex, setFocusedArtistIndex] = useState(-1);

  // Image State
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [activeHotspotId, setActiveHotspotId] = useState<string | null>(null);
  // A tapped point stays focused until dismissed; narration must not steal it.
  const [hotspotPinned, setHotspotPinned] = useState(false);
  const [showArtworkViewer, setShowArtworkViewer] = useState(false);
  /** Detail id carried by a shared link, applied once the artwork's hotspots load. */
  const pendingHotspotRef = useRef<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Recommendations State
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);

  // Next-Gen Audio Control States
  const [segments, setSegments] = useState<string[]>([]);
  const [speakableSegments, setSpeakableSegments] = useState<string[]>([]);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.5);
  const [speechSupported, setSpeechSupported] = useState(false);

  // Deep Dive & Interactive Feedback States
  const [deepDiveLoading, setDeepDiveLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const [recognition, setRecognition] = useState<any>(null);

  // Visitor questions and feedback on the guide
  const [questionInput, setQuestionInput] = useState('');
  const [askLoading, setAskLoading] = useState(false);
  const [showReportForm, setShowReportForm] = useState(false);
  const [reportComment, setReportComment] = useState('');
  const [regenerating, setRegenerating] = useState(false);
  // Live-stream style hearts: each tap spawns one that drifts up and is then dropped.
  const [hearts, setHearts] = useState<{ id: number; drift: number; scale: number }[]>([]);
  const [heartCount, setHeartCount] = useState(0);
  const heartIdRef = useRef(0);
  const heartBurstRef = useRef(0);
  const heartSendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Browsers need a gesture before speech works, so the play button is signposted
  // until playback has started, however it started.
  const [hasPlayedOnce, setHasPlayedOnce] = useState(false);
  // Once the narration is over the question chips take turns wobbling to invite a tap.
  const [narrationDone, setNarrationDone] = useState(false);
  const [nudgedChip, setNudgedChip] = useState(-1);

  // Ambient Sound States
  const [ambientName, setAmbientName] = useState<string | null>(null);
  const ambientPlayerRef = useRef<AmbientPlayer | null>(null);
  const musicSpecRef = useRef<MusicSpec | null>(null);

  // Rotating curator status text while the guide is being generated
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);

  // Curated tour (playlist) state
  const [activePlaylist, setActivePlaylist] = useState<Playlist | null>(null);
  const [playlistIndex, setPlaylistIndex] = useState(0);
  const [nextUpCue, setNextUpCue] = useState<string | null>(null);
  // Scroll bars are hidden, so a gradient tells the visitor there is more text below.
  const guideBoxRef = useRef<HTMLDivElement | null>(null);
  const [showScrollHint, setShowScrollHint] = useState(false);
  // Grab-and-drag scrolling, so a mouse can scroll the guide the way a finger does.
  // A gesture becomes either a scroll or a text selection depending on its direction.
  const [isDraggingGuide, setIsDraggingGuide] = useState(false);
  const guideDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startTop: number;
    mode: 'undecided' | 'scroll' | 'select';
  } | null>(null);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Artwork the tour expects next; anything else means the visitor left the tour. */
  const tourTargetRef = useRef<string | null>(null);

  const narrationProgress =
    speakableSegments.length > 0
      ? Math.min(Math.max(activeSegmentIndex + 1, 0) / speakableSegments.length, 1)
      : 0;

  // Anonymous user + catalogue-based recommendations
  const [userId, setUserId] = useState<string | null>(null);
  const { similarArtworks, basis: recommendationBasis, reload: reloadRecommendations } =
    useRecommendations(artwork, artist, userId);
  // Taste-only shelf for the browse hub, where no artwork is in context yet.
  const {
    similarArtworks: tasteRecommendations,
    basis: tasteBasis,
    reload: reloadTasteRecommendations
  } = useRecommendations('', '', userId);
  const { profile: tasteProfile, reload: reloadTasteProfile } = useTasteProfile(userId);

  // Refs for tracking properties in async speech callbacks
  const isPlayingRef = useRef(false);
  const speedRef = useRef(1.5);
  const activeIndexRef = useRef(-1);
  const speakableSegmentsRef = useRef<string[]>([]);
  /** `index::text` of the segment already handed to the speech engine. */
  const spokenKeyRef = useRef<string | null>(null);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
    if (isPlaying) setHasPlayedOnce(true);
  }, [isPlaying]);

  useEffect(() => {
    speedRef.current = playbackSpeed;
  }, [playbackSpeed]);

  useEffect(() => {
    activeIndexRef.current = activeSegmentIndex;
  }, [activeSegmentIndex]);

  useEffect(() => {
    speakableSegmentsRef.current = speakableSegments;
  }, [speakableSegments]);

  // How long the visitor actually listened, used to weight preference learning
  const listenStartRef = useRef<number | null>(null);
  const listenedSecondsRef = useRef(0);

  useEffect(() => {
    if (isPlaying) {
      listenStartRef.current = Date.now();
      return;
    }
    if (listenStartRef.current !== null) {
      listenedSecondsRef.current += (Date.now() - listenStartRef.current) / 1000;
      listenStartRef.current = null;
    }
  }, [isPlaying]);

  useEffect(() => {
    listenedSecondsRef.current = 0;
    listenStartRef.current = null;
    setShowReportForm(false);
    setReportComment('');
    setHeartCount(0);
    setNarrationDone(false);
  }, [artwork, artist]);

  useEffect(() => {
    ensureAnonymousUser().then(setUserId);
  }, []);

  // Keep the ambient pad under the narration while speech is playing
  useEffect(() => {
    ambientPlayerRef.current?.setDucked(isPlaying);
  }, [isPlaying]);

  useEffect(() => {
    return () => {
      ambientPlayerRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    if (!loading) {
      setLoadingMessageIndex(0);
      return;
    }
    const timer = setInterval(() => {
      setLoadingMessageIndex(prev => (prev + 1) % CURATOR_LOADING_MESSAGES.length);
    }, 2500);
    return () => clearInterval(timer);
  }, [loading]);

  const recordListening = (completed: boolean) => {
    const listenedSeconds = listenedSecondsRef.current;
    if (!userId || !artwork.trim() || listenedSeconds < 1) return;

    fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        title: artwork,
        artist,
        description: responseShort || responseStandard || null,
        imageUrl,
        depth: explanationMode,
        listenedSeconds,
        completed
      })
    })
      .then(() => {
        // The listen just moved the taste vector; show the new ranking.
        reloadTasteProfile();
        reloadRecommendations();
        reloadTasteRecommendations();
      })
      .catch(error => console.error('Failed to save viewing history:', error));
  };

  // Detect browser speech capabilities and prepare recognition instance
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if ('speechSynthesis' in window) {
      setSpeechSupported(true);
      // Populate the voice list early so the first utterance is not dropped
      window.speechSynthesis.getVoices();
    }

    const SpeechRecognitionClass =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognitionClass) {
      const instance = new SpeechRecognitionClass();
      instance.lang = 'ja-JP';
      instance.interimResults = false;
      instance.continuous = false;
      instance.maxAlternatives = 1;
      setRecognition(instance);
    }
  }, []);

  // Toast trigger helper
  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  };

  // State parameter synchronizer (using replaceState to avoid history clutter)
  const syncUrlState = (
    title: string,
    artistName: string,
    speedValue: number,
    modeValue: 'short' | 'standard' | 'deep',
    tourId: string | null
  ) => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (title.trim()) {
      url.searchParams.set('artwork', title);
    } else {
      url.searchParams.delete('artwork');
    }
    if (artistName && artistName.trim()) {
      url.searchParams.set('artist', artistName);
    } else {
      url.searchParams.delete('artist');
    }
    url.searchParams.set('speed', speedValue.toFixed(1));
    url.searchParams.set('mode', modeValue);
    if (tourId) {
      url.searchParams.set('tour', tourId);
    } else {
      url.searchParams.delete('tour');
    }
    // The focused detail travels in shared links only, not in the live address bar.
    url.searchParams.delete('spot');

    window.history.replaceState({}, '', url.toString());
  };

  // Real-time synchronization effect
  useEffect(() => {
    if (artwork.trim()) {
      syncUrlState(artwork, artist, playbackSpeed, explanationMode, activePlaylist?.id ?? null);
    }
  }, [artwork, artist, playbackSpeed, explanationMode, activePlaylist]);

  // URL parameters listener (Deep Linking & Initial State Setup)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleUrlChange = () => {
      const params = new URLSearchParams(window.location.search);
      const artworkParam = params.get('artwork') || '';
      const artistParam = params.get('artist') || '';
      const speedParam = params.get('speed') || '';
      const modeParam = params.get('mode') || '';
      const tourParam = params.get('tour') || '';
      const spotParam = params.get('spot') || '';

      // 1. Sync speed if present in URL
      if (speedParam) {
        const parsedSpeed = parseFloat(speedParam);
        if (!isNaN(parsedSpeed) && [1.0, 1.2, 1.5, 1.7, 2.0, 2.5].includes(parsedSpeed)) {
          setPlaybackSpeed(parsedSpeed);
        }
      }

      // 2. Sync mode if present in URL
      if (modeParam && ['short', 'standard', 'deep'].includes(modeParam)) {
        setExplanationMode(modeParam as 'short' | 'standard' | 'deep');
      }

      // 3. Restore the shared detail once the artwork's hotspots are known
      pendingHotspotRef.current = spotParam || null;

      // 4. Sync and generate guide if present in URL
      const sharedTour = tourParam ? PLAYLISTS.find(p => p.id === tourParam) ?? null : null;
      if (sharedTour) {
        const index = sharedTour.items.findIndex(item => item.title === artworkParam);
        startTour(sharedTour, index >= 0 ? index : 0);
      } else if (artworkParam.trim()) {
        generateGuide(artworkParam, artistParam, modeParam as 'short' | 'standard' | 'deep');
      }
    };

    window.addEventListener('popstate', handleUrlChange);
    // Initial load check
    handleUrlChange();

    return () => window.removeEventListener('popstate', handleUrlChange);
  }, []);

  // Load initial settings and session on mount
  useEffect(() => {
    // 1. Restore playback speed
    const savedSpeed = localStorage.getItem('art_free_guide_playback_speed');
    if (savedSpeed) {
      setPlaybackSpeed(parseFloat(savedSpeed));
    } else {
      setPlaybackSpeed(1.5);
    }

    // 2. Restore history
    const savedHistoryStr = localStorage.getItem('art_free_guide_history');
    const savedIndexStr = localStorage.getItem('art_free_guide_history_index');
    const draftArtwork = localStorage.getItem('art_free_guide_draft_artwork') || '';
    const draftArtist = localStorage.getItem('art_free_guide_draft_artist') || '';

    // Only set draft inputs if URL parameters are empty
    const params = new URLSearchParams(window.location.search);
    if (!params.get('artwork')) {
      setArtwork(draftArtwork);
      setArtist(draftArtist);

      if (savedHistoryStr) {
        try {
          const parsedHistory = JSON.parse(savedHistoryStr) as HistoryEntry[];
          setHistory(parsedHistory);

          if (savedIndexStr) {
            const idx = parseInt(savedIndexStr, 10);
            if (idx >= 0 && idx < parsedHistory.length) {
              setHistoryIndex(idx);
              const entry = parsedHistory[idx];

              if (!draftArtwork) setArtwork(entry.title);
              if (!draftArtist) setArtist(entry.artist);

              // Restore output states
              setResponseShort(sanitizeGuideText(entry.short || ''));
              setResponseStandard(sanitizeGuideText(entry.standard || ''));
              setResponseDeep(sanitizeGuideText(entry.deep || ''));
              musicSpecRef.current = resolveMusicSpec(entry.music, entry.mood, `${entry.title} ${entry.artist}`);
              setExplanationMode('short');
              setImageUrl(entry.imageUrl);
              setImageError(entry.imageError);
              setSearchQuery(entry.searchQuery);
              setRecommendations(entry.recommendations);
            }
          }
        } catch (e) {
          console.error('Failed to parse history from localStorage', e);
        }
      }
    } else {
      // Just load history array to enable sidebar drawer display
      if (savedHistoryStr) {
        try {
          const parsedHistory = JSON.parse(savedHistoryStr) as HistoryEntry[];
          setHistory(parsedHistory);
        } catch (e) {}
      }
    }
  }, []);

  const updateHistoryEntryByArtwork = (artworkTitle: string, artistName: string, fields: Partial<HistoryEntry>) => {
    setHistory(prev => {
      const copy = [...prev];
      const idx = copy.findIndex(
        entry =>
          entry.title.trim().toLowerCase() === artworkTitle.trim().toLowerCase() &&
          (entry.artist || '').trim().toLowerCase() === (artistName || '').trim().toLowerCase()
      );
      if (idx !== -1) {
        copy[idx] = { ...copy[idx], ...fields };
        localStorage.setItem('art_free_guide_history', JSON.stringify(copy));
      }
      return copy;
    });
  };

  const loadHistoryEntry = (index: number) => {
    if (index < 0 || index >= history.length) return;
    setHistoryIndex(index);
    localStorage.setItem('art_free_guide_history_index', String(index));

    const entry = history[index];
    setArtwork(entry.title);
    setArtist(entry.artist);
    
    // Save draft artwork/artist as well so session state is consistent
    localStorage.setItem('art_free_guide_draft_artwork', entry.title);
    localStorage.setItem('art_free_guide_draft_artist', entry.artist);

    setResponseShort(sanitizeGuideText(entry.short || ''));
    setResponseStandard(sanitizeGuideText(entry.standard || ''));
    setResponseDeep(sanitizeGuideText(entry.deep || ''));
    musicSpecRef.current = resolveMusicSpec(entry.music, entry.mood, `${entry.title} ${entry.artist}`);
    setExplanationMode('short');
    setImageUrl(entry.imageUrl);
    setImageError(entry.imageError);
    setSearchQuery(entry.searchQuery);
    setRecommendations(entry.recommendations);

    // Stop speaking immediately on navigation
    setActiveSegmentIndex(-1);
    setIsPlaying(false);
    AudioController.clearQueue();
    stopAmbientSound();
  };

  // Split explanation markdown into clean sentence segments
  const parseSegments = (text: string) => {
    if (!text) return [];
    const splitList: string[] = [];
    let current = '';
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      current += char;
      if (char === '。' || char === '\n') {
        if (current.trim()) {
          splitList.push(current);
        }
        current = '';
      }
    }
    if (current.trim()) {
      splitList.push(current);
    }
    return splitList;
  };

  // Compute displayed text based on mode
  const getActiveExplanation = () => {
    if (!responseShort) return '';
    if (explanationMode === 'short') return responseShort;
    if (explanationMode === 'standard') return `${responseShort}\n\n${responseStandard}`;
    return `${responseShort}\n\n${responseStandard}\n\n${responseDeep}`;
  };

  const activeText = getActiveExplanation();

  // Dynamic Segment compilation
  useEffect(() => {
    if (!activeText) {
      setSegments([]);
      setSpeakableSegments([]);
      return;
    }
    const parsedSegs = parseSegments(activeText);
    const cleanSpeakables = parsedSegs.filter(seg => seg.replace(/[#*_`~\s]/g, '').trim().length > 0);
    setSegments(parsedSegs);
    setSpeakableSegments(cleanSpeakables);
  }, [activeText]);

  // Scroll active segment into view
  useEffect(() => {
    if (activeSegmentIndex >= 0) {
      const el = document.getElementById(`seg-${activeSegmentIndex}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [activeSegmentIndex]);

  // Trigger speech for active index. Autoplay flips isPlaying in the same render
  // that sets the guide text, so the segments only exist a render later: this has
  // to react to speakableSegments too, or the bar shows playing in silence.
  useEffect(() => {
    if (!isPlaying) {
      spokenKeyRef.current = null;
      return;
    }
    if (speakableSegments.length === 0) return;

    if (activeSegmentIndex >= 0 && activeSegmentIndex < speakableSegments.length) {
      // Appending an answer re-runs this effect; don't restart the current segment.
      const key = `${activeSegmentIndex}::${speakableSegments[activeSegmentIndex]}`;
      if (spokenKeyRef.current === key) return;
      spokenKeyRef.current = key;
      speakSegment(activeSegmentIndex);
    } else if (activeSegmentIndex >= speakableSegments.length) {
      // Finished speaking
      setIsPlaying(false);
      setActiveSegmentIndex(-1);
      stopAmbientSound();
      recordListening(true);
      setNarrationDone(true);
      scheduleTourAdvance();
    }
  }, [activeSegmentIndex, isPlaying, speakableSegments]);

  const questionChips = useMemo(() => suggestedQuestions(artwork, artist), [artwork, artist]);

  // After the guide falls silent, nudge each chip in turn a couple of rounds and stop.
  useEffect(() => {
    // A tour is already moving on to the next artwork, so stay out of the way.
    if (!narrationDone || isPlaying || askLoading || nextUpCue || questionChips.length === 0) {
      setNudgedChip(-1);
      return;
    }
    let step = 0;
    const total = questionChips.length * 2;
    const timer = setInterval(() => {
      if (step >= total) {
        setNudgedChip(-1);
        clearInterval(timer);
        return;
      }
      setNudgedChip(step % questionChips.length);
      step += 1;
    }, 900);
    return () => {
      clearInterval(timer);
      setNudgedChip(-1);
    };
  }, [narrationDone, isPlaying, askLoading, nextUpCue, questionChips]);

  // Curated viewing points for the artwork on screen, if we have measured any.
  const hotspotSet = useMemo(() => findHotspotSet(artwork, artist), [artwork, artist]);
  const hotspots = hotspotSet?.hotspots ?? [];
  // Coordinates were measured on one specific reproduction, so it wins over search results.
  const displayImageUrl = hotspotSet ? hotspotImageUrl(hotspotSet.file) : imageUrl;
  const activeHotspot = hotspots.find(h => h.id === activeHotspotId) ?? null;

  useEffect(() => {
    const shared = pendingHotspotRef.current;
    pendingHotspotRef.current = null;
    const restored = shared && hotspotSet?.hotspots.some(h => h.id === shared) ? shared : null;
    setActiveHotspotId(restored);
    setHotspotPinned(restored !== null);
  }, [hotspotSet]);

  // Follow the narration: zoom to whichever detail is being talked about.
  useEffect(() => {
    if (!hotspotSet || hotspotPinned) return;
    if (!isPlaying || activeSegmentIndex < 0 || activeSegmentIndex >= speakableSegments.length) return;

    const match = matchHotspot(hotspotSet, speakableSegments[activeSegmentIndex]);
    if (match) setActiveHotspotId(match.id);
  }, [hotspotSet, hotspotPinned, isPlaying, activeSegmentIndex, speakableSegments]);

  const selectHotspot = (id: string | null) => {
    setActiveHotspotId(id);
    setHotspotPinned(id !== null);
  };

  // A tour keeps going on its own: once narration ends, walk to the next artwork.
  const scheduleTourAdvance = () => {
    const tour = activePlaylist;
    if (!tour) return;

    const next = tour.items[playlistIndex + 1];
    if (!next) {
      setNextUpCue(null);
      triggerToast(`「${tour.title}」はこれで終わりです。お疲れさまでした`);
      return;
    }

    setNextUpCue(`次は「${next.title}」— ${next.cue}`);
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    advanceTimerRef.current = setTimeout(() => {
      setNextUpCue(null);
      setPlaylistIndex(playlistIndex + 1);
      tourTargetRef.current = `${next.title}::${next.artist}`;
      generateGuide(next.title, next.artist);
    }, 4000);
  };

  const cancelTourAdvance = () => {
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
    setNextUpCue(null);
  };

  const startTour = (tour: Playlist, index = 0) => {
    cancelTourAdvance();
    const item = tour.items[index];
    if (!item) return;
    setActivePlaylist(tour);
    setPlaylistIndex(index);
    tourTargetRef.current = `${item.title}::${item.artist}`;
    generateGuide(item.title, item.artist);
  };

  const exitTour = () => {
    cancelTourAdvance();
    tourTargetRef.current = null;
    setActivePlaylist(null);
    setPlaylistIndex(0);
  };

  useEffect(() => cancelTourAdvance, []);

  useEffect(() => {
    updateScrollHint();
  }, [segments, activeSegmentIndex, explanationMode]);

  const updateScrollHint = () => {
    const el = guideBoxRef.current;
    if (!el) return;
    setShowScrollHint(el.scrollHeight - el.scrollTop - el.clientHeight > 24);
  };

  const handleGuidePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Touch and pens already scroll natively; only the mouse needs help.
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const el = guideBoxRef.current;
    if (!el || el.scrollHeight <= el.clientHeight) return;
    guideDragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startTop: el.scrollTop,
      mode: 'undecided',
    };
  };

  const handleGuidePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = guideDragRef.current;
    const el = guideBoxRef.current;
    if (!drag || !el || e.pointerId !== drag.pointerId) return;

    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;

    if (drag.mode === 'undecided') {
      // Below the threshold the gesture is still a plain click.
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      // Vertical drags scroll; sideways drags are left to the browser as a selection.
      drag.mode = Math.abs(dy) > Math.abs(dx) ? 'scroll' : 'select';
      if (drag.mode === 'scroll') {
        el.setPointerCapture(drag.pointerId);
        setIsDraggingGuide(true);
      }
    }

    if (drag.mode !== 'scroll') return;

    window.getSelection()?.removeAllRanges();
    el.scrollTop = drag.startTop - dy;
  };

  const endGuideDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = guideDragRef.current;
    const el = guideBoxRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (drag.mode === 'scroll' && el?.hasPointerCapture(drag.pointerId)) {
      el.releasePointerCapture(drag.pointerId);
    }
    guideDragRef.current = null;
    setIsDraggingGuide(false);
  };

  const speakSegment = (index: number) => {
    if (!speechSupported || index < 0 || index >= speakableSegments.length) {
      return;
    }

    const rawText = speakableSegments[index];
    const cleanText = rawText
      .replace(/#+\s+/g, '') // Remove headers
      .replace(/[*_`~>]/g, '') // Remove formatting symbols
      .replace(/[-\d]+\.\s+/g, '') // Remove list items numbering
      .replace(/\[.*?\]\(.*?\)/g, '') // Remove links
      .replace(/\[.*?\]/g, '') // Remove stray bracket syntax
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/<.*?>/g, '') // Cleanse raw HTML tags
      .replace(/\n+/g, ' ')
      .trim();

    if (!cleanText) {
      setTimeout(() => {
        if (isPlayingRef.current && activeIndexRef.current === index) {
          setActiveSegmentIndex(prev => prev + 1);
        }
      }, 50);
      return;
    }

    AudioController.speak(
      index,
      cleanText,
      speedRef.current,
      () => {
        // Voice started callback if needed
      },
      () => {
        if (isPlayingRef.current && activeIndexRef.current === index) {
          setActiveSegmentIndex(prev => prev + 1);
        }
      },
      (err) => {
        if (isPlayingRef.current && activeIndexRef.current === index) {
          setActiveSegmentIndex(prev => prev + 1);
        }
      }
    );
  };

  // Start the generative score that matches the artwork
  const startAmbientSound = (artworkTitle: string, spec?: MusicSpec | null) => {
    try {
      const resolvedSpec =
        spec ?? musicSpecRef.current ?? guessMusicSpec(`${artworkTitle} ${artist}`);

      if (!ambientPlayerRef.current) {
        ambientPlayerRef.current = new AmbientPlayer();
      }

      if (!ambientPlayerRef.current.start(resolvedSpec)) return;

      musicSpecRef.current = resolvedSpec;
      setAmbientName(describeMusicSpec(resolvedSpec));
      // The pad can start while narration is already speaking
      ambientPlayerRef.current.setDucked(isPlayingRef.current);
    } catch (err) {
      console.warn('Web Audio Ambient error:', err);
    }
  };

  // Stop Ambient Soundscape
  const stopAmbientSound = () => {
    ambientPlayerRef.current?.stop();
    setAmbientName(null);
  };

  const fetchServerSuggestions = async (query: string, artistName: string): Promise<ArtworkSuggestion[]> => {
    try {
      const res = await fetch('/api/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artworkQuery: query, artistName })
      });
      const data = await res.json();
      if (data.suggestions && Array.isArray(data.suggestions)) {
        return data.suggestions.map((item: { title: string; artist?: string; source?: string }) => ({
          title: item.title,
          artist: item.artist || artistName || '',
          isAi: item.source === 'ai',
          isInstant: item.source === 'guide'
        }));
      }
    } catch (e) {
      console.error('Failed to fetch AI suggestions:', e);
    }
    return [];
  };

  // Debounce Autocomplete Artwork with AI Intellisense Suggestions
  useEffect(() => {
    if (!artwork.trim()) {
      setArtworkSuggestions([]);
      return;
    }

    const handler = setTimeout(async () => {
      const cacheKey = `${artwork.trim().toLowerCase()}::${artist.trim().toLowerCase()}`;
      if (suggestCache[cacheKey]) {
        setArtworkSuggestions(suggestCache[cacheKey]);
        return;
      }

      // Local preset Filter
      const localMatches = PRESET_ARTWORKS.filter(item =>
        item.title.toLowerCase().includes(artwork.toLowerCase())
      ).map(item => ({ ...item, isAi: false }));

      // Wikipedia API Search
      let apiSuggestions: ArtworkSuggestion[] = [];
      try {
        const url = `https://ja.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(artwork)}&limit=4&namespace=0&format=json&origin=*`;
        const res = await fetch(url);
        const data = await res.json();
        const apiTitles: string[] = data[1] || [];

        apiSuggestions = apiTitles
          .filter(title => !localMatches.some(m => m.title === title))
          .map(title => ({ title, artist: artist || '', isAi: false }));
      } catch (error) {
        console.error('Artwork suggest error:', error);
      }

      // Archive hits, then the Supabase catalogue, then invented titles
      let serverSuggestions: ArtworkSuggestion[] = [];
      if (artwork.trim().length >= 1) {
        serverSuggestions = await fetchServerSuggestions(artwork, artist);
      }

      const merged = [...serverSuggestions, ...localMatches, ...apiSuggestions];

      // De-duplicate based on title, keeping the most trustworthy entry
      const uniqueMap = new Map<string, ArtworkSuggestion>();
      merged.forEach(item => {
        const key = item.title.trim().toLowerCase();
        const kept = uniqueMap.get(key);
        if (!kept) {
          uniqueMap.set(key, item);
        } else if (item.isInstant && !kept.isInstant) {
          uniqueMap.set(key, item);
        }
      });
      const finalSuggestions = Array.from(uniqueMap.values());

      setArtworkSuggestions(finalSuggestions);
      setSuggestCache(prev => ({ ...prev, [cacheKey]: finalSuggestions }));
    }, 450); // 450ms debounce

    return () => clearTimeout(handler);
  }, [artwork, artist]);

  // Debounce Autocomplete Artist
  useEffect(() => {
    if (!artist.trim()) {
      setArtistSuggestions([]);
      return;
    }

    const handler = setTimeout(async () => {
      // Local Filter
      const localMatches = PRESET_ARTISTS.filter(name =>
        name.toLowerCase().includes(artist.toLowerCase())
      );

      // Wikipedia API Search
      try {
        const url = `https://ja.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(artist)}&limit=6&namespace=0&format=json&origin=*`;
        const res = await fetch(url);
        const data = await res.json();
        const apiTitles: string[] = data[1] || [];

        const merged = Array.from(new Set([...localMatches, ...apiTitles]));
        setArtistSuggestions(merged);
      } catch (error) {
        console.error('Artist suggest error:', error);
        setArtistSuggestions(localMatches);
      }
    }, 300);

    return () => clearTimeout(handler);
  }, [artist]);

  // Keyboard navigation for Artwork input
  const handleArtworkKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, onSubmitted?: () => void) => {
    if (!showArtworkSuggestions || artworkSuggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedArtworkIndex(prev =>
        prev < artworkSuggestions.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedArtworkIndex(prev =>
        prev > 0 ? prev - 1 : artworkSuggestions.length - 1
      );
    } else if (e.key === 'Enter') {
      if (focusedArtworkIndex >= 0 && focusedArtworkIndex < artworkSuggestions.length) {
        e.preventDefault();
        selectArtworkSuggestion(artworkSuggestions[focusedArtworkIndex], onSubmitted);
      }
    } else if (e.key === 'Escape') {
      setShowArtworkSuggestions(false);
    }
  };

  // Keyboard navigation for Artist input
  const handleArtistKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showArtistSuggestions || artistSuggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedArtistIndex(prev =>
        prev < artistSuggestions.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedArtistIndex(prev =>
        prev > 0 ? prev - 1 : artistSuggestions.length - 1
      );
    } else if (e.key === 'Enter') {
      if (focusedArtistIndex >= 0 && focusedArtistIndex < artistSuggestions.length) {
        e.preventDefault();
        selectArtistSuggestion(artistSuggestions[focusedArtistIndex]);
      }
    } else if (e.key === 'Escape') {
      setShowArtistSuggestions(false);
    }
  };

  const selectArtworkSuggestion = (suggestion: ArtworkSuggestion, onSubmitted?: () => void) => {
    setArtwork(suggestion.title);
    localStorage.setItem('art_free_guide_draft_artwork', suggestion.title);
    let targetArtist = artist;
    if (suggestion.artist) {
      targetArtist = suggestion.artist;
      setArtist(suggestion.artist);
      localStorage.setItem('art_free_guide_draft_artist', suggestion.artist);
    }
    setShowArtworkSuggestions(false);
    setFocusedArtworkIndex(-1);
    
    // Auto transition to guide generation on select!
    generateGuide(suggestion.title, targetArtist);
    onSubmitted?.();
  };

  const selectArtistSuggestion = (name: string) => {
    setArtist(name);
    localStorage.setItem('art_free_guide_draft_artist', name);
    setShowArtistSuggestions(false);
    setFocusedArtistIndex(-1);
  };

  /** `pinnedUrl` is used for artworks with curated hotspots, whose coordinates only fit one specific reproduction. */
  const fetchImage = async (query: string, cacheKey?: string, pinnedUrl?: string | null) => {
    setImageLoading(true);
    setImageError(false);
    setImageUrl(null);
    setSearchQuery(query);

    try {
      const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&prop=imageinfo&iiprop=url&iiurlwidth=800&format=json&origin=*`;
      const data = pinnedUrl ? null : await (await fetch(url)).json();

      let thumbUrl: string | null = pinnedUrl ?? null;
      if (!thumbUrl && data?.query?.pages) {
        const pages = data.query.pages;
        const pageKeys = Object.keys(pages);
        if (pageKeys.length > 0) {
          const page = pages[pageKeys[0]];
          if (page.imageinfo && page.imageinfo.length > 0) {
            const imgInfo = page.imageinfo[0];
            thumbUrl = imgInfo.thumburl || imgInfo.url;
          }
        }
      }

      if (thumbUrl) {
        setImageUrl(thumbUrl);
        if (cacheKey) {
          setGuideCache(prev => {
            if (prev[cacheKey]) {
              return {
                ...prev,
                [cacheKey]: { ...prev[cacheKey], imageUrl: thumbUrl, imageError: false }
              };
            }
            return prev;
          });
          const parts = cacheKey.split('::');
          if (parts.length === 2) {
            updateHistoryEntryByArtwork(parts[0], parts[1], { imageUrl: thumbUrl, imageError: false });
          }
        }
      } else {
        setImageError(true);
        if (cacheKey) {
          setGuideCache(prev => {
            if (prev[cacheKey]) {
              return {
                ...prev,
                [cacheKey]: { ...prev[cacheKey], imageError: true }
              };
            }
            return prev;
          });
          const parts = cacheKey.split('::');
          if (parts.length === 2) {
            updateHistoryEntryByArtwork(parts[0], parts[1], { imageError: true });
          }
        }
      }
    } catch (error) {
      console.error('Wikimedia fetch error:', error);
      setImageError(true);
      if (cacheKey) {
        setGuideCache(prev => {
          if (prev[cacheKey]) {
            return {
              ...prev,
              [cacheKey]: { ...prev[cacheKey], imageError: true }
            };
          }
          return prev;
        });
        const parts = cacheKey.split('::');
        if (parts.length === 2) {
          updateHistoryEntryByArtwork(parts[0], parts[1], { imageError: true });
        }
      }
    } finally {
      setImageLoading(false);
    }
  };

  const fetchRecommendationImages = async (recs: Recommendation[], targetArtwork: string, targetArtist: string) => {
    recs.forEach(async (rec, index) => {
      const query = `${rec.title} ${rec.artist}`.trim();
      try {
        const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&prop=imageinfo&iiprop=url&iiurlwidth=300&format=json&origin=*`;
        const res = await fetch(url);
        const data = await res.json();

        let imgUrl: string | null = null;
        if (data.query && data.query.pages) {
          const pages = data.query.pages;
          const pageKeys = Object.keys(pages);
          if (pageKeys.length > 0) {
            const page = pages[pageKeys[0]];
            if (page.imageinfo && page.imageinfo.length > 0) {
              imgUrl = page.imageinfo[0].thumburl || page.imageinfo[0].url;
            }
          }
        }

        setRecommendations(prev => {
          const copy = [...prev];
          if (copy[index]) {
            copy[index] = { ...copy[index], imageUrl: imgUrl, imageLoading: false };
          }
          updateHistoryEntryByArtwork(targetArtwork, targetArtist, { recommendations: copy });
          return copy;
        });
      } catch (error) {
        console.error('Error fetching rec image:', error);
        setRecommendations(prev => {
          const copy = [...prev];
          if (copy[index]) {
            copy[index] = { ...copy[index], imageUrl: null, imageLoading: false };
          }
          updateHistoryEntryByArtwork(targetArtwork, targetArtist, { recommendations: copy });
          return copy;
        });
      }
    });
  };

  const generateGuide = async (
    customArtwork?: string,
    customArtist?: string,
    customMode?: 'short' | 'standard' | 'deep',
    /** Skip both caches and overwrite the archive, after a visitor reported a problem. */
    refresh = false
  ) => {
    const targetArtwork = customArtwork ?? artwork;
    const targetArtist = customArtist ?? artist;

    if (!targetArtwork.trim()) return;

    // Any artwork the tour did not ask for means the visitor stepped off the tour.
    if (tourTargetRef.current && tourTargetRef.current !== `${targetArtwork}::${targetArtist}`) {
      exitTour();
    } else {
      cancelTourAdvance();
    }

    if (customArtwork) {
      setArtwork(customArtwork);
      localStorage.setItem('art_free_guide_draft_artwork', customArtwork);
    }
    if (customArtist !== undefined) {
      setArtist(customArtist);
      localStorage.setItem('art_free_guide_draft_artist', customArtist);
    }

    // Audio Unlock: Trigger dummy utterance and initialize/resume AudioContext on user gesture
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        const dummy = new SpeechSynthesisUtterance('');
        dummy.volume = 0;
        window.speechSynthesis.speak(dummy);
      } catch (e) {
        console.warn('Speech unlock failed:', e);
      }
    }

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        const tempCtx = new AudioContextClass();
        if (tempCtx.state === 'suspended') {
          tempCtx.resume();
        }
      }
    } catch (e) {
      console.warn('Web Audio unlock failed:', e);
    }

    if (speechSupported) {
      AudioController.clearQueue();
      setIsPlaying(false);
      stopAmbientSound();
    }

    // Determine target mode (URL parameters prioritize custom mode)
    let targetMode: 'short' | 'standard' | 'deep' = 'short';
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const modeParam = params.get('mode') || '';
      if (['short', 'standard', 'deep'].includes(modeParam)) {
        targetMode = modeParam as 'short' | 'standard' | 'deep';
      }
    }
    if (customMode) {
      targetMode = customMode;
    }

    const cacheKey = `${targetArtwork.trim().toLowerCase()}::${targetArtist.trim().toLowerCase()}`;
    const hotspotFile = findHotspotSet(targetArtwork, targetArtist)?.file ?? null;

    // CHECK CLIENT-SIDE CACHE
    if (guideCache[cacheKey] && !refresh) {
      const cached = guideCache[cacheKey];
      setResponseShort(sanitizeGuideText(cached.short));
      setResponseStandard(sanitizeGuideText(cached.standard));
      setResponseDeep(sanitizeGuideText(cached.deep));
      setExplanationMode(targetMode);
      setImageUrl(cached.imageUrl);
      setImageError(cached.imageError);
      setSearchQuery(cached.searchQuery);
      setRecommendations(cached.recommendations);

      const cachedSpec = resolveMusicSpec(cached.music, cached.mood, `${targetArtwork} ${targetArtist}`);
      musicSpecRef.current = cachedSpec;

      // Auto play on cached guide load
      setActiveSegmentIndex(0);
      setIsPlaying(true);
      startAmbientSound(targetArtwork, cachedSpec);

      // Synced Navigation State in History
      const idx = history.findIndex(
        h => h.title.trim().toLowerCase() === targetArtwork.trim().toLowerCase() &&
             (h.artist || '').trim().toLowerCase() === (targetArtist || '').trim().toLowerCase()
      );
      if (idx !== -1) {
        setHistoryIndex(idx);
        localStorage.setItem('art_free_guide_history_index', String(idx));
      }

      setShowInputDrawer(false);
      return;
    }

    setLoading(true);
    setResponseShort('');
    setResponseStandard('');
    setResponseDeep('');
    setExplanationMode(targetMode);
    setActiveSegmentIndex(-1);
    setImageUrl(null);
    setImageError(false);
    setRecommendations([]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // title / artist let the server reuse a guide generated for an earlier visitor.
          title: targetArtwork,
          artist: targetArtist,
          refresh,
          messages: [
            {
              role: 'user',
              content: `作品名: ${targetArtwork}${targetArtist ? `, 作者: ${targetArtist}` : ''}。この作品について詳しく解説してください。`
            }
          ]
        }),
      });

      const data = await res.json();

      // Graceful Japanese Error Handling for rate limits (429) & server faults
      if (data.error) {
        if (data.error.includes('Too Many Requests') || data.error.includes('429') || data.error.includes('Quota')) {
          setResponseShort('現在、大変混雑しているため音声ガイドを生成できません。しばらく時間をおいてから再度お試しください。');
          setResponseStandard('');
          setResponseDeep('');
        } else {
          setResponseShort('現在、音声ガイドサービスをご利用いただけません。しばらく時間をおいてから再度お試しください。');
          setResponseStandard('');
          setResponseDeep('');
        }
      } else {
        let rawExplanation = data.text;
        let queryForImage = `${targetArtwork} ${targetArtist}`.trim();
        let recs: Recommendation[] = [];
        let shortText = '';
        let standardText = '';
        let deepText = '';
        let music: unknown = null;

        try {
          let jsonString = data.text.trim();
          const firstBrace = jsonString.indexOf('{');
          const lastBrace = jsonString.lastIndexOf('}');
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            jsonString = jsonString.substring(firstBrace, lastBrace + 1);
          }
          const parsed = JSON.parse(jsonString);
          shortText = parsed.short || '';
          standardText = parsed.standard || '';
          deepText = parsed.deep || '';
          if (parsed.searchQuery) {
            queryForImage = parsed.searchQuery;
          }
          if (parsed.music && typeof parsed.music === 'object') {
            music = parsed.music;
          }
          if (parsed.recommendations && Array.isArray(parsed.recommendations)) {
            recs = parsed.recommendations.map((r: any) => ({
              title: r.title,
              artist: r.artist,
              reason: r.reason,
              imageUrl: null,
              imageLoading: true
            }));
          }
        } catch (jsonError) {
          console.warn("API response parsing fallback:", jsonError);
          // Regex extraction fallback if JSON parsing fails directly
          const matchShort = data.text.match(/"short"\s*:\s*"([\s\S]*?)"\s*,\s*"standard"/);
          const matchStandard = data.text.match(/"standard"\s*:\s*"([\s\S]*?)"\s*,\s*"deep"/);
          const matchDeep = data.text.match(/"deep"\s*:\s*"([\s\S]*?)"\s*,\s*"searchQuery"/);
          if (matchShort && matchShort[1]) {
            shortText = matchShort[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
          }
          if (matchStandard && matchStandard[1]) {
            standardText = matchStandard[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
          }
          if (matchDeep && matchDeep[1]) {
            deepText = matchDeep[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
          }
          
          if (!shortText) {
            if (data.text.trim().startsWith('{')) {
              shortText = "音声ガイドの解析中にエラーが発生しました。もう一度生成をお試しください。";
            } else {
              shortText = data.text;
            }
          }
        }

        shortText = sanitizeGuideText(shortText);
        standardText = sanitizeGuideText(standardText);
        deepText = sanitizeGuideText(deepText);

        const resolvedSpec = resolveMusicSpec(music, null, `${targetArtwork} ${targetArtist}`);
        musicSpecRef.current = resolvedSpec;

        setResponseShort(shortText);
        setResponseStandard(standardText);
        setResponseDeep(deepText);
        setExplanationMode(targetMode);

        // Store primary metadata in cache
        const newEntry: GuideCacheEntry = {
          short: shortText,
          standard: standardText,
          deep: deepText,
          imageUrl: null,
          imageError: false,
          searchQuery: queryForImage,
          recommendations: recs,
          music: resolvedSpec
        };
        
        setGuideCache(prev => ({ ...prev, [cacheKey]: newEntry }));

        // Append to/update History
        const newHistoryEntry: HistoryEntry = {
          title: targetArtwork,
          artist: targetArtist,
          short: shortText,
          standard: standardText,
          deep: deepText,
          imageUrl: null, // updated when fetchImage completes
          imageError: false,
          searchQuery: queryForImage,
          recommendations: recs,
          timestamp: new Date().toISOString(),
          music: resolvedSpec
        };

        const existingIndex = history.findIndex(
          h => h.title.trim().toLowerCase() === targetArtwork.trim().toLowerCase() &&
               (h.artist || '').trim().toLowerCase() === (targetArtist || '').trim().toLowerCase()
        );

        if (existingIndex !== -1) {
          setHistory(prev => {
            const copy = [...prev];
            copy[existingIndex] = { ...newHistoryEntry, imageUrl: prev[existingIndex].imageUrl }; // retain cached image
            localStorage.setItem('art_free_guide_history', JSON.stringify(copy));
            localStorage.setItem('art_free_guide_history_index', String(existingIndex));
            return copy;
          });
          setHistoryIndex(existingIndex);
        } else {
          setHistory(prev => {
            const updated = [...prev, newHistoryEntry];
            localStorage.setItem('art_free_guide_history', JSON.stringify(updated));
            localStorage.setItem('art_free_guide_history_index', String(updated.length - 1));
            setHistoryIndex(updated.length - 1);
            return updated;
          });
        }

        // Start progressive loading
        fetchImage(
          queryForImage,
          cacheKey,
          hotspotFile ? hotspotImageUrl(hotspotFile) : null
        );
        startAmbientSound(targetArtwork, resolvedSpec);

        if (recs.length > 0) {
          setRecommendations(recs);
          fetchRecommendationImages(recs, targetArtwork, targetArtist);
        }

        // Close input drawer
        setShowInputDrawer(false);

        // Auto play on generation completion
        setActiveSegmentIndex(0);
        setIsPlaying(true);
      }
    } catch (e: any) {
      console.error(e);
      const errMsg = e.message || '';
      if (errMsg.includes('429') || errMsg.includes('Too Many Requests')) {
        setResponseShort('現在、大変混雑しているため音声ガイドを生成できません。しばらく時間をおいてから再度お試しください。');
        setResponseStandard('');
        setResponseDeep('');
      } else {
        setResponseShort('現在、混雑のため音声ガイドを生成できません。しばらく時間をおいてから再度お試しください。');
        setResponseStandard('');
        setResponseDeep('');
      }
    } finally {
      setLoading(false);
    }
  };

  // Deep Dive Feature
  const handleDeepDive = async () => {
    if (!artwork.trim() || deepDiveLoading) return;

    setDeepDiveLoading(true);
    // Temporarily pause guide
    setIsPlaying(false);
    AudioController.clearQueue();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: `作品名: ${artwork}について、ガイドブックにも載っていないような知られざる面白い裏話や、美術史における深掘りエピソードを音声ガイド用に語ってください。短い2-3つの文で詳しく解説します。`
            }
          ]
        })
      });
      const data = await res.json();
      
      if (data.error) {
        console.warn('Deep dive rate limit/error:', data.error);
        return;
      }

      let rawText = data.text;
      try {
        let jsonString = data.text.trim();
        const firstBrace = jsonString.indexOf('{');
        const lastBrace = jsonString.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          jsonString = jsonString.substring(firstBrace, lastBrace + 1);
        }
        const parsed = JSON.parse(jsonString);
        rawText = parsed.explanation || data.text;
      } catch (e) {}

      const visualHeader = `\n> 🔍 **ディープな深掘りエピソードへようこそ**\n`;
      const updatedDeep = `${responseDeep}\n\n${visualHeader}\n\n${rawText}`;
      
      setResponseDeep(updatedDeep);
      setExplanationMode('deep');

      // Update History Entry
      updateHistoryEntryByArtwork(artwork, artist, { deep: updatedDeep });

      // Play newly appended segments
      const prevLength = speakableSegments.length;
      setTimeout(() => {
        setActiveSegmentIndex(prevLength);
        setIsPlaying(true);
      }, 100);

    } catch (e) {
      console.error(e);
    } finally {
      setDeepDiveLoading(false);
    }
  };

  // Interactive question mode (voice input)
  const startListening = () => {
    if (!recognition) return;
    setIsListening(true);
    setVoiceText('');
    
    // Pause BGM & Guide Synthesis
    setIsPlaying(false);
    AudioController.clearQueue();
    stopAmbientSound();

    recognition.start();

    recognition.onresult = (event: any) => {
      const resultText = event.results[0][0].transcript;
      setVoiceText(resultText);
      setIsListening(false);
      askQuestion(resultText);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };
  };

  /**
   * A question is answered by the same curator voice and appended to the guide,
   * so the answer is narrated in place instead of opening a separate chat.
   */
  const askQuestion = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || !artwork.trim() || askLoading) return;

    setAskLoading(true);
    setVoiceText(trimmed);
    setQuestionInput('');
    setIsPlaying(false);
    AudioController.clearQueue();

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: artwork,
          artist,
          question: trimmed,
          context: responseStandard || responseShort
        })
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        triggerToast('回答を生成できませんでした。少し時間をおいてお試しください');
        return;
      }

      const answer = sanitizeGuideText(data.answer || '');
      if (!answer) {
        triggerToast('回答を生成できませんでした。少し時間をおいてお試しください');
        return;
      }

      const header = `\n> ❓ **${trimmed}**\n`;
      const updatedDeep = `${responseDeep}\n\n${header}\n\n${answer}`;

      setResponseDeep(updatedDeep);
      setExplanationMode('deep');
      updateHistoryEntryByArtwork(artwork, artist, { deep: updatedDeep });

      // Narrate the answer straight away, from where it was appended.
      const prevLength = speakableSegments.length;
      setTimeout(() => {
        setActiveSegmentIndex(prevLength);
        setIsPlaying(true);
      }, 100);
    } catch (e) {
      console.error(e);
      triggerToast('回答を生成できませんでした。少し時間をおいてお試しください');
    } finally {
      setAskLoading(false);
    }
  };

  const sendFeedback = async (
    kind: 'good' | 'bad' | 'bug',
    comment = ''
  ) => {
    if (!artwork.trim()) return;
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: artwork,
          artist,
          kind,
          comment,
          excerpt: (responseStandard || responseShort || '').slice(0, 500),
          userId
        })
      });
    } catch (e) {
      // Feedback must never interrupt the visit.
      console.warn('Feedback submission failed:', e);
    }
  };

  /**
   * Tapping is meant to feel free, so each tap animates immediately and the
   * taps are batched into a single request once the burst stops.
   */
  const sendHeart = () => {
    const id = heartIdRef.current++;
    setHearts(prev => [
      ...prev,
      { id, drift: Math.round((Math.random() - 0.5) * 60), scale: 0.9 + Math.random() * 0.6 }
    ]);
    setTimeout(() => setHearts(prev => prev.filter(h => h.id !== id)), 1700);

    setHeartCount(prev => prev + 1);
    heartBurstRef.current += 1;

    if (heartSendTimerRef.current) {
      clearTimeout(heartSendTimerRef.current);
    }
    heartSendTimerRef.current = setTimeout(() => {
      const count = heartBurstRef.current;
      heartBurstRef.current = 0;
      sendFeedback('good', `hearts:${count}`);
    }, 1200);
  };

  const handleRegenerateGuide = async () => {
    if (regenerating) return;
    setRegenerating(true);
    setShowReportForm(false);
    triggerToast('解説を作り直しています…');
    try {
      await generateGuide(artwork, artist, 'short', true);
    } finally {
      setRegenerating(false);
    }
  };

  // Playback Control Handlers
  const handlePlayPause = () => {
    console.log('[AUDIO] Button Clicked');
    setHasPlayedOnce(true);
    
    // 1. Force unlock on user gesture
    AudioController.forceUnlock();

    // 2. Play Web Audio ambient context if needed
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        const tempCtx = new AudioContextClass();
        if (tempCtx.state === 'suspended') {
          tempCtx.resume();
        }
      }
    } catch (e) {}

    if (!speechSupported || speakableSegments.length === 0) return;

    if (isPlaying) {
      setIsPlaying(false);
      AudioController.clearQueue();
      stopAmbientSound();
    } else {
      if (activeSegmentIndex === -1 || activeSegmentIndex >= speakableSegments.length) {
        setActiveSegmentIndex(0);
      }
      setIsPlaying(true);
      if (artwork) startAmbientSound(artwork);
    }
  };

  const handleSkipForward = () => {
    if (activeSegmentIndex < speakableSegments.length - 1) {
      setActiveSegmentIndex(prev => prev + 1);
    }
  };

  const handleSkipBackward = () => {
    if (activeSegmentIndex > 0) {
      setActiveSegmentIndex(prev => prev - 1);
    }
  };

  // Web Share API with Clipboard Fallback
  const handleShare = async () => {
    if (typeof window === 'undefined') return;

    // Construct the complete URL containing all active states
    const url = new URL(window.location.href);
    url.searchParams.set('artwork', artwork);
    if (artist) {
      url.searchParams.set('artist', artist);
    } else {
      url.searchParams.delete('artist');
    }
    url.searchParams.set('speed', playbackSpeed.toFixed(1));
    url.searchParams.set('mode', explanationMode);
    if (activePlaylist) {
      url.searchParams.set('tour', activePlaylist.id);
    } else {
      url.searchParams.delete('tour');
    }
    // Share the detail being looked at, so the link opens on the same close-up.
    if (activeHotspot) {
      url.searchParams.set('spot', activeHotspot.id);
    } else {
      url.searchParams.delete('spot');
    }

    const shareData = {
      title: `ArtFreeGuide - ${artwork}`,
      text: activeHotspot
        ? `「${artwork}」の見どころ「${activeHotspot.label}」を聴いてみて！`
        : `この作品のAI音声ガイドを聴いてみて！`,
      url: url.toString()
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        triggerToast('共有メニューを起動しました');
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.warn('Native share failed:', err);
          copyToClipboard(url.toString());
        }
      }
    } else {
      copyToClipboard(url.toString());
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        triggerToast('共有URLをクリップボードにコピーしました！');
      })
      .catch(err => {
        console.error('Failed to copy share link:', err);
        triggerToast('コピーに失敗しました');
      });
  };

  const renderHighlightedText = (text: string, query: string) => {
    if (!query) return <span>{text}</span>;
    const parts = text.split(new RegExp(`(${query.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')})`, 'gi'));
    return (
      <span>
        {parts.map((part, index) =>
          part.toLowerCase() === query.toLowerCase() ? (
            <span key={index} className="font-bold text-teal-400">
              {part}
            </span>
          ) : (
            part
          )
        )}
      </span>
    );
  };

  /**
   * The one place to pick what to listen to next. The landing page and the
   * "さがす" drawer render the same hub, so a tour is always one tap away.
   * @param onPick runs after a choice is made, so the drawer can close itself.
   */
  const renderBrowseHub = (onPick?: () => void) => {
    const pick = (run: () => void) => () => {
      run();
      onPick?.();
    };

    const pick2 = (run: (title: string, artist: string) => void) => (title: string, artist: string) => {
      run(title, artist);
      onPick?.();
    };

    return (
      <div className="w-full space-y-8 select-none">
        {activePlaylist && (
          <div className="flex items-center justify-between gap-2 bg-slate-900/60 border border-teal-900/60 rounded-2xl px-4 py-2.5 font-sans">
            <span className="text-xs font-bold text-teal-400 truncate">
              ツアー中: {activePlaylist.emoji} {activePlaylist.title}
              <span className="text-slate-500 font-mono ml-2">
                {playlistIndex + 1}/{activePlaylist.items.length}
              </span>
            </span>
            <button
              onClick={pick(exitTour)}
              className="shrink-0 text-[11px] text-slate-400 hover:text-rose-300 underline underline-offset-2"
            >
              終了する
            </button>
          </div>
        )}

        {tasteRecommendations.length > 0 && (
          <ForYouShelf
            items={tasteRecommendations}
            basis={tasteBasis}
            viewCount={tasteProfile?.viewCount ?? 0}
            favoriteTags={tasteProfile?.favoriteTags ?? []}
            onPick={pick2((title, artistName) => generateGuide(title, artistName))}
          />
        )}

        {/* Tours come first: the lowest-friction, most memorable way in */}
        <div className="w-full space-y-3">
          <p className="text-xs font-bold text-slate-500 tracking-wider uppercase font-sans text-center">
            テーマで巡るツアー
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {PLAYLISTS.map(tour => (
              <button
                key={tour.id}
                onClick={pick(() => startTour(tour))}
                className="bg-slate-900/40 border border-slate-800 hover:border-teal-500/40 hover:bg-slate-900/70 rounded-2xl px-4 py-3 text-left active:scale-95 transition-all shadow-md font-sans group"
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl shrink-0">{tour.emoji}</span>
                  <div className="min-w-0">
                    <span className="block text-sm font-bold text-slate-100 truncate group-hover:text-teal-400 transition-colors">
                      {tour.title}
                    </span>
                    <span className="block text-[11px] text-slate-500 truncate">{tour.subtitle}</span>
                    <span className="block text-[10px] text-teal-500/80 mt-1">全{tour.items.length}作品・自動で次へ</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* One-tap start: no typing needed to hear a guide */}
        <div className="w-full space-y-3">
          <p className="text-xs font-bold text-slate-500 tracking-wider uppercase font-sans text-center">
            1作品だけ聴く
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {QUICK_START_ARTWORKS.map(item => (
              <button
                key={item.title}
                onClick={pick(() => {
                  exitTour();
                  setArtwork(item.title);
                  setArtist(item.artist);
                  generateGuide(item.title, item.artist);
                })}
                className="bg-slate-900/40 border border-slate-800 hover:border-teal-500/40 hover:bg-slate-900/70 rounded-2xl px-3 py-3 text-left active:scale-95 transition-all shadow-md font-sans group"
              >
                <span className="text-xl block mb-1">{item.emoji}</span>
                <span className="block text-xs font-bold text-slate-200 truncate group-hover:text-teal-400 transition-colors">
                  {item.title}
                </span>
                <span className="block text-[10px] text-slate-500 truncate">{item.artist}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="w-full space-y-3">
          <p className="text-xs font-bold text-slate-500 tracking-wider uppercase font-sans text-center">
            名前で探す
          </p>
          <div className="w-full bg-slate-900/40 border border-slate-800/80 rounded-3xl p-5 md:p-6 shadow-xl relative">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-teal-500 via-emerald-500 to-blue-500 opacity-60 rounded-t-3xl"></div>
            {renderInputForm(onPick)}
          </div>
        </div>

        <div className="flex justify-center">
          <button
            onClick={pick(() => setShowHistorySidebar(true))}
            className="bg-slate-900/60 border border-slate-800 hover:bg-slate-900 hover:border-teal-500/40 text-slate-350 hover:text-teal-400 px-4 py-2 rounded-xl text-xs font-bold active:scale-95 transition-all flex items-center gap-1.5 shadow-md font-sans"
          >
            <span>📜</span>
            <span>閲覧履歴を見る ({history.length})</span>
          </button>
        </div>
      </div>
    );
  };

  const renderInputForm = (onSubmitted?: () => void) => {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-sans">
          {/* Artwork Input with Autocomplete */}
          <div className="relative space-y-2">
            <label htmlFor="artwork" className="text-sm font-medium text-slate-400 block text-left select-none">作品名 <span className="text-rose-500">*</span></label>
            <input
              id="artwork"
              type="text"
              placeholder="例: ひまわり、モナ・リザ"
              value={artwork}
              onChange={(e) => {
                setArtwork(e.target.value);
                localStorage.setItem('art_free_guide_draft_artwork', e.target.value);
                setShowArtworkSuggestions(true);
                setFocusedArtworkIndex(-1);
              }}
              onKeyDown={e => handleArtworkKeyDown(e, onSubmitted)}
              onFocus={() => setShowArtworkSuggestions(true)}
              onBlur={() => setTimeout(() => setShowArtworkSuggestions(false), 200)}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-3.5 text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 transition-all font-medium text-sm"
              autoComplete="off"
            />
            {showArtworkSuggestions && artworkSuggestions.length > 0 && (
              <ul className="absolute z-50 w-full mt-1 bg-slate-950/95 border border-slate-850 rounded-xl overflow-hidden shadow-2xl backdrop-blur-xl max-h-48 overflow-y-auto scroll-area divide-y divide-slate-800/40">
                {artworkSuggestions.map((suggestion, index) => (
                  <li
                    key={index}
                    onMouseDown={() => selectArtworkSuggestion(suggestion, onSubmitted)}
                    className={`px-4 py-3.5 cursor-pointer text-sm transition-all flex items-center justify-between font-sans ${
                      focusedArtworkIndex === index
                        ? 'bg-teal-500/10 text-teal-400 font-bold'
                        : 'hover:bg-slate-900/80 text-slate-300'
                    }`}
                  >
                    <div className="text-left flex items-center gap-2">
                      {suggestion.isInstant && (
                        <span className="text-[9px] bg-teal-500/10 border border-teal-500/20 text-teal-400 px-1.5 py-0.5 rounded font-black shrink-0 uppercase tracking-wider">
                          すぐ聴ける
                        </span>
                      )}
                      {suggestion.isAi && (
                        <span className="text-[9px] bg-amber-500/10 border border-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-black shrink-0 uppercase tracking-wider">
                          もしかして
                        </span>
                      )}
                      <div>
                        {renderHighlightedText(suggestion.title, artwork)}
                        {suggestion.artist && (
                          <span className="text-xs text-slate-500 ml-2 block sm:inline">
                            by {suggestion.artist}
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Artist Input with Autocomplete */}
          <div className="relative space-y-2">
            <label htmlFor="artist" className="text-sm font-medium text-slate-400 block text-left select-none">作者名</label>
            <input
              id="artist"
              type="text"
              placeholder="例: ゴッホ、ダ・ヴィンチ"
              value={artist}
              onChange={(e) => {
                setArtist(e.target.value);
                localStorage.setItem('art_free_guide_draft_artist', e.target.value);
                setShowArtistSuggestions(true);
                setFocusedArtistIndex(-1);
              }}
              onKeyDown={handleArtistKeyDown}
              onFocus={() => setShowArtistSuggestions(true)}
              onBlur={() => setTimeout(() => setShowArtistSuggestions(false), 200)}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-3.5 text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 transition-all font-medium text-sm"
              autoComplete="off"
            />
            {showArtistSuggestions && artistSuggestions.length > 0 && (
              <ul className="absolute z-50 w-full mt-1 bg-slate-950/95 border border-slate-850 rounded-xl overflow-hidden shadow-2xl backdrop-blur-xl max-h-40 overflow-y-auto scroll-area divide-y divide-slate-800/40">
                {artistSuggestions.map((name, index) => (
                  <li
                    key={index}
                    onMouseDown={() => selectArtistSuggestion(name)}
                    className={`px-4 py-3 cursor-pointer text-sm transition-all text-left ${
                      focusedArtistIndex === index
                        ? 'bg-teal-500/10 text-teal-400'
                        : 'hover:bg-slate-900/80 text-slate-300'
                    }`}
                  >
                    {renderHighlightedText(name, artist)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <button
          onClick={() => {
            generateGuide();
            onSubmitted?.();
          }}
          disabled={loading || !artwork.trim()}
          className="w-full bg-gradient-to-r from-teal-500 to-blue-600 hover:from-teal-400 hover:to-blue-500 text-slate-950 font-bold py-3.5 px-6 rounded-xl shadow-lg shadow-teal-500/10 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 group text-sm font-sans"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-5 w-5 text-slate-950" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>AIキュレーターが分析中...</span>
            </>
          ) : (
            <>
              <span>音声ガイドを生成</span>
              <span className="group-hover:translate-x-1 transition-transform">→</span>
            </>
          )}
        </button>
      </div>
    );
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col relative">

      {/* Toast Notification */}
      {showToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-55 bg-teal-500 text-slate-950 font-bold px-5 py-2.5 rounded-full shadow-2xl text-xs font-sans animate-fade-in border border-teal-400/20 select-none">
          {toastMessage}
        </div>
      )}

      {/* Upper Fixed Layer */}
      {(responseShort || loading) && (
        <div className="fixed top-0 left-0 right-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-900 px-4 py-3 flex flex-col items-center select-none shadow-md">
          {/* Top Row Navigation */}
          <div className="flex items-center justify-between w-full max-w-md mb-2">
            <button
              onClick={() => setShowInputDrawer(true)}
              className="text-slate-400 hover:text-teal-400 transition-colors text-xs font-sans font-semibold flex items-center gap-1 bg-slate-900/60 border border-slate-800 px-3 py-1.5 rounded-lg"
            >
              <span>🔍</span> <span>さがす</span>
            </button>
            
            <h1 className="text-lg font-extrabold tracking-tight bg-gradient-to-r from-teal-400 via-emerald-400 to-blue-500 bg-clip-text text-transparent font-sans">
              ArtFreeGuide
            </h1>

            <div className="flex items-center gap-2">
              <button
                onClick={handleShare}
                aria-label="この解説を共有"
                title="この解説を共有"
                className="text-slate-400 hover:text-teal-400 transition-colors text-sm bg-slate-900/60 border border-slate-800 hover:border-teal-500/40 w-8 h-8 rounded-lg flex items-center justify-center active:scale-95"
              >
                📤
              </button>

              <button
                onClick={() => setShowHistorySidebar(true)}
                className="text-slate-400 hover:text-teal-400 transition-colors text-xs font-sans font-semibold flex items-center gap-1 bg-slate-900/60 border border-slate-800 px-3 py-1.5 rounded-lg relative"
              >
                <span>📜</span> <span>履歴</span>
                {history.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-teal-500 text-slate-950 font-bold font-mono rounded-full w-4 h-4 flex items-center justify-center text-[9px]">
                    {history.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Large Artwork Thumbnail (fixed) */}
          <div className="relative w-full max-w-md h-36 sm:h-44 rounded-2xl overflow-hidden bg-slate-900 border border-slate-800/80 shadow-inner flex items-center justify-center group shrink-0">
            {imageLoading && (
              <div className="absolute inset-0 bg-slate-900/60 flex flex-col items-center justify-center gap-2">
                <div className="animate-pulse flex space-x-2">
                  <div className="h-1.5 w-1.5 bg-slate-600 rounded-full animate-bounce"></div>
                  <div className="h-1.5 w-1.5 bg-slate-600 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                  <div className="h-1.5 w-1.5 bg-slate-600 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                </div>
                <span className="text-slate-500 text-[10px] font-sans">画像を読み込み中...</span>
              </div>
            )}
            {displayImageUrl && (
              hotspots.length > 0 ? (
                <ArtworkStage
                  imageUrl={displayImageUrl}
                  alt={artwork}
                  hotspots={hotspots}
                  activeHotspotId={activeHotspotId}
                  onSelect={selectHotspot}
                  kenBurns={isPlaying}
                />
              ) : (
                <img
                  src={displayImageUrl}
                  alt={artwork}
                  className={`w-full h-full object-contain transition-all duration-700 ease-out ${
                    isPlaying ? 'animate-ken-burns' : ''
                  }`}
                />
              )
            )}

            {displayImageUrl && (
              <button
                onClick={() => setShowArtworkViewer(true)}
                className="absolute top-2 right-2 bg-slate-950/70 hover:bg-slate-950 border border-slate-700 hover:border-teal-500/60 text-slate-300 hover:text-teal-400 rounded-lg px-2 py-1 text-[10px] font-bold font-sans transition-colors"
              >
                {hotspots.length > 0 ? '🔍 見どころを拡大' : '🔍 拡大'}
              </button>
            )}

            {/* Now-playing equaliser overlay */}
            {isPlaying && (
              <div className="absolute bottom-2 right-2 flex items-end gap-0.5 h-4 bg-slate-950/70 rounded-full px-2 py-1" aria-hidden="true">
                {[0, 0.3, 0.6].map(delay => (
                  <span
                    key={delay}
                    className="w-0.5 h-3 bg-teal-400 rounded-full animate-equalizer"
                    style={{ animationDelay: `${delay}s` }}
                  />
                ))}
              </div>
            )}
            {imageError && !displayImageUrl && !imageLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600 gap-1 p-2 text-center select-none bg-slate-900/20">
                <span className="text-2xl">🖼️</span>
                <p className="text-[11px] font-semibold text-slate-500 font-sans">作品画像を取得できませんでした</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Full-screen viewer: the artwork large enough to actually look at */}
      {showArtworkViewer && displayImageUrl && (
        <div className="fixed inset-0 z-[60] bg-slate-950/95 backdrop-blur-sm flex flex-col animate-fade-in">
          <div className="flex items-center justify-between px-4 py-3 shrink-0">
            <span className="text-xs font-bold text-slate-300 font-sans truncate pr-3">
              {artwork} {artist ? `／ ${artist}` : ''}
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleShare}
                aria-label={activeHotspot ? 'この見どころを共有' : 'この解説を共有'}
                title={activeHotspot ? 'この見どころを共有' : 'この解説を共有'}
                className="text-slate-400 hover:text-teal-400 bg-slate-900/70 border border-slate-800 hover:border-teal-500/40 rounded-lg w-8 h-8 flex items-center justify-center text-sm active:scale-95"
              >
                📤
              </button>
              <button
                onClick={() => setShowArtworkViewer(false)}
                className="text-slate-400 hover:text-teal-400 bg-slate-900/70 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-bold font-sans"
              >
                閉じる ✕
              </button>
            </div>
          </div>

          <div className="relative flex-1 mx-4 mb-3 rounded-2xl overflow-hidden bg-slate-900/40 border border-slate-800">
            {hotspots.length > 0 ? (
              <ArtworkStage
                imageUrl={displayImageUrl}
                alt={artwork}
                hotspots={hotspots}
                activeHotspotId={activeHotspotId}
                onSelect={selectHotspot}
              />
            ) : (
              <img src={displayImageUrl} alt={artwork} className="absolute inset-0 w-full h-full object-contain" />
            )}
          </div>

          {hotspots.length > 0 ? (
            <div className="px-4 pb-6 space-y-3 shrink-0 max-w-2xl w-full mx-auto">
              <div className="flex flex-wrap gap-2">
                {hotspots.map(hotspot => (
                  <button
                    key={hotspot.id}
                    onClick={() => selectHotspot(activeHotspotId === hotspot.id ? null : hotspot.id)}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-bold font-sans border transition-colors ${
                      activeHotspotId === hotspot.id
                        ? 'bg-teal-500 text-slate-950 border-teal-400'
                        : 'bg-slate-900/60 text-slate-300 border-slate-800 hover:border-teal-500/50'
                    }`}
                  >
                    {hotspot.label}
                  </button>
                ))}
              </div>
              <p className="text-sm text-slate-300 font-serif leading-relaxed min-h-[3.5rem]">
                {activeHotspot ? activeHotspot.detail : '見どころをタップすると、その部分を拡大して解説します。'}
              </p>
            </div>
          ) : (
            <p className="px-4 pb-6 text-xs text-slate-500 font-sans text-center">
              この作品にはまだ見どころの登録がありません。
            </p>
          )}
        </div>
      )}

      {/* Scrollable Center Content */}
      <div className={`w-full max-w-2xl px-4 mx-auto ${responseShort || loading ? 'pt-64 sm:pt-72 pb-32' : 'py-12 md:py-20 flex flex-col items-center justify-center min-h-[calc(100vh-80px)]'}`}>
        
        {/* Empty state: Hero landing / initial search card */}
        {!responseShort && !loading && (
          <div className="w-full space-y-8 animate-fade-in flex flex-col items-center">
            {/* Header Section */}
            <div className="text-center mb-4 space-y-3">
              <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight bg-gradient-to-r from-teal-400 via-emerald-400 to-blue-500 bg-clip-text text-transparent drop-shadow-sm select-none font-sans">
                ArtFreeGuide
              </h1>
              <p className="text-slate-400 text-base md:text-lg font-medium max-w-xl mx-auto font-sans leading-relaxed">
                AIキュレーターが贈る、あなたのための特別な音声ガイド。美術作品をもっと深く、もっと身近に。
              </p>
            </div>

            {renderBrowseHub()}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !responseShort && (
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-3xl p-6 md:p-8 shadow-2xl space-y-6 animate-pulse py-8 w-full mt-4">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 bg-slate-800 rounded-full animate-bounce"></div>
              <div className="space-y-2 flex-1">
                <div className="h-4 bg-slate-800 rounded w-1/4"></div>
                <div className="h-3 bg-slate-800 rounded w-1/3"></div>
              </div>
            </div>
            <div className="space-y-3 pt-4">
              <div className="h-4 bg-slate-800 rounded w-full"></div>
              <div className="h-4 bg-slate-800 rounded w-[95%]"></div>
              <div className="h-4 bg-slate-800 rounded w-[90%]"></div>
            </div>
            <p className="text-center text-xs text-slate-400 font-sans pt-2" aria-live="polite">
              {CURATOR_LOADING_MESSAGES[loadingMessageIndex]}
            </p>
          </div>
        )}

        {/* Guide content */}
        {responseShort && (
          <div className="space-y-6 w-full animate-fade-in">
            {/* Tour header: where we are in the story */}
            {activePlaylist && (
              <div className="bg-slate-900/50 border border-teal-900/60 rounded-2xl p-3 space-y-2 select-none font-sans">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-teal-400 truncate">
                    {activePlaylist.emoji} {activePlaylist.title}
                    <span className="text-slate-500 font-mono ml-2">
                      {playlistIndex + 1}/{activePlaylist.items.length}
                    </span>
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => startTour(activePlaylist, playlistIndex - 1)}
                      disabled={playlistIndex === 0 || loading}
                      className="px-2 py-1 rounded-lg text-[11px] font-bold bg-slate-900 border border-slate-800 text-slate-300 hover:text-teal-400 disabled:opacity-30 active:scale-95 transition-all"
                    >
                      前へ
                    </button>
                    <button
                      onClick={() => startTour(activePlaylist, playlistIndex + 1)}
                      disabled={playlistIndex >= activePlaylist.items.length - 1 || loading}
                      className="px-2 py-1 rounded-lg text-[11px] font-bold bg-slate-900 border border-slate-800 text-slate-300 hover:text-teal-400 disabled:opacity-30 active:scale-95 transition-all"
                    >
                      次へ
                    </button>
                    <button
                      onClick={exitTour}
                      className="px-2 py-1 rounded-lg text-[11px] font-bold bg-slate-900 border border-slate-800 text-slate-500 hover:text-rose-400 active:scale-95 transition-all"
                    >
                      終了
                    </button>
                  </div>
                </div>
                <div className="flex gap-1">
                  {activePlaylist.items.map((item, i) => (
                    <button
                      key={`${item.title}-${i}`}
                      onClick={() => startTour(activePlaylist, i)}
                      title={item.title}
                      aria-label={`${i + 1}. ${item.title}`}
                      className={`h-1.5 flex-1 rounded-full transition-colors ${
                        i === playlistIndex
                          ? 'bg-teal-400'
                          : i < playlistIndex
                            ? 'bg-teal-800'
                            : 'bg-slate-800 hover:bg-slate-700'
                      }`}
                    />
                  ))}
                </div>
                {nextUpCue && (
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="text-[11px] text-slate-400 truncate animate-pulse">{nextUpCue}</span>
                    <button
                      onClick={cancelTourAdvance}
                      className="text-[10px] font-bold text-slate-500 hover:text-rose-400 shrink-0"
                    >
                      自動再生を止める
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Subtitle banner */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-900/60 select-none">
              <span className="text-xs text-slate-400 font-semibold truncate pr-2 font-sans">
                🎧 {artwork} {artist ? `(${artist})` : ''}
              </span>
              {ambientName && (
                <div className="flex items-center gap-1 bg-teal-950/40 border border-teal-900 rounded-full px-2.5 py-0.5 text-[9px] text-teal-400 font-mono animate-pulse shrink-0">
                  <span>🎵</span>
                  <span>{ambientName}</span>
                </div>
              )}
            </div>

            {/* Highlights Segment Box */}
            <div className="relative">
            <div
              ref={guideBoxRef}
              onScroll={updateScrollHint}
              onPointerDown={handleGuidePointerDown}
              onPointerMove={handleGuidePointerMove}
              onPointerUp={endGuideDrag}
              onPointerCancel={endGuideDrag}
              className={`bg-slate-900/20 border border-slate-900 rounded-2xl p-4 md:p-6 max-h-[380px] overflow-y-auto scroll-area space-y-3 font-serif leading-relaxed text-base selection:bg-teal-500/20 shadow-inner ${
                isDraggingGuide ? 'cursor-grabbing select-none' : ''
              }`}
            >
              {segments.length > 0 ? (
                segments.map((seg, index) => {
                  const isSpeakable = speakableSegments.includes(seg);
                  const speakableIndex = speakableSegments.indexOf(seg);
                  const isActive = isPlaying && speakableIndex === activeSegmentIndex;

                  if (seg.startsWith('\n>')) {
                    return (
                      <div key={index} className="py-1">
                        <ReactMarkdown>{seg}</ReactMarkdown>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={index}
                      id={`seg-${speakableIndex}`}
                      className={`transition-all duration-500 rounded-xl px-3 py-1.5 border-l-3 ${
                        isActive
                          ? 'bg-teal-500/10 text-teal-300 border-teal-500 font-medium pl-4 scale-[1.01] shadow-sm'
                          : 'text-slate-350 border-transparent hover:bg-slate-900/10 hover:text-slate-200'
                      }`}
                    >
                      <ReactMarkdown
                        components={{
                          p: ({node, ...props}) => <span {...props} />,
                          h1: ({node, ...props}) => <h1 className="text-lg font-bold text-slate-100 mt-2 mb-1" {...props} />,
                          h2: ({node, ...props}) => <h2 className="text-base font-bold text-slate-100 mt-2 mb-1" {...props} />,
                          strong: ({node, ...props}) => <strong className="font-bold text-teal-400" {...props} />,
                          blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-teal-500/40 pl-4 py-1 italic text-slate-400" {...props} />,
                        }}
                      >
                        {seg}
                      </ReactMarkdown>
                    </div>
                  );
                })
              ) : (
                <div className="text-slate-350">解説を読み込み中...</div>
              )}

              {/* "さらに詳しく" progressive button inside scroll area */}
              {explanationMode !== 'deep' && (
                <div className="pt-4 border-t border-slate-900/60 flex justify-center select-none">
                  <button
                    onClick={() => {
                      // The existing text is a prefix of the deeper text, so segment
                      // indices stay valid and playback can continue uninterrupted.
                      setExplanationMode(explanationMode === 'short' ? 'standard' : 'deep');
                    }}
                    className="px-6 py-2.5 bg-teal-500/10 border border-teal-500/20 hover:bg-teal-500/20 text-teal-400 hover:text-teal-300 rounded-xl text-xs font-bold active:scale-95 transition-all flex items-center gap-1.5 shadow-sm font-sans"
                  >
                    <span>👇</span>
                    <span>{explanationMode === 'short' ? 'もっと詳しく聞く' : 'さらに深く聞く（裏話・エピソード）'}</span>
                  </button>
                </div>
              )}
            </div>
            {showScrollHint && <div className="scroll-hint rounded-b-2xl" aria-hidden="true" />}
            </div>

            {/* Ask the curator: suggested questions, free text and voice */}
            <div className="space-y-2.5 select-none font-sans">
              <div className="flex flex-wrap gap-2">
                {questionChips.map((question, index) => (
                  <button
                    key={question}
                    onClick={() => askQuestion(question)}
                    disabled={askLoading}
                    className={`px-3 py-1.5 bg-slate-900/50 border rounded-full text-[11px] transition-colors active:scale-95 disabled:opacity-40 ${
                      nudgedChip === index
                        ? 'animate-chip-nudge border-teal-500/50 text-teal-300'
                        : 'border-slate-800 hover:border-teal-500/40 hover:text-teal-300 text-slate-300'
                    }`}
                  >
                    {question}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <input
                  value={questionInput}
                  onChange={e => setQuestionInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                      askQuestion(questionInput);
                    }
                  }}
                  placeholder="この作品について質問する"
                  aria-label="この作品について質問する"
                  className="flex-1 min-w-0 bg-slate-950/60 border border-slate-800 focus:border-teal-500/50 rounded-xl px-3 py-2.5 text-xs text-slate-200 placeholder-slate-600 outline-none"
                />
                {recognition && (
                  <button
                    onClick={startListening}
                    disabled={askLoading}
                    aria-label="声で質問する"
                    title="声で質問する"
                    className={`shrink-0 w-10 h-10 rounded-xl text-sm transition-all active:scale-95 disabled:opacity-40 ${
                      isListening
                        ? 'bg-rose-500 text-white animate-pulse'
                        : 'bg-blue-500/10 border border-blue-500/20 text-blue-450 hover:bg-blue-500/20'
                    }`}
                  >
                    🎙️
                  </button>
                )}
                <button
                  onClick={() => askQuestion(questionInput)}
                  disabled={askLoading || !questionInput.trim()}
                  className="shrink-0 px-4 py-2.5 bg-teal-500/10 border border-teal-500/20 hover:bg-teal-500/20 text-teal-300 rounded-xl text-xs font-bold active:scale-95 transition-all disabled:opacity-40"
                >
                  {askLoading ? '考え中…' : '聞く'}
                </button>
              </div>

              {/* Deep Dive secondary trigger button */}
              {explanationMode === 'deep' && (
                <div className="flex justify-center pt-1">
                  <button
                    onClick={handleDeepDive}
                    disabled={deepDiveLoading}
                    className="px-5 py-2.5 bg-gradient-to-r from-teal-500/10 to-blue-500/10 border border-teal-500/20 hover:bg-teal-500/20 text-teal-300 rounded-xl text-xs font-bold active:scale-95 transition-all flex items-center gap-1.5 shadow-md disabled:opacity-40"
                  >
                    <span>{deepDiveLoading ? '探究中...' : '🔍 さらなる面白裏話を発掘'}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Voice question transcription indicator */}
            {voiceText && (
              <div className="p-3 bg-slate-950/40 border border-slate-900 rounded-xl text-xs text-slate-400 flex items-start gap-2 select-text font-sans">
                <span className="text-sm">🗣️</span>
                <div>
                  <span className="font-semibold text-slate-300 block mb-0.5">あなたの質問:</span>
                  <p className="italic">「{voiceText}」</p>
                </div>
              </div>
            )}

            {/* Guide feedback: tap the heart as often as you like, report separately */}
            <div className="flex items-center justify-center gap-3 select-none font-sans text-[11px]">
              <div className="relative">
                {/* Hearts rise out of the button without affecting the layout. */}
                <div className="pointer-events-none absolute bottom-full left-1/2 h-40 w-24 -translate-x-1/2" aria-hidden="true">
                  {hearts.map(heart => (
                    <span
                      key={heart.id}
                      className="animate-heart-float absolute bottom-0 left-1/2 -translate-x-1/2 text-xl"
                      style={
                        {
                          '--heart-drift': `${heart.drift}px`,
                          '--heart-scale': heart.scale
                        } as React.CSSProperties
                      }
                    >
                      ❤️
                    </span>
                  ))}
                </div>
                <button
                  onClick={sendHeart}
                  aria-label="この解説にハートを送る"
                  className="w-11 h-11 rounded-full bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 text-lg transition-colors active:scale-90"
                >
                  {heartCount > 0 ? '❤️' : '🤍'}
                </button>
              </div>
              {heartCount > 0 && (
                <span className="text-rose-300 font-bold tabular-nums">{heartCount}</span>
              )}
              <button
                onClick={() => setShowReportForm(prev => !prev)}
                className="text-slate-500 hover:text-slate-300 underline underline-offset-2"
              >
                気になる点を報告
              </button>
            </div>

            {showReportForm && (
              <div className="p-3 bg-slate-950/60 border border-slate-900 rounded-xl space-y-2 select-none font-sans">
                <textarea
                  value={reportComment}
                  onChange={e => setReportComment(e.target.value)}
                  rows={2}
                  placeholder="気になった点や不具合（例: 事実が違う、読み上げが不自然、画像が別の作品）"
                  className="w-full bg-slate-950/60 border border-slate-800 focus:border-teal-500/50 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 outline-none scroll-area"
                />
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    onClick={() => setShowReportForm(false)}
                    className="px-3 py-2 text-[11px] text-slate-500 hover:text-slate-300"
                  >
                    閉じる
                  </button>
                  <button
                    onClick={handleRegenerateGuide}
                    disabled={regenerating}
                    className="px-3 py-2 bg-slate-900/60 border border-slate-800 hover:border-teal-500/40 text-slate-300 rounded-lg text-[11px] font-bold active:scale-95 disabled:opacity-40"
                  >
                    {regenerating ? '作り直し中…' : '🔄 解説を作り直す'}
                  </button>
                  <button
                    onClick={() => {
                      sendFeedback(reportComment.trim() ? 'bug' : 'bad', reportComment.trim());
                      setReportComment('');
                      setShowReportForm(false);
                      triggerToast('ご報告ありがとうございます');
                    }}
                    className="px-3 py-2 bg-teal-500/10 border border-teal-500/20 hover:bg-teal-500/20 text-teal-300 rounded-lg text-[11px] font-bold active:scale-95"
                  >
                    送信する
                  </button>
                </div>
              </div>
            )}

            {/* Recommendations Grid */}
            {recommendations.length > 0 && (
              <div className="pt-4 space-y-4 select-none">
                <h3 className="text-xs font-bold text-slate-400 tracking-wider uppercase font-sans">
                  💡 次におすすめの作品
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {recommendations.map((rec, index) => (
                    <div
                      key={index}
                      onClick={() => generateGuide(rec.title, rec.artist)}
                      className="bg-slate-900/30 border border-slate-900 hover:border-teal-500/40 hover:bg-slate-900/50 rounded-2xl p-3 flex gap-3 cursor-pointer transition-all duration-300 group shadow-md"
                    >
                      {/* Mini Thumbnail */}
                      <div className="relative w-20 h-16 rounded-xl overflow-hidden bg-slate-950 border border-slate-850 shrink-0 flex items-center justify-center">
                        {rec.imageLoading ? (
                          <div className="absolute inset-0 bg-slate-900/40 flex items-center justify-center">
                            <div className="animate-pulse w-1.5 h-1.5 bg-slate-600 rounded-full"></div>
                          </div>
                        ) : rec.imageUrl ? (
                          <img src={rec.imageUrl} alt={rec.title} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-sm">🖼️</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0 text-left flex flex-col justify-between py-0.5 font-sans">
                        <div>
                          <h4 className="font-semibold text-slate-200 text-xs truncate group-hover:text-teal-400 transition-colors">
                            {rec.title}
                          </h4>
                          <p className="text-[10px] text-slate-500 truncate">{rec.artist}</p>
                        </div>
                        <p className="text-[10px] text-slate-400 line-clamp-1 italic">{rec.reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Catalogue similarity recommendations (Supabase pgvector) */}
            <div className="pt-4">
              <ForYouShelf
                items={similarArtworks}
                basis={recommendationBasis}
                viewCount={tasteProfile?.viewCount ?? 0}
                favoriteTags={tasteProfile?.favoriteTags ?? []}
                onPick={(title, artistName) => generateGuide(title, artistName)}
              />
            </div>

          </div>
        )}
      </div>

      {/* Downward Fixed Controller Panel (Optimized Smartphone Thumb Reach) */}
      {responseShort && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-slate-950/95 border-t border-slate-900 px-4 pt-2 pb-5 shadow-2xl flex flex-col justify-center gap-2 select-none h-28">
          {/* Narration progress */}
          <div className="w-full max-w-lg mx-auto px-1 font-sans">
            <div className="flex items-center justify-between text-[9px] text-slate-500 font-mono mb-1">
              <span>{Math.max(activeSegmentIndex + 1, 0)} / {speakableSegments.length}</span>
              <span>{Math.round(narrationProgress * 100)}%</span>
            </div>
            <div
              className="h-1 w-full bg-slate-900 rounded-full overflow-hidden"
              role="progressbar"
              aria-valuenow={Math.round(narrationProgress * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="音声ガイドの再生位置"
            >
              <div
                className="h-full bg-gradient-to-r from-teal-500 to-blue-500 transition-all duration-500"
                style={{ width: `${narrationProgress * 100}%` }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between w-full max-w-lg mx-auto px-1 font-sans">
            
            {/* Playback Speed Popover (Leftmost) */}
            <div className="flex-1 min-w-0 relative flex justify-center">
              <button
                onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                className="flex flex-col items-center justify-center gap-1 text-teal-400 hover:text-teal-350 transition-all active:scale-90"
                title="再生速度を変更"
              >
                <span className="text-lg">⚡</span>
                <span className="text-[8px] sm:text-[9px] font-mono font-bold truncate max-w-full">{playbackSpeed.toFixed(1)}x</span>
              </button>

              {/* Smart Speed Selector Popover */}
              {showSpeedMenu && (
                <div className="absolute bottom-12 left-0 bg-slate-950 border border-slate-850 rounded-2xl p-2 flex flex-col gap-1 shadow-2xl z-50 min-w-[70px] animate-fade-in">
                  {[1.0, 1.2, 1.5, 1.7, 2.0, 2.5].map(sp => {
                    const isSelected = playbackSpeed === sp;
                    return (
                      <button
                        key={sp}
                        onClick={() => {
                          setPlaybackSpeed(sp);
                          localStorage.setItem('art_free_guide_playback_speed', String(sp));
                          setShowSpeedMenu(false);
                        }}
                        className={`py-2 text-[11px] font-mono font-bold rounded-lg transition-all text-center active:scale-95 ${
                          isSelected
                            ? 'bg-teal-500 text-slate-950 font-black'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                        }`}
                      >
                        {sp.toFixed(1)}x
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Prev Artwork in History */}
            <button
              onClick={() => loadHistoryEntry(historyIndex - 1)}
              disabled={historyIndex <= 0}
              className="flex flex-col items-center justify-center gap-1 flex-1 min-w-0 text-slate-400 hover:text-teal-400 disabled:opacity-20 transition-all active:scale-90 disabled:pointer-events-none"
              title="前の作品に戻る"
            >
              <span className="text-xl">⏮️</span>
              <span className="text-[8px] sm:text-[9px] font-semibold truncate max-w-full">前作品</span>
            </button>

            {/* Skip 1 segment backward */}
            <button
              onClick={handleSkipBackward}
              disabled={activeSegmentIndex <= 0}
              className="flex flex-col items-center justify-center gap-1 flex-1 min-w-0 text-slate-400 hover:text-teal-400 disabled:opacity-20 transition-all active:scale-90"
              title="1文戻る"
            >
              <span className="text-lg">⏪</span>
              <span className="text-[8px] sm:text-[9px] font-semibold truncate max-w-full">1文戻る</span>
            </button>
            
            {/* Central Play/Pause button (Enlarged circle) */}
            <div className="relative shrink-0 mx-2">
              {/* Browsers block autoplay, so point at the button until the first tap. */}
              {!hasPlayedOnce && (
                <span className="animate-bounce pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap rounded-full bg-teal-500 px-3 py-1 text-[10px] font-bold text-slate-950 shadow-lg font-sans">
                  🎧 ここから再生
                </span>
              )}
              {/* Halo lives outside the button so it can grow past its edge. */}
              {isPlaying && (
                <span
                  className="animate-play-pulse pointer-events-none absolute inset-0 rounded-full bg-teal-400/40"
                  aria-hidden="true"
                />
              )}
            <button
              onClick={handlePlayPause}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 shadow-xl active:scale-95 relative overflow-hidden ${
                isPlaying
                  ? 'bg-teal-500 text-slate-950 hover:bg-teal-400 hover:shadow-teal-400/20'
                  : 'bg-slate-900 text-teal-400 border border-teal-500/30 hover:border-teal-500 hover:shadow-teal-500/10'
              }`}
            >
              {isPlaying ? (
                <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                </svg>
              ) : (
                <svg className="w-5 h-5 fill-current translate-x-0.5" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              )}
            </button>
            </div>

            {/* Skip 1 segment forward */}
            <button
              onClick={handleSkipForward}
              disabled={activeSegmentIndex >= speakableSegments.length - 1}
              className="flex flex-col items-center justify-center gap-1 flex-1 min-w-0 text-slate-400 hover:text-teal-400 disabled:opacity-20 transition-all active:scale-90"
              title="1文進む"
            >
              <span className="text-lg">⏩</span>
              <span className="text-[8px] sm:text-[9px] font-semibold truncate max-w-full">1文進む</span>
            </button>

            {/* Next Artwork in History */}
            <button
              onClick={() => loadHistoryEntry(historyIndex + 1)}
              disabled={historyIndex >= history.length - 1}
              className="flex flex-col items-center justify-center gap-1 flex-1 min-w-0 text-slate-400 hover:text-teal-400 disabled:opacity-20 transition-all active:scale-90 disabled:pointer-events-none"
              title="次の作品に進む"
            >
              <span className="text-xl">⏭️</span>
              <span className="text-[8px] sm:text-[9px] font-semibold truncate max-w-full">次作品</span>
            </button>

          </div>
        </div>
      )}

      {/* Slide-Up Input Drawer */}
      {showInputDrawer && (
        <div className="fixed inset-0 z-50 flex items-end justify-center animate-fade-in select-none">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            onClick={() => setShowInputDrawer(false)}
          ></div>

          {/* Drawer content */}
          <div className="relative w-full max-w-xl bg-slate-950 border-t border-slate-900 rounded-t-3xl shadow-2xl p-6 md:p-8 animate-slide-up z-10 max-h-[90vh] overflow-y-auto scroll-area">
            
            {/* Handle bar */}
            <div className="w-12 h-1 bg-slate-800 rounded-full mx-auto mb-5"></div>

            <div className="flex items-center justify-between mb-6 font-sans">
              <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2">
                <span className="text-teal-400">✦</span> つぎに聴くものをさがす
              </h2>
              <button
                onClick={() => setShowInputDrawer(false)}
                className="text-slate-505 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            {renderBrowseHub(() => setShowInputDrawer(false))}
          </div>
        </div>
      )}

      {/* History Sidebar Drawer */}
      {showHistorySidebar && (
        <div className="fixed inset-0 z-50 flex justify-end select-none animate-fade-in">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            onClick={() => setShowHistorySidebar(false)}
          ></div>

          {/* Drawer content */}
          <div className="relative w-full max-w-xs bg-slate-950 border-l border-slate-900 h-full flex flex-col shadow-2xl p-6 overflow-y-auto scroll-area z-50">
            <div className="flex items-center justify-between border-b border-slate-900 pb-4 mb-4 font-sans">
              <h3 className="text-lg font-bold text-slate-200 flex items-center gap-2">
                <span>📜</span> 閲覧履歴
              </h3>
              <button
                onClick={() => setShowHistorySidebar(false)}
                className="text-slate-500 hover:text-white transition-colors text-lg"
              >
                ✕
              </button>
            </div>

            {/* History List */}
            <div className="flex-1 space-y-2 overflow-y-auto scroll-area pr-1 font-sans">
              {history.length === 0 ? (
                <div className="text-slate-650 text-xs py-8 text-center leading-relaxed">
                  履歴はありません。<br />ガイドを生成するとここに保存されます。
                </div>
              ) : (
                history.map((entry, idx) => {
                  const isActive = idx === historyIndex;
                  return (
                    <div
                      key={idx}
                      onClick={() => {
                        loadHistoryEntry(idx);
                        setShowHistorySidebar(false);
                      }}
                      className={`flex items-center gap-3 p-2.5 rounded-xl cursor-pointer border transition-all ${
                        isActive
                          ? 'bg-teal-500/10 border-teal-500/30 text-teal-400 font-bold'
                          : 'bg-slate-900/40 border-slate-800/40 hover:border-slate-800 hover:bg-slate-900/60 text-slate-350 hover:text-slate-200'
                      }`}
                    >
                      {/* Minithumb */}
                      <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-950 border border-slate-850 flex items-center justify-center shrink-0">
                        {entry.imageUrl ? (
                          <img src={entry.imageUrl} alt={entry.title} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-xs">🖼️</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <p className="font-semibold text-xs truncate">{entry.title}</p>
                        <p className="text-[10px] text-slate-500 truncate">{entry.artist || '作者不明'}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Clear Button */}
            {history.length > 0 && (
              <button
                onClick={() => {
                  if (confirm('閲覧履歴をすべて消去しますか？')) {
                    setHistory([]);
                    setHistoryIndex(-1);
                    localStorage.removeItem('art_free_guide_history');
                    localStorage.removeItem('art_free_guide_history_index');
                  }
                }}
                className="w-full mt-4 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 hover:border-rose-500/30 text-rose-400 rounded-xl text-xs font-bold active:scale-95 transition-all flex items-center justify-center gap-1.5 font-sans"
              >
                <span>🗑️</span>
                <span>履歴をクリア</span>
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
