'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { FeedbackControls } from '@/components/FeedbackControls';
import HistoryPlaylistDrawer from '@/components/HistoryPlaylistDrawer';
import { InitialGuideData, RecommendationItem, PlaylistData } from '@/types/knowledgeBase';

interface ArtworkSuggestion {
  title: string;
  artist: string;
  isAi?: boolean;
}

interface Recommendation {
  title: string;
  artist: string;
  reason: string;
  imageUrl: string | null;
  imageLoading: boolean;
}

interface GuideCacheEntry {
  location?: string | null;
  year?: string | null;
  short: string;
  standard: string;
  deep: string;
  imageUrl: string | null;
  imageError: boolean;
  searchQuery: string;
  recommendations: Recommendation[];
  artistSlug?: string | null;
  artworkSlug?: string | null;
}

interface HistoryEntry {
  title: string;
  artist: string;
  location?: string | null;
  year?: string | null;
  short: string;
  standard: string;
  deep: string;
  imageUrl: string | null;
  imageError: boolean;
  searchQuery: string;
  recommendations: Recommendation[];
  timestamp: string;
  artistSlug?: string | null;
  artworkSlug?: string | null;
}

const DEFAULT_IMAGE_URL = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"%3E%3Crect width="800" height="600" fill="%230f172a"/%3E%3Cg opacity="0.4"%3E%3Crect x="250" y="180" width="300" height="200" rx="16" fill="%231e293b" stroke="%23334155" stroke-width="4"/%3E%3Ccircle cx="330" cy="240" r="25" fill="%230d9488"/%3E%3Cpath d="M280 340l70-60 60 40 70-70 70 90H280z" fill="%23334155"/%3E%3Ctext x="400" y="440" fill="%2394a3b8" font-family="sans-serif" font-size="20" font-weight="bold" text-anchor="middle"%3ENo Image Available%3C/text%3E%3C/g%3E%3C/svg%3E';

const normalizeTextForSpeech = (text: string): string => {
  if (!text) return '';
  return text
    .replace(/南仏/g, 'なんふつ')
    .replace(/東仏/g, 'とうふつ')
    .replace(/西仏/g, 'せいふつ')
    .replace(/北仏/g, 'ほくふつ');
};

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

const PRESET_ARTISTS = [
  'フィンセント・ファン・ゴッホ',
  'ヨハネス・フェルメール',
  'レオナルド・ダ・ヴィンチ',
  'クロード・モネ',
  'パブロ・ピカソ',
  'エドヴァルド・ムンク',
  'サルバドール・ダリ',
  '葛飾北斎',
  '草間彌生',
  'アンディ・ウォーホル',
  'ピエール＝オーギュスト・ルノワール',
  'ミケランジェロ・ブオナローティ',
  'ジャン＝ミシェル・バスキア',
];

function slugify(text: string): string {
  if (!text) return '';
  const cleaned = text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (cleaned && cleaned !== 'artist' && cleaned !== 'artwork') {
    return cleaned;
  }
  return '';
}

interface AudioQueueItem {
  index: number;
  text: string;
  rate: number;
  onStart: () => void;
  onEnd: () => void;
  onError: (e: any) => void;
}

class AudioController {
  private static speechTimeoutId: any = null;
  private static currentAudio: HTMLAudioElement | null = null;
  private static currentObjectUrl: string | null = null;

  private static queue: AudioQueueItem[] = [];
  private static isSpeaking: boolean = false;
  private static currentQueueIndex: number | null = null;
  private static stopRequested: boolean = false;

  static stop() {
    console.log('[AUDIO] Stop Requested (Full Stop)');
    this.stopRequested = true;
    this.queue = [];
    this.isSpeaking = false;
    this.currentQueueIndex = null;

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.resume();
        window.speechSynthesis.cancel();
      } catch (e) {
        console.warn('[AUDIO] Cancel failed:', e);
      }
    }

    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
        this.currentAudio.src = '';
        this.currentAudio.onended = null;
        this.currentAudio.onerror = null;
        this.currentAudio = null;
      } catch (e) {
        console.warn('[AUDIO] HTMLAudio cancel failed:', e);
      }
    }

    if (this.currentObjectUrl) {
      try {
        URL.revokeObjectURL(this.currentObjectUrl);
      } catch (_) { }
      this.currentObjectUrl = null;
    }

    if (this.speechTimeoutId) {
      clearTimeout(this.speechTimeoutId);
      this.speechTimeoutId = null;
    }
  }

  static clearQueue() {
    console.log('[AUDIO] Queue Cleared (Skip/Reset)');
    this.stopRequested = false;
    this.queue = [];
    this.isSpeaking = false;
    this.currentQueueIndex = null;

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.resume();
        window.speechSynthesis.cancel();
      } catch (e) {
        console.warn('[AUDIO] Cancel failed:', e);
      }
    }

    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
        this.currentAudio.src = '';
        this.currentAudio.onended = null;
        this.currentAudio.onerror = null;
        this.currentAudio = null;
      } catch (e) {
        console.warn('[AUDIO] HTMLAudio cancel failed:', e);
      }
    }

    if (this.currentObjectUrl) {
      try {
        URL.revokeObjectURL(this.currentObjectUrl);
      } catch (_) { }
      this.currentObjectUrl = null;
    }

    if (this.speechTimeoutId) {
      clearTimeout(this.speechTimeoutId);
      this.speechTimeoutId = null;
    }
  }

  static forceUnlock() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      console.log('[AUDIO] Attempting to force unlock speech engine');
      try {
        window.speechSynthesis.cancel();
        window.speechSynthesis.resume();
      } catch (e) {
        console.warn('[AUDIO] Force unlock failed:', e);
      }
    }
  }

  static isLineBrowser(): boolean {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    return /Line\//i.test(ua);
  }

  static isWebSpeechSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window && !this.isLineBrowser();
  }

  static speak(
    index: number,
    text: string,
    rate: number,
    onStart: () => void,
    onEnd: () => void,
    onError: (e: any) => void
  ) {
    if (typeof window === 'undefined') return;

    // Reset stop flag on new speak request
    this.stopRequested = false;

    if (this.currentQueueIndex === index && this.isSpeaking) {
      console.log(`[AUDIO-QUEUE] Sentence #${index} is currently speaking. Ignoring duplicate request.`);
      return;
    }
    if (this.queue.some(item => item.index === index)) {
      console.log(`[AUDIO-QUEUE] Sentence #${index} is already in queue. Ignoring duplicate request.`);
      return;
    }

    const item: AudioQueueItem = { index, text, rate, onStart, onEnd, onError };
    this.queue.push(item);
    console.log(`[AUDIO-QUEUE] Queued sentence #${index}. Queue length: ${this.queue.length}`);

    if (!this.isSpeaking) {
      this.processQueue();
    }
  }

  private static processQueue() {
    if (this.stopRequested) {
      console.log('[AUDIO-QUEUE] Stop requested. Aborting processQueue.');
      return;
    }

    if (this.isSpeaking) {
      return;
    }

    if (this.queue.length === 0) {
      this.isSpeaking = false;
      this.currentQueueIndex = null;
      return;
    }

    const item = this.queue.shift()!;
    this.isSpeaking = true;
    this.currentQueueIndex = item.index;

    console.log(`[AUDIO-QUEUE] Starting sentence #${item.index}. Remaining queue: ${this.queue.length}`);
    this.executeItem(item);
  }

  private static executeItem(item: AudioQueueItem) {
    const speechText = normalizeTextForSpeech(item.text);

    if (!this.isWebSpeechSupported()) {
      console.log(`[AUDIO] Using Cloudflare Workers AI MeloTTS Fallback for sentence #${item.index}`);
      this.speakFallbackInternal(item, speechText);
      return;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        window.speechSynthesis.resume();
      } catch (e) {
        console.warn('[AUDIO-DEBUG] Forced-resume failed:', e);
      }
    }

    const utterance = new SpeechSynthesisUtterance(speechText);
    utterance.lang = 'ja-JP';
    utterance.rate = item.rate;

    let hasFinished = false;

    const handleTransition = (type: 'end' | 'error' | 'timeout', detail?: any) => {
      if (hasFinished) return;
      hasFinished = true;

      if (this.speechTimeoutId) {
        clearTimeout(this.speechTimeoutId);
        this.speechTimeoutId = null;
      }

      if (this.stopRequested) {
        console.log(`[AUDIO-DEBUG] Stop requested, suppressing transition callback for sentence #${item.index}`);
        this.isSpeaking = false;
        this.currentQueueIndex = null;
        return;
      }

      if (type === 'end') {
        console.log(`[AUDIO-DEBUG] Sentence #${item.index} ended normally`);
        this.isSpeaking = false;
        this.currentQueueIndex = null;
        try {
          item.onEnd();
        } catch (e) {
          console.error('[AUDIO-DEBUG] onEnd callback error:', e);
        }
        setTimeout(() => this.processQueue(), 10);
      } else if (type === 'error') {
        console.warn(`[AUDIO-DEBUG] Sentence #${item.index} WebSpeech error, switching to MeloTTS fallback:`, detail);
        this.speakFallbackInternal(item, speechText);
      } else { // timeout
        console.warn(`[AUDIO-DEBUG] Safety timeout triggered for sentence #${item.index}`);
        this.isSpeaking = false;
        this.currentQueueIndex = null;
        try {
          item.onEnd();
        } catch (e) {
          console.error('[AUDIO-DEBUG] onEnd callback error:', e);
        }
        setTimeout(() => this.processQueue(), 10);
      }
    };

    utterance.onstart = () => {
      console.log(`[AUDIO-DEBUG] Voice successfully started for #${item.index}`);
      try {
        item.onStart();
      } catch (e) {
        console.error('[AUDIO-DEBUG] onStart callback error:', e);
      }
    };

    utterance.onend = () => {
      handleTransition('end');
    };

    utterance.onerror = (e) => {
      handleTransition('error', e);
    };

    const timeoutDuration = Math.max(15000, speechText.length * 200);
    this.speechTimeoutId = setTimeout(() => {
      handleTransition('timeout');
    }, timeoutDuration);

    try {
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn(`[AUDIO-DEBUG] speechSynthesis.speak exception, falling back to MeloTTS:`, err);
      handleTransition('error', err);
    }
  }

  private static async speakFallbackInternal(
    item: AudioQueueItem,
    speechText: string
  ) {
    console.log(`[AUDIO-FALLBACK] MeloTTS started for sentence #${item.index}. Snippet:`, speechText.substring(0, 50));
    let hasFinished = false;

    const handleTransition = (type: 'end' | 'error' | 'timeout', detail?: any) => {
      if (hasFinished) return;
      hasFinished = true;

      if (this.speechTimeoutId) {
        clearTimeout(this.speechTimeoutId);
        this.speechTimeoutId = null;
      }

      if (this.currentAudio) {
        this.currentAudio.onended = null;
        this.currentAudio.onerror = null;
      }

      if (this.stopRequested) {
        console.log(`[AUDIO-FALLBACK] Stop requested, suppressing transition callback for sentence #${item.index}`);
        this.isSpeaking = false;
        this.currentQueueIndex = null;
        return;
      }

      this.isSpeaking = false;
      this.currentQueueIndex = null;

      if (type === 'end') {
        console.log(`[AUDIO-FALLBACK] Sentence #${item.index} ended normally`);
        try {
          item.onEnd();
        } catch (e) {
          console.error('[AUDIO-FALLBACK] onEnd callback error:', e);
        }
      } else if (type === 'error') {
        console.warn(`[AUDIO-FALLBACK] Sentence #${item.index} error:`, detail);
        try {
          item.onError(detail);
        } catch (e) {
          console.error('[AUDIO-FALLBACK] onError callback error:', e);
        }
      } else {
        console.warn(`[AUDIO-FALLBACK] Safety timeout triggered for sentence #${item.index}`);
        try {
          item.onEnd();
        } catch (e) {
          console.error('[AUDIO-FALLBACK] onEnd callback error:', e);
        }
      }

      setTimeout(() => this.processQueue(), 10);
    };

    try {
      console.log(`[AUDIO-FALLBACK] Requesting MeloTTS audio for sentence #${item.index}...`);
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: speechText })
      });

      if (!response.ok) {
        throw new Error(`MeloTTS API returned status ${response.status}`);
      }

      const blob = await response.blob();
      if (!blob || blob.size === 0) {
        throw new Error('MeloTTS API returned empty audio blob');
      }

      const audioUrl = URL.createObjectURL(blob);
      this.currentObjectUrl = audioUrl;

      const audio = new Audio(audioUrl);
      this.currentAudio = audio;

      const timeoutDuration = Math.max(20000, speechText.length * 400);
      this.speechTimeoutId = setTimeout(() => {
        handleTransition('timeout');
      }, timeoutDuration);

      audio.onplay = () => {
        console.log(`[AUDIO-FALLBACK] MeloTTS Audio playing for sentence #${item.index}`);
        try {
          item.onStart();
        } catch (e) {
          console.error('[AUDIO-FALLBACK] onStart callback error:', e);
        }
      };

      audio.onended = () => {
        console.log(`[AUDIO-FALLBACK] HTMLAudioElement ended for sentence #${item.index}`);
        handleTransition('end');
      };

      audio.onerror = (err) => {
        handleTransition('error', err);
      };

      await audio.play();
    } catch (err) {
      console.warn(`[AUDIO-FALLBACK] MeloTTS playback failed for sentence #${item.index}:`, err);
      handleTransition('error', err);
    }
  }
}

interface ArtFreeGuideClientProps {
  initialGuide?: InitialGuideData | null;
  initialPlaylist?: PlaylistData | null;
}

export default function ArtFreeGuideClient({ initialGuide, initialPlaylist }: ArtFreeGuideClientProps = {}) {
  const [playlist, setPlaylist] = useState<PlaylistData | null>(initialPlaylist || null);
  const [showTourCompletedModal, setShowTourCompletedModal] = useState(false);

  const initialItem = initialPlaylist?.items[0] || initialGuide;

  const [artwork, setArtwork] = useState(initialItem?.title || '');
  const [artist, setArtist] = useState(initialItem?.artist || '');
  const [location, setLocation] = useState<string | null>(initialItem?.location || null);
  const [year, setYear] = useState<string | null>(initialItem?.year || null);
  const [loading, setLoading] = useState(false);

  // Permanent Slug States
  const [artistSlug, setArtistSlug] = useState<string | null>(initialItem?.artistSlug || null);
  const [artworkSlug, setArtworkSlug] = useState<string | null>(initialItem?.artworkSlug || null);

  // Personalized Explanation Modes
  const [responseShort, setResponseShort] = useState(initialItem?.short || '');
  const [responseStandard, setResponseStandard] = useState(initialItem?.standard || '');
  const [responseDeep, setResponseDeep] = useState(initialItem?.deep || '');
  const [explanationMode, setExplanationMode] = useState<'short' | 'standard' | 'deep'>('short');

  // Stateful Knowledge Base IDs
  const [currentArtworkId, setCurrentArtworkId] = useState<number | undefined>(initialItem?.id);
  const [currentImageId, setCurrentImageId] = useState<number | undefined>(undefined); // FROZEN

  // Client-side cache for fetched guides
  const [guideCache, setGuideCache] = useState<Record<string, GuideCacheEntry>>({});

  // History State (Pre-populated with Playlist sequence if in Tour Mode)
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    if (initialPlaylist && initialPlaylist.items.length > 0) {
      return initialPlaylist.items.map(item => ({
        title: item.title,
        artist: item.artist,
        location: item.location || null,
        year: item.year || null,
        short: item.short,
        standard: item.standard || '',
        deep: item.deep || '',
        imageUrl: item.imageUrl || null,
        imageError: false,
        searchQuery: item.searchQuery || `${item.title} ${item.artist}`,
        recommendations: (item.recommendations || []).map(r => ({
          title: r.title,
          artist: r.artist,
          reason: r.reason,
          imageUrl: null,
          imageLoading: true
        })),
        artistSlug: item.artistSlug || null,
        artworkSlug: item.artworkSlug || null,
        timestamp: new Date().toISOString()
      }));
    }
    if (initialGuide && initialGuide.title) {
      return [{
        title: initialGuide.title,
        artist: initialGuide.artist,
        location: initialGuide.location || null,
        year: initialGuide.year || null,
        short: initialGuide.short,
        standard: initialGuide.standard || '',
        deep: initialGuide.deep || '',
        imageUrl: initialGuide.imageUrl || null,
        imageError: false,
        searchQuery: initialGuide.searchQuery || `${initialGuide.title} ${initialGuide.artist}`,
        recommendations: (initialGuide.recommendations || []).map(r => ({
          title: r.title,
          artist: r.artist,
          reason: r.reason,
          imageUrl: null,
          imageLoading: true
        })),
        artistSlug: initialGuide.artistSlug || null,
        artworkSlug: initialGuide.artworkSlug || null,
        timestamp: new Date().toISOString()
      }];
    }
    return [];
  });

  const [historyIndex, setHistoryIndex] = useState<number>(initialPlaylist || initialGuide ? 0 : -1);
  const [showHistorySidebar, setShowHistorySidebar] = useState(false);

  // Compact Interface Drawer / Popover States
  const [showInputDrawer, setShowInputDrawer] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  // Toast Notification State
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // Input management for AI Chat (Phase 1)
  const [inputValue, setInputValue] = useState('');
  const [conversationLog, setConversationLog] = useState<{ role: 'user' | 'assistant', content: string }[]>([]); // FROZEN (Read-only for backward compatibility)
  const [chatLoading, setChatLoading] = useState(false); // FROZEN

  // AI-generated improvement suggestions (dynamic)
  const [improvementSuggestions, setImprovementSuggestions] = useState<{ type: string, icon: string, message: string, action: string }[]>([]);

  // Autocomplete States
  const [artworkSuggestions, setArtworkSuggestions] = useState<ArtworkSuggestion[]>([]);
  const [showArtworkSuggestions, setShowArtworkSuggestions] = useState(false);
  const [focusedArtworkIndex, setFocusedArtworkIndex] = useState(-1);
  const [suggestCache, setSuggestCache] = useState<Record<string, ArtworkSuggestion[]>>({});

  const [artistSuggestions, setArtistSuggestions] = useState<string[]>([]);
  const [showArtistSuggestions, setShowArtistSuggestions] = useState(false);
  const [focusedArtistIndex, setFocusedArtistIndex] = useState(-1);

  // Image State
  const [imageUrl, setImageUrl] = useState<string | null>(initialItem?.imageUrl || DEFAULT_IMAGE_URL);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [searchQuery, setSearchQuery] = useState(initialItem?.searchQuery || '');

  // Recommendations State
  const [recommendations, setRecommendations] = useState<Recommendation[]>(() => {
    if (initialItem?.recommendations && Array.isArray(initialItem.recommendations)) {
      return initialItem.recommendations.map(r => ({
        title: r.title,
        artist: r.artist,
        reason: r.reason,
        imageUrl: null,
        imageLoading: true
      }));
    }
    return [];
  });

  // Next-Gen Audio Control States
  const [segments, setSegments] = useState<string[]>([]);
  const [speakableSegments, setSpeakableSegments] = useState<string[]>([]);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.5);
  const [speechSupported, setSpeechSupported] = useState(false);

  // Deep Dive & Interactive Feedback States
  const [deepDiveLoading, setDeepDiveLoading] = useState(false); // FROZEN
  const [isListening, setIsListening] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const [recognition, setRecognition] = useState<any>(null);

  // Grab to Scroll state for explanation text area with Drag Threshold
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startY, setStartY] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isMouseDownRef = useRef(false);

  // PC Mouse Drag-to-Scroll for Horizontal Carousel Slider with Drag Threshold
  const carouselRef = useRef<HTMLDivElement>(null);
  const isProgrammaticScroll = useRef(false);
  const isCarouselMouseDown = useRef(false);
  const isCarouselDraggingState = useRef(false);
  const carouselStartX = useRef(0);
  const carouselScrollLeft = useRef(0);
  const [isDraggingCarousel, setIsDraggingCarousel] = useState(false);

  // Ambient Sound States
  const [ambientName, setAmbientName] = useState<string | null>(null);

  // Refs for tracking properties in async speech callbacks
  const isPlayingRef = useRef(false);
  const speedRef = useRef(1.5);
  const activeIndexRef = useRef(-1);
  const speakableSegmentsRef = useRef<string[]>([]);

  useEffect(() => {
    // FROZEN: Ref usage for async speech callbacks
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    // FROZEN: Ref usage for async speech callbacks
    speedRef.current = playbackSpeed;
  }, [playbackSpeed]);

  useEffect(() => {
    // FROZEN: Ref usage for async speech callbacks
    activeIndexRef.current = activeSegmentIndex;
  }, [activeSegmentIndex]);

  useEffect(() => {
    // FROZEN: Ref usage for async speech callbacks
    speakableSegmentsRef.current = speakableSegments;
  }, [speakableSegments]);

  // Global Audio Unlocker on first user touch/click (Crucial for LINE in-app WebView)
  useEffect(() => {
    const unlock = () => {
      AudioController.forceUnlock();
      window.removeEventListener('click', unlock);
      window.removeEventListener('touchstart', unlock);
    };
    window.addEventListener('click', unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true });
    return () => {
      window.removeEventListener('click', unlock);
      window.removeEventListener('touchstart', unlock);
    };
  }, []);

  // Toast trigger helper
  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  };

  // State parameter synchronizer: updates browser address bar to canonical permanent slug URL (/art/artist-slug/artwork-slug) unless in playlist mode
  const syncUrlState = (
    title: string,
    artistName: string,
    aSlug?: string | null,
    wSlug?: string | null
  ) => {
    if (typeof window === 'undefined') return;
    if (!title.trim() || playlist) return;

    const validArtistSlug = (aSlug && aSlug !== 'artist') ? aSlug : slugify(artistName);
    const validArtworkSlug = (wSlug && wSlug !== 'artwork') ? wSlug : slugify(title);

    // Guard against literal fallback strings "artist" or "artwork"
    if (!validArtistSlug || !validArtworkSlug || validArtistSlug === 'artist' || validArtworkSlug === 'artwork') {
      return;
    }

    const canonicalPath = `/art/${validArtistSlug}/${validArtworkSlug}`;

    if (window.location.pathname !== canonicalPath) {
      window.history.replaceState({}, '', canonicalPath);
    }
  };

  // Real-time synchronization effect for canonical slug URL
  useEffect(() => {
    if (artwork.trim()) {
      syncUrlState(artwork, artist, artistSlug, artworkSlug);
    }
  }, [artwork, artist, artistSlug, artworkSlug]);

  // URL parameters listener (Deep Linking & Initial State Setup)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleUrlChange = () => {
      const params = new URLSearchParams(window.location.search);
      const artworkParam = params.get('work') || params.get('artwork') || params.get('title') || '';
      const artistParam = params.get('artist') || '';
      const speedParam = params.get('speed') || '';
      const modeParam = params.get('mode') || '';

      if (speedParam) {
        const parsedSpeed = parseFloat(speedParam);
        if (!isNaN(parsedSpeed) && [1.0, 1.2, 1.5, 1.7, 2.0, 2.5].includes(parsedSpeed)) {
          setPlaybackSpeed(parsedSpeed);
        }
      }

      if (modeParam && ['short', 'standard', 'deep'].includes(modeParam)) {
        setExplanationMode(modeParam as 'short' | 'standard' | 'deep');
      }

      if (artworkParam.trim() && !initialGuide && !initialPlaylist) {
        generateGuide(artworkParam, artistParam, modeParam as 'short' | 'standard' | 'deep');
      }
    };

    window.addEventListener('popstate', handleUrlChange);
    handleUrlChange();

    return () => window.removeEventListener('popstate', handleUrlChange);
  }, []);

  // Load initial settings and session on mount
  useEffect(() => {
    const savedSpeed = localStorage.getItem('art_free_guide_playback_speed');
    if (savedSpeed) {
      setPlaybackSpeed(parseFloat(savedSpeed));
    } else {
      setPlaybackSpeed(1.5);
    }

    const savedHistoryStr = localStorage.getItem('art_free_guide_history');
    if (savedHistoryStr && !initialGuide && !initialPlaylist) {
      try {
        const parsedHistory = JSON.parse(savedHistoryStr) as HistoryEntry[];
        setHistory(parsedHistory);
      } catch (e) { }
    }

    if (initialItem) {
      if (!initialItem.imageUrl) {
        fetchImage(initialItem.searchQuery || `${initialItem.title} ${initialItem.artist}`);
      }
      if (initialItem.recommendations && initialItem.recommendations.length > 0) {
        fetchRecommendationImages(
          initialItem.recommendations.map(r => ({
            title: r.title,
            artist: r.artist,
            reason: r.reason,
            imageUrl: null,
            imageLoading: true
          })),
          initialItem.title,
          initialItem.artist
        );
      }
    }
  }, []);

  useEffect(() => {
    const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
    setSpeechSupported(supported);
  }, []);

  const scrollToCarouselIndex = (index: number) => {
    if (carouselRef.current && index >= 0 && index < history.length) {
      const width = carouselRef.current.clientWidth;
      if (width > 0) {
        isProgrammaticScroll.current = true;
        carouselRef.current.scrollTo({
          left: index * width,
          behavior: 'smooth'
        });
        setTimeout(() => {
          isProgrammaticScroll.current = false;
        }, 400);
      }
    }
  };

  const handleCarouselScroll = () => {
    if (!carouselRef.current || isProgrammaticScroll.current || isCarouselDraggingState.current) return;
    const container = carouselRef.current;
    const width = container.clientWidth;
    if (width <= 0) return;

    const newIndex = Math.round(container.scrollLeft / width);
    if (newIndex >= 0 && newIndex < history.length && newIndex !== historyIndex) {
      loadHistoryEntry(newIndex, false);
    }
  };

  // PC Mouse Drag-to-Scroll Handlers for Top Carousel (with 10px threshold)
  const handleCarouselMouseDown = (e: React.MouseEvent) => {
    if (!carouselRef.current) return;
    isCarouselMouseDown.current = true;
    isCarouselDraggingState.current = false;
    carouselStartX.current = e.pageX - carouselRef.current.offsetLeft;
    carouselScrollLeft.current = carouselRef.current.scrollLeft;
  };

  const handleCarouselMouseMove = (e: React.MouseEvent) => {
    if (!isCarouselMouseDown.current || !carouselRef.current) return;
    const x = e.pageX - carouselRef.current.offsetLeft;
    const dx = x - carouselStartX.current;

    if (!isCarouselDraggingState.current) {
      if (Math.abs(dx) > 10) {
        isCarouselDraggingState.current = true;
        setIsDraggingCarousel(true);
      } else {
        return;
      }
    }

    e.preventDefault();
    const walk = dx * 1.5;
    carouselRef.current.scrollLeft = carouselScrollLeft.current - walk;
  };

  const handleCarouselMouseUp = () => {
    const wasDragging = isCarouselDraggingState.current;
    isCarouselMouseDown.current = false;
    isCarouselDraggingState.current = false;
    setIsDraggingCarousel(false);

    if (wasDragging && carouselRef.current && history.length > 0) {
      const width = carouselRef.current.clientWidth;
      if (width > 0) {
        const snappedIndex = Math.round(carouselRef.current.scrollLeft / width);
        if (snappedIndex >= 0 && snappedIndex < history.length) {
          loadHistoryEntry(snappedIndex, true);
        }
      }
    }
  };

  const handleCarouselMouseLeave = () => {
    if (isCarouselMouseDown.current) {
      handleCarouselMouseUp();
    }
  };

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

  const loadHistoryEntry = (index: number, shouldScrollCarousel = true) => {
    if (index < 0) return;
    if (index >= history.length) {
      if (playlist) {
        setShowTourCompletedModal(true);
      }
      return;
    }

    setHistoryIndex(index);
    localStorage.setItem('art_free_guide_history_index', String(index));

    const entry = history[index];
    setArtwork(entry.title);
    setArtist(entry.artist);
    setLocation(entry.location || null);
    setYear(entry.year || null);
    setArtistSlug(entry.artistSlug || null);
    setArtworkSlug(entry.artworkSlug || null);

    localStorage.setItem('art_free_guide_draft_artwork', entry.title);
    localStorage.setItem('art_free_guide_draft_artist', entry.artist);

    setResponseShort(entry.short || '');
    setResponseStandard(entry.standard || '');
    setResponseDeep(entry.deep || '');
    const resolvedImg = entry.imageUrl || DEFAULT_IMAGE_URL;
    setImageUrl(resolvedImg);
    setImageError(entry.imageError || !entry.imageUrl);
    setImageLoading(false);
    setSearchQuery(entry.searchQuery);
    setRecommendations(entry.recommendations);

    if (!entry.imageUrl && !entry.imageError) {
      fetchImage(entry.searchQuery || `${entry.title} ${entry.artist}`);
    }

    // Explicit user-triggered audio rule for LINE/Mobile compliance
    setActiveSegmentIndex(-1);
    setIsPlaying(false);
    AudioController.stop();
    stopAmbientSound();

    if (shouldScrollCarousel) {
      scrollToCarouselIndex(index);
    }
  };

  const parseSegments = (text: string) => {
    if (!text) return [];
    // Replace escaped newlines (\\n) with actual newlines for proper parsing
    const processedText = text.replace(/\\n/g, '\n');
    return processedText
      .split('\n\n')
      .flatMap(p => p.split('\n'))
      .map(s => s.trim())
      .filter(s => s.length > 0);
  };

  const getActiveExplanation = () => {
    if (!responseShort && !responseStandard && !responseDeep) return '';
    const parts = [];
    if (responseShort) parts.push(responseShort);
    if (responseStandard) parts.push(responseStandard);
    if (responseDeep) parts.push(responseDeep);
    return parts.join('\n\n');
  };

  const activeText = getActiveExplanation();

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

  useEffect(() => {
    console.log('[SuggestEffect] segments.length:', segments.length);
    if (segments.length > 0) {
      fetchImprovementSuggestions();
    } else {
      setImprovementSuggestions([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments]);

  // Fetch AI-generated improvement suggestions
  const fetchImprovementSuggestions = useCallback(async () => {
    const segs = segments;
    const artName = artwork;
    const artistName = artist;
    console.log('[fetchImprovementSuggestions] called. segs:', segs.length);
    if (segs.length === 0) return;
    try {
      const res = await fetch('/api/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'improve',
          segments: segs.join('\n'),
          artworkQuery: artName,
          artistName: artistName
        })
      });
      const data = await res.json();
      console.log('[fetchImprovementSuggestions] API response:', data);
      // Only update if we actually have suggestions
      if (data.suggestions && Array.isArray(data.suggestions) && data.suggestions.length > 0) {
        console.log('[fetchImprovementSuggestions] calling setImprovementSuggestions with', data.suggestions.length, 'items');
        setImprovementSuggestions(data.suggestions);
        // debug: verify after state update
        setTimeout(() => {
          // eslint-disable-next-line no-console
          console.log('[fetchImprovementSuggestions] updated state size:', data.suggestions.length);
        }, 0);
      }
    } catch (e) {
      console.error('[fetchImprovementSuggestions] error:', e);
    }
  }, [segments, artwork, artist]);

  useEffect(() => {
    if (activeSegmentIndex >= 0) {
      const el = document.getElementById(`seg-${activeSegmentIndex}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [activeSegmentIndex]);

  useEffect(() => {
    if (isPlaying && activeSegmentIndex >= 0 && activeSegmentIndex < speakableSegments.length) {
      speakSegment(activeSegmentIndex);
    } else if (isPlaying && activeSegmentIndex >= speakableSegments.length && speakableSegments.length > 0) {
      setIsPlaying(false);
      setActiveSegmentIndex(-1);
      stopAmbientSound();

      if (playlist && historyIndex < history.length - 1) {
        setTimeout(() => {
          loadHistoryEntry(historyIndex + 1);
        }, 1500);
      } else if (playlist && historyIndex === history.length - 1) {
        setShowTourCompletedModal(true);
      }
    }
  }, [activeSegmentIndex, isPlaying]);

  const speakSegment = (index: number) => {
    if (!speechSupported) return;
    if (index < 0 || index >= speakableSegments.length) return;

    const rawText = speakableSegments[index];
    const cleanText = rawText
      .replace(/#+\s+/g, '')
      .replace(/[*_`~>]/g, '')
      .replace(/[-\d]+\.\s+/g, '')
      .replace(/\[.*?\]\(.*?\)/g, '')
      .replace(/\[.*?\]/g, '')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/<.*?>/g, '')
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
        setIsPlaying(true);
        if (artwork) {
          startAmbientSound(artwork);
        }
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

  const startAmbientSound = (artworkTitle: string) => {
    setAmbientName(
      artworkTitle.includes('睡蓮') || artworkTitle.includes('モネ')
        ? '水面の揺らぎと森の風'
        : artworkTitle.includes('叫び') || artworkTitle.includes('ゲルニカ')
          ? '深層の心理ドローン'
          : '夜のカフェテラスと温かい灯火'
    );
  };

  // Grab to Scroll handlers for explanation text area with 10px Drag Threshold (Text Selection Preserved)
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    isMouseDownRef.current = true;
    setStartX(e.pageX);
    setStartY(e.pageY);
    setScrollLeft(scrollRef.current.scrollLeft);
    setScrollTop(scrollRef.current.scrollTop);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isMouseDownRef.current || !scrollRef.current) return;
    const dx = e.pageX - startX;
    const dy = e.pageY - startY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (!isDragging) {
      if (dist > 10) {
        setIsDragging(true);
      } else {
        // Below distance threshold: do not scroll and allow standard text selection!
        return;
      }
    }

    e.preventDefault();
    scrollRef.current.scrollLeft = scrollLeft - dx;
    scrollRef.current.scrollTop = scrollTop - dy;
  };

  const handleMouseUp = () => {
    isMouseDownRef.current = false;
    setIsDragging(false);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!scrollRef.current) return;
    isMouseDownRef.current = true;
    setStartX(e.touches[0].pageX);
    setStartY(e.touches[0].pageY);
    setScrollLeft(scrollRef.current.scrollLeft);
    setScrollTop(scrollRef.current.scrollTop);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isMouseDownRef.current || !scrollRef.current) return;
    const dx = e.touches[0].pageX - startX;
    const dy = e.touches[0].pageY - startY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (!isDragging) {
      if (dist > 10) {
        setIsDragging(true);
      } else {
        return;
      }
    }

    scrollRef.current.scrollLeft = scrollLeft - dx;
    scrollRef.current.scrollTop = scrollTop - dy;
  };

  const handleTouchEnd = () => {
    isMouseDownRef.current = false;
    setIsDragging(false);
  };

  const stopAmbientSound = () => {
    setAmbientName(null);
  };

  const fetchAiSuggestions = async (query: string, artistName: string): Promise<ArtworkSuggestion[]> => {
    try {
      const res = await fetch('/api/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artworkQuery: query, artistName })
      });
      const data = await res.json();
      if (data.suggestions && Array.isArray(data.suggestions)) {
        return data.suggestions.map((title: string) => ({
          title,
          artist: artistName || '',
          isAi: true
        }));
      }
    } catch (e) {
      console.error('Failed to fetch AI suggestions:', e);
    }
    return [];
  };

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

      const localMatches = PRESET_ARTWORKS.filter(item =>
        item.title.toLowerCase().includes(artwork.toLowerCase())
      ).map(item => ({ ...item, isAi: false }));

      let apiSuggestions: ArtworkSuggestion[] = [];
      try {
        const url = `https://ja.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(artwork)}&limit=4&namespace=0&format=json&origin=*`;
        const res = await fetch(url, {
          headers: {
            'Api-User-Agent': 'ArtFreeGuide/1.0 (https://art-free-guide-trial.taira-sakakibara.workers.dev; contact: taira.sakakibara@gmail.com)'
          }
        });
        const data = await res.json();
        const apiTitles: string[] = data[1] || [];

        apiSuggestions = apiTitles
          .filter(title => !localMatches.some(m => m.title === title))
          .map(title => ({ title, artist: artist || '', isAi: false }));
      } catch (error) {
        console.error('Artwork suggest error:', error);
      }

      let aiSuggestions: ArtworkSuggestion[] = [];
      if (artwork.trim().length >= 1) {
        aiSuggestions = await fetchAiSuggestions(artwork, artist);
      }

      const merged = [...aiSuggestions, ...localMatches, ...apiSuggestions];
      const uniqueMap = new Map<string, ArtworkSuggestion>();
      merged.forEach(item => {
        const key = item.title.trim().toLowerCase();
        if (!uniqueMap.has(key)) {
          uniqueMap.set(key, item);
        } else if (item.isAi) {
          uniqueMap.set(key, item);
        }
      });
      const finalSuggestions = Array.from(uniqueMap.values());

      setArtworkSuggestions(finalSuggestions);
      setSuggestCache(prev => ({ ...prev, [cacheKey]: finalSuggestions }));
    }, 450);

    return () => clearTimeout(handler);
  }, [artwork, artist]);

  useEffect(() => {
    if (!artist.trim()) {
      setArtistSuggestions([]);
      return;
    }

    const handler = setTimeout(async () => {
      const localMatches = PRESET_ARTISTS.filter(name =>
        name.toLowerCase().includes(artist.toLowerCase())
      );

      try {
        const url = `https://ja.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(artist)}&limit=6&namespace=0&format=json&origin=*`;
        const res = await fetch(url, {
          headers: {
            'Api-User-Agent': 'ArtFreeGuide/1.0 (https://art-free-guide-trial.taira-sakakibara.workers.dev; contact: taira.sakakibara@gmail.com)'
          }
        });
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

  const handleArtworkKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
        selectArtworkSuggestion(artworkSuggestions[focusedArtworkIndex]);
      }
    } else if (e.key === 'Escape') {
      setShowArtworkSuggestions(false);
    }
  };

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

  const selectArtworkSuggestion = (suggestion: ArtworkSuggestion) => {
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

    generateGuide(suggestion.title, targetArtist);
  };

  const selectArtistSuggestion = (name: string) => {
    setArtist(name);
    localStorage.setItem('art_free_guide_draft_artist', name);
    setShowArtistSuggestions(false);
    setFocusedArtistIndex(-1);
  };

  const fetchImage = async (query: string, cacheKey?: string) => {
    const currentUrl = query;
    setImageLoading(true);
    console.log("[IMG-DEBUG] Loading started... URL:", currentUrl);
    setImageError(false);
    setImageUrl(null);
    setSearchQuery(query);

    const blacklists = [/SD_/i, /Rhinoceros/i, /parody/i, /meme/i, /stock_price/i, /\.pdf/i, /\.djvu/i, /cartoon/i, /ai_generated/i];

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=10&prop=imageinfo&iiprop=url|mime&iiurlwidth=800&format=json&origin=*`;
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Api-User-Agent': 'ArtFreeGuide/1.0 (https://art-free-guide-trial.taira-sakakibara.workers.dev; contact: taira.sakakibara@gmail.com)'
        }
      });
      const data = await res.json();

      let thumbUrl: string | null = null;
      if (data.query && data.query.pages) {
        const pages = Object.values(data.query.pages) as any[];
        for (const page of pages) {
          if (!page.imageinfo || page.imageinfo.length === 0) continue;
          const imgInfo = page.imageinfo[0];
          const candUrl = imgInfo.thumburl || imgInfo.url || '';
          const mime = imgInfo.mime || '';
          const title = page.title || '';

          if (mime.includes('pdf') || mime.includes('djvu') || mime.includes('audio') || mime.includes('video')) continue;
          const isBlacklisted = blacklists.some(p => p.test(candUrl) || p.test(title));
          if (!isBlacklisted) {
            thumbUrl = candUrl;
            break;
          }
        }
      }

      const resolvedUrl = thumbUrl || DEFAULT_IMAGE_URL;
      setImageUrl(resolvedUrl);
      setImageError(!thumbUrl);
      if (cacheKey) {
        setGuideCache(prev => {
          if (prev[cacheKey]) {
            return {
              ...prev,
              [cacheKey]: { ...prev[cacheKey], imageUrl: resolvedUrl, imageError: !thumbUrl }
            };
          }
          return prev;
        });
        const parts = cacheKey.split('::');
        if (parts.length === 2) {
          updateHistoryEntryByArtwork(parts[0], parts[1], { imageUrl: resolvedUrl, imageError: !thumbUrl });
        }
      } else {
        setHistory(prev => {
          const copy = [...prev];
          if (copy.length > 0) {
            const targetIdx = historyIndex >= 0 && historyIndex < copy.length ? historyIndex : 0;
            copy[targetIdx] = { ...copy[targetIdx], imageUrl: resolvedUrl, imageError: !thumbUrl };
          }
          return copy;
        });
      }
    } catch (error) {
      console.error('Wikimedia fetch error:', error);
      setImageUrl(DEFAULT_IMAGE_URL);
      setImageError(true);
      if (cacheKey) {
        setGuideCache(prev => {
          if (prev[cacheKey]) {
            return {
              ...prev,
              [cacheKey]: { ...prev[cacheKey], imageUrl: DEFAULT_IMAGE_URL, imageError: true }
            };
          }
          return prev;
        });
        const parts = cacheKey.split('::');
        if (parts.length === 2) {
          updateHistoryEntryByArtwork(parts[0], parts[1], { imageUrl: DEFAULT_IMAGE_URL, imageError: true });
        }
      } else {
        setHistory(prev => {
          const copy = [...prev];
          if (copy.length > 0) {
            const targetIdx = historyIndex >= 0 && historyIndex < copy.length ? historyIndex : 0;
            copy[targetIdx] = { ...copy[targetIdx], imageUrl: DEFAULT_IMAGE_URL, imageError: true };
          }
          return copy;
        });
      }
    } finally {
      clearTimeout(timeoutId);
      setImageLoading(false);
    }
  };

  const fetchRecommendationImages = async (recs: Recommendation[], targetArtwork: string, targetArtist: string) => {
    const blacklists = [/SD_/i, /Rhinoceros/i, /parody/i, /meme/i, /stock_price/i, /\.pdf/i, /\.djvu/i, /cartoon/i, /ai_generated/i];

    recs.forEach(async (rec, index) => {
      const query = `${rec.title} ${rec.artist}`.trim();
      try {
        const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=10&prop=imageinfo&iiprop=url|mime&iiurlwidth=300&format=json&origin=*`;
        const res = await fetch(url, {
          headers: {
            'Api-User-Agent': 'ArtFreeGuide/1.0 (https://art-free-guide-trial.taira-sakakibara.workers.dev; contact: taira.sakakibara@gmail.com)'
          }
        });
        const data = await res.json();

        let imgUrl: string | null = null;
        if (data.query && data.query.pages) {
          const pages = Object.values(data.query.pages) as any[];
          for (const page of pages) {
            if (!page.imageinfo || page.imageinfo.length === 0) continue;
            const imgInfo = page.imageinfo[0];
            const candUrl = imgInfo.thumburl || imgInfo.url || '';
            const mime = imgInfo.mime || '';
            const title = page.title || '';

            if (mime.includes('pdf') || mime.includes('djvu') || mime.includes('audio') || mime.includes('video')) continue;
            const isBlacklisted = blacklists.some(p => p.test(candUrl) || p.test(title));
            if (!isBlacklisted) {
              imgUrl = candUrl;
              break;
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
    customMode?: 'short' | 'standard' | 'deep'
  ) => {
    const targetArtwork = customArtwork ?? artwork;
    const targetArtist = customArtist ?? artist;

    if (!targetArtwork.trim()) return;

    if (customArtwork) {
      setArtwork(customArtwork);
      localStorage.setItem('art_free_guide_draft_artwork', customArtwork);
    }
    if (customArtist !== undefined) {
      setArtist(customArtist);
      localStorage.setItem('art_free_guide_draft_artist', customArtist);
    }

    if (typeof window !== 'undefined') {
      AudioController.forceUnlock();
    }
    if (speechSupported) {
      AudioController.stop();
      setIsPlaying(false);
      stopAmbientSound();
    }

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

    if (guideCache[cacheKey]) {
      const cached = guideCache[cacheKey];
      setLocation(cached.location || null);
      setYear(cached.year || null);
      setResponseShort(cached.short);
      setResponseStandard(cached.standard);
      setResponseDeep(cached.deep);
      setExplanationMode(targetMode);
      setImageUrl(cached.imageUrl);
      setImageError(cached.imageError);
      setSearchQuery(cached.searchQuery);
      setRecommendations(cached.recommendations);
      setArtistSlug(cached.artistSlug || null);
      setArtworkSlug(cached.artworkSlug || null);

      setActiveSegmentIndex(-1);
      setIsPlaying(false);

      const idx = history.findIndex(
        h => h.title.trim().toLowerCase() === targetArtwork.trim().toLowerCase() &&
          (h.artist || '').trim().toLowerCase() === (targetArtist || '').trim().toLowerCase()
      );
      if (idx !== -1) {
        setHistoryIndex(idx);
        localStorage.setItem('art_free_guide_history_index', String(idx));
        scrollToCarouselIndex(idx);
      }

      setShowInputDrawer(false);
      return;
    }

    setLoading(true);
    setResponseShort('');
    setResponseStandard('');
    setResponseDeep('');
    setLocation(null);
    setYear(null);
    setExplanationMode(targetMode);
    setActiveSegmentIndex(-1);
    setImageUrl(null);
    setImageError(false);
    setRecommendations([]);
    setCurrentArtworkId(undefined);
    setCurrentImageId(undefined);
    setArtistSlug(null);
    setArtworkSlug(null);

    try {
      const guideRes = await fetch(`/api/guide?work=${encodeURIComponent(targetArtwork)}&artist=${encodeURIComponent(targetArtist)}`);
      if (guideRes.ok) {
        const guideData = await guideRes.json();
        if (guideData && guideData.short) {
          setLocation(guideData.location || null);
          setYear(guideData.year || null);
          setResponseShort(guideData.short || '');
          setResponseStandard(guideData.standard || '');
          setResponseDeep(guideData.deep || '');
          setCurrentArtworkId(guideData.id);
          setArtistSlug(guideData.artist_slug || null);
          setArtworkSlug(guideData.artwork_slug || null);

          if (guideData.images && guideData.images.length > 0) {
            setCurrentImageId(guideData.images[0].id);
            setImageUrl(guideData.images[0].url);
          }

          let recs: Recommendation[] = [];
          if (guideData.recommendations && Array.isArray(guideData.recommendations)) {
            recs = guideData.recommendations.map((r: any) => ({
              title: r.title,
              artist: r.artist,
              reason: r.reason,
              imageUrl: null,
              imageLoading: true
            }));
            setRecommendations(recs);
            fetchRecommendationImages(recs, targetArtwork, targetArtist);
          }

          setLoading(false);
          setShowInputDrawer(false);

          const newHistoryEntry: HistoryEntry = {
            title: targetArtwork,
            artist: targetArtist,
            location: guideData.location || null,
            year: guideData.year || null,
            short: guideData.short,
            standard: guideData.standard || '',
            deep: guideData.deep || '',
            imageUrl: guideData.images?.[0]?.url || null,
            imageError: false,
            searchQuery: guideData.searchQuery || '',
            recommendations: recs,
            artistSlug: guideData.artist_slug || null,
            artworkSlug: guideData.artwork_slug || null,
            timestamp: new Date().toISOString()
          };

          setHistory(prev => {
            const existingIndex = prev.findIndex(
              entry =>
                entry.title.trim().toLowerCase() === targetArtwork.trim().toLowerCase() &&
                (entry.artist || '').trim().toLowerCase() === (targetArtist || '').trim().toLowerCase()
            );
            let updated: HistoryEntry[];
            let newIndex = 0;
            if (existingIndex !== -1) {
              updated = [...prev];
              updated[existingIndex] = newHistoryEntry;
              newIndex = existingIndex;
            } else {
              updated = [...prev, newHistoryEntry];
              newIndex = updated.length - 1;
            }
            setHistoryIndex(newIndex);
            localStorage.setItem('art_free_guide_history', JSON.stringify(updated));
            localStorage.setItem('art_free_guide_history_index', String(newIndex));
            setTimeout(() => scrollToCarouselIndex(newIndex), 100);
            return updated;
          });
          return;
        }
      }
    } catch (e) {
      console.warn('[GuideFetch] /api/guide fetch error, attempting fallback:', e);
    }

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: `作品名: ${targetArtwork}${targetArtist ? `, 作者: ${targetArtist}` : ''}。この作品について詳しく解説してください。`
            }
          ]
        }),
      });

      if (!res.ok) {
        console.error(`Server Error: ${res.status} ${res.statusText}`);
        triggerToast('ガイドの生成に失敗しました。もう一度お試しください');
        return;
      }

      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.error(`Invalid Response Format: Expected JSON but received ${contentType}`);
        triggerToast('ガイドの生成に失敗しました。もう一度お試しください');
        return;
      }

      const data = await res.json();

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
        let queryForImage = `${targetArtwork} ${targetArtist}`.trim();
        let recs: Recommendation[] = [];
        let shortText = '';
        let standardText = '';
        let deepText = '';
        let locVal: string | null = null;
        let yearVal: string | null = null;

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
          locVal = parsed.location || null;
          yearVal = parsed.year || null;
          if (parsed.searchQuery) {
            queryForImage = parsed.searchQuery;
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

        const generatedArtistSlug = slugify(targetArtist);
        const generatedArtworkSlug = slugify(targetArtwork);

        setLocation(locVal);
        setYear(yearVal);
        setResponseShort(shortText);
        setResponseStandard(standardText);
        setResponseDeep(deepText);
        setExplanationMode(targetMode);
        setArtistSlug(generatedArtistSlug || null);
        setArtworkSlug(generatedArtworkSlug || null);

        const newEntry: GuideCacheEntry = {
          location: locVal,
          year: yearVal,
          short: shortText,
          standard: standardText,
          deep: deepText,
          imageUrl: null,
          imageError: false,
          searchQuery: queryForImage,
          recommendations: recs,
          artistSlug: generatedArtistSlug || null,
          artworkSlug: generatedArtworkSlug || null
        };

        setGuideCache(prev => ({ ...prev, [cacheKey]: newEntry }));

        const newHistoryEntry: HistoryEntry = {
          title: targetArtwork,
          artist: targetArtist,
          location: locVal,
          year: yearVal,
          short: shortText,
          standard: standardText,
          deep: deepText,
          imageUrl: null,
          imageError: false,
          searchQuery: queryForImage,
          recommendations: recs,
          artistSlug: generatedArtistSlug || null,
          artworkSlug: generatedArtworkSlug || null,
          timestamp: new Date().toISOString()
        };

        setHistory(prev => {
          const existingIndex = prev.findIndex(
            h => h.title.trim().toLowerCase() === targetArtwork.trim().toLowerCase() &&
              (h.artist || '').trim().toLowerCase() === (targetArtist || '').trim().toLowerCase()
          );
          let newIndex = 0;
          let copy: HistoryEntry[];
          if (existingIndex !== -1) {
            copy = [...prev];
            copy[existingIndex] = { ...newHistoryEntry, imageUrl: prev[existingIndex].imageUrl };
            newIndex = existingIndex;
          } else {
            copy = [...prev, newHistoryEntry];
            newIndex = copy.length - 1;
          }
          setHistoryIndex(newIndex);
          localStorage.setItem('art_free_guide_history', JSON.stringify(copy));
          localStorage.setItem('art_free_guide_history_index', String(newIndex));
          setTimeout(() => scrollToCarouselIndex(newIndex), 100);
          return copy;
        });

        fetchImage(queryForImage, cacheKey);

        if (recs.length > 0) {
          setRecommendations(recs);
          fetchRecommendationImages(recs, targetArtwork, targetArtist);
        }

        setShowInputDrawer(false);
        setActiveSegmentIndex(-1);
        setIsPlaying(false);
      }
    } catch (e: any) {
      console.error('generateGuide error:', e);
      triggerToast('ガイドの生成に失敗しました。もう一度お試しください');
    } finally {
      setLoading(false);
    }
  };

  const handleDeepDive = async () => {
    if (!artwork.trim() || deepDiveLoading) return;

    setDeepDiveLoading(true);
    setIsPlaying(false);
    AudioController.stop();

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

      if (!res.ok) {
        console.error(`Server Error: ${res.status} ${res.statusText}`);
        triggerToast('深掘り情報の取得に失敗しました。もう一度お試しください');
        return;
      }

      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.error(`Invalid Response Format: Expected JSON but received ${contentType}`);
        triggerToast('深掘り情報の取得に失敗しました。もう一度お試しください');
        return;
      }

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
      } catch (e) { }

      const visualHeader = `\n> 🔍 **ディープな深掘りエピソードへようこそ**\n`;
      const updatedDeep = `${responseDeep}\n\n${visualHeader}\n\n${rawText}`;

      setResponseDeep(updatedDeep);
      setExplanationMode('deep');

      updateHistoryEntryByArtwork(artwork, artist, { deep: updatedDeep });

      const prevLength = speakableSegments.length;
      setTimeout(() => {
        setActiveSegmentIndex(prevLength);
        setIsPlaying(true);
      }, 100);

    } catch (e) {
      console.error('handleDeepDive error:', e);
      triggerToast('深掘り情報の取得に失敗しました。もう一度お試しください');
    } finally {
      setDeepDiveLoading(false);
    }
  };

  const startListening = () => {
    if (!recognition) return;
    setIsListening(true);
    setVoiceText('');

    setIsPlaying(false);
    AudioController.stop();
    stopAmbientSound();

    recognition.start();

    recognition.onresult = (event: any) => {
      const resultText = event.results[0][0].transcript;
      setVoiceText(resultText);
      setIsListening(false);
      sendVoiceFeedback(resultText);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };
  };

  const sendVoiceFeedback = async (inputText: string) => {
    if (!inputText.trim()) return;

    setLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: `作品名: ${artwork}について、私は「${inputText}」と感じました。これについて、親身で魅力的な美術館キュレーターとして短く、優しく会話をするように音声ガイドで答えてください。`
            }
          ]
        })
      });

      if (!res.ok) {
        console.error(`Server Error: ${res.status} ${res.statusText}`);
        triggerToast('感想の送信に失敗しました。もう一度お試しください');
        return;
      }

      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.error(`Invalid Response Format: Expected JSON but received ${contentType}`);
        triggerToast('感想の送信に失敗しました。もう一度お試しください');
        return;
      }

      const data = await res.json();

      if (data.error) {
        console.warn('Voice feedback error:', data.error);
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
      } catch (e) { }

      const header = `\n> 🎙️ **あなたへの語りかけ対話**\n`;
      const updatedDeep = `${responseDeep}\n\n${header}\n\n${rawText}`;

      setResponseDeep(updatedDeep);
      setExplanationMode('deep');

      updateHistoryEntryByArtwork(artwork, artist, { deep: updatedDeep });

      const prevLength = speakableSegments.length;
      setTimeout(() => {
        setActiveSegmentIndex(prevLength);
        setIsPlaying(true);
      }, 100);

    } catch (e) {
      console.error('sendVoiceFeedback error:', e);
      triggerToast('感想の送信に失敗しました。もう一度お試しください');
    } finally {
      setLoading(false);
    }
  };

  const handlePlayPause = () => {
    AudioController.forceUnlock();

    if (speakableSegments.length === 0) {
      return;
    }

    if (isPlaying) {
      setIsPlaying(false);
      AudioController.stop();
      stopAmbientSound();
    } else {
      const startIdx = (activeSegmentIndex === -1 || activeSegmentIndex >= speakableSegments.length)
        ? 0
        : activeSegmentIndex;

      setActiveSegmentIndex(startIdx);
      setIsPlaying(true);
      if (artwork) {
        startAmbientSound(artwork);
      }
      speakSegment(startIdx);
    }
  };

  const handleMainAction = async () => {
    if (inputValue.trim()) {
      const userMessage = inputValue.trim();
      setInputValue('');
      setConversationLog(prev => [...prev, { role: 'user', content: userMessage }]);
      setChatLoading(true);

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: userMessage,
            artworkId: currentArtworkId,
            artworkTitle: artwork,
            artistName: artist,
            history: conversationLog
          })
        });

        if (!res.ok) throw new Error(`Server Error: ${res.status}`);
        const data = await res.json();

        if (data.reply) {
          setConversationLog(prev => [...prev, { role: 'assistant', content: data.reply }]);
          // Update the currently displayed explanation with the improved explanation
          const processedReply = data.reply.replace(/\\n/g, '\n');
          if (explanationMode === 'short') {
            setResponseShort(processedReply);
          } else if (explanationMode === 'standard') {
            setResponseStandard(processedReply);
          } else if (explanationMode === 'deep') {
            setResponseDeep(processedReply);
          }
        }
      } catch (e: any) {
        console.error('Chat Error:', e);
        triggerToast('メッセージの送信に失敗しました');
      } finally {
        setChatLoading(false);
      }
    } else {
      handlePlayPause();
    }
  };

  const handleSkipForward = () => {
    AudioController.clearQueue();
    if (activeSegmentIndex < speakableSegments.length - 1) {
      setActiveSegmentIndex(prev => prev + 1);
    } else if (playlist && historyIndex < history.length - 1) {
      loadHistoryEntry(historyIndex + 1);
    } else if (playlist && historyIndex === history.length - 1) {
      setShowTourCompletedModal(true);
    }
  };

  const handleSkipBackward = () => {
    AudioController.clearQueue();
    if (activeSegmentIndex > 0) {
      setActiveSegmentIndex(prev => prev - 1);
    } else if (playlist && historyIndex > 0) {
      loadHistoryEntry(historyIndex - 1);
    }
  };

  const handleShare = async () => {
    if (typeof window === 'undefined') return;

    let canonicalShareUrl = window.location.href;
    if (playlist) {
      canonicalShareUrl = `${window.location.origin}/playlist/${playlist.slug || playlist.id}`;
    } else {
      const validArtistSlug = (artistSlug && artistSlug !== 'artist') ? artistSlug : slugify(artist);
      const validArtworkSlug = (artworkSlug && artworkSlug !== 'artwork') ? artworkSlug : slugify(artwork);
      if (validArtistSlug && validArtworkSlug) {
        canonicalShareUrl = `${window.location.origin}/art/${validArtistSlug}/${validArtworkSlug}`;
      }
    }

    const shareData = {
      title: playlist ? `ArtFreeGuide - ${playlist.name}` : `ArtFreeGuide - ${artwork}`,
      text: playlist ? `「${playlist.name}」音声ガイドツアーを聴いてみて！` : `「${artwork}」${artist ? ` (${artist})` : ''}の専属音声ガイドを聴いてみて！`,
      url: canonicalShareUrl
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        triggerToast('共有メニューを起動しました');
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.warn('Native share failed:', err);
          copyToClipboard(canonicalShareUrl);
        }
      }
    } else {
      copyToClipboard(canonicalShareUrl);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        triggerToast('共有URLをコピーしました！');
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

  const renderInputForm = () => {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-sans">
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
              onKeyDown={handleArtworkKeyDown}
              onFocus={() => setShowArtworkSuggestions(true)}
              onBlur={() => setTimeout(() => setShowArtworkSuggestions(false), 200)}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-3.5 text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 transition-all font-medium text-sm"
              autoComplete="off"
            />
            {showArtworkSuggestions && artworkSuggestions.length > 0 && (
              <ul className="absolute z-50 w-full mt-1 bg-slate-950/95 border border-slate-850 rounded-xl overflow-hidden shadow-2xl backdrop-blur-xl max-h-48 overflow-y-auto divide-y divide-slate-800/40">
                {artworkSuggestions.map((suggestion, index) => (
                  <li
                    key={index}
                    onMouseDown={() => selectArtworkSuggestion(suggestion)}
                    className={`px-4 py-3.5 cursor-pointer text-sm transition-all flex items-center justify-between font-sans ${focusedArtworkIndex === index
                        ? 'bg-teal-500/10 text-teal-400 font-bold'
                        : 'hover:bg-slate-900/80 text-slate-300'
                      }`}
                  >
                    <div className="text-left flex items-center gap-2">
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
              <ul className="absolute z-50 w-full mt-1 bg-slate-950/95 border border-slate-850 rounded-xl overflow-hidden shadow-2xl backdrop-blur-xl max-h-40 overflow-y-auto divide-y divide-slate-800/40">
                {artistSuggestions.map((name, index) => (
                  <li
                    key={index}
                    onMouseDown={() => selectArtistSuggestion(name)}
                    className={`px-4 py-3 cursor-pointer text-sm transition-all text-left ${focusedArtistIndex === index
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
          onClick={() => generateGuide()}
          disabled={loading || !artwork.trim()}
          className="w-full bg-gradient-to-r from-teal-500 to-blue-600 hover:from-teal-400 hover:to-blue-500 text-slate-950 font-bold py-3.5 px-6 rounded-xl shadow-lg shadow-teal-500/10 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 group text-sm font-sans"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-5 w-5 text-slate-950" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>キュレーターがガイドを準備中...</span>
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

      {showToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-55 bg-teal-500 text-slate-950 font-bold px-5 py-2.5 rounded-full shadow-2xl text-xs font-sans animate-fade-in border border-teal-400/20 select-none">
          {toastMessage}
        </div>
      )}

      {/* Top Fixed Layer with Native Touch & PC Mouse Drag-to-Scroll Horizontal Carousel */}
      {(responseShort || loading) && (
        <div className="fixed top-0 left-0 right-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-900 px-4 py-2.5 flex flex-col items-center select-none shadow-md">
          <div className="flex items-center justify-between w-full max-w-md mb-2">
            {/* Left: 履歴 / ツアー順 ボタン */}
            <button
              onClick={() => setShowHistorySidebar(true)}
              className="text-slate-400 hover:text-teal-400 transition-colors text-xs font-sans font-semibold flex items-center gap-1 bg-slate-900/60 border border-slate-800 px-3 py-1.5 rounded-lg relative shrink-0"
            >
              <span>📜</span> <span>{playlist ? 'ツアー順' : '履歴'}</span>
              {history.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-teal-500 text-slate-950 font-bold font-mono rounded-full w-4 h-4 flex items-center justify-center text-[9px]">
                  {history.length}
                </span>
              )}
            </button>

            {/* Center: Title / Logo */}
            <h1 className="text-lg font-extrabold tracking-tight bg-gradient-to-r from-teal-400 via-emerald-400 to-blue-500 bg-clip-text text-transparent font-sans">
              ArtFreeGuide
            </h1>

            {/* Right: 作品変更 ボタン / Tour Badge */}
            {playlist ? (
              <div className="flex items-center gap-1.5 bg-teal-500/10 border border-teal-500/30 text-teal-400 px-3 py-1 rounded-full text-xs font-bold font-sans animate-pulse shrink-0">
                <span>🏛️</span>
                <span className="truncate max-w-[100px] sm:max-w-[140px]">{playlist.name}</span>
                <span className="text-[10px] bg-teal-400 text-slate-950 px-1.5 py-0.2 rounded-full font-mono font-black ml-1">
                  {historyIndex >= 0 ? historyIndex + 1 : 1} / {history.length}
                </span>
              </div>
            ) : (
              <button
                onClick={() => setShowInputDrawer(true)}
                className="text-slate-400 hover:text-teal-400 transition-colors text-xs font-sans font-semibold flex items-center gap-1 bg-slate-900/60 border border-slate-800 px-3 py-1.5 rounded-lg shrink-0"
              >
                <span>🎨</span> <span>作品変更</span>
              </button>
            )}
          </div>

          {/* Physical Scroll Snap Carousel Container with PC Drag-to-Scroll Support */}
          <div className="w-full max-w-md relative select-none">
            <div
              ref={carouselRef}
              onScroll={handleCarouselScroll}
              onMouseDown={handleCarouselMouseDown}
              onMouseMove={handleCarouselMouseMove}
              onMouseUp={handleCarouselMouseUp}
              onMouseLeave={handleCarouselMouseLeave}
              className={`w-full flex overflow-x-auto snap-x snap-mandatory scroll-smooth rounded-2xl border border-slate-800/80 bg-slate-900 shadow-inner overflow-y-hidden ${isDraggingCarousel ? 'cursor-grabbing select-none' : 'cursor-grab'
                }`}
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {history.length > 0 ? (
                history.map((entry, idx) => (
                  <div
                    key={idx}
                    className="w-full shrink-0 snap-center flex flex-col items-center justify-center h-36 sm:h-44 relative bg-slate-900"
                  >
                    {entry.imageUrl ? (
                      <img
                        src={entry.imageUrl}
                        alt={entry.title}
                        draggable={false}
                        onDragStart={(e) => e.preventDefault()}
                        onLoad={() => {
                          console.log("[IMG-DEBUG] onLoad fired! Loading = false");
                          setImageLoading(false);
                        }}
                        onError={() => {
                          console.log("[IMG-DEBUG] onError fired! Loading = false, Error = true");
                          setImageLoading(false);
                          setImageError(true);
                        }}
                        className="w-full h-full object-contain transition-all duration-500 ease-out select-none pointer-events-none"
                      />
                    ) : (
                      <img
                        src={DEFAULT_IMAGE_URL}
                        alt={entry.title}
                        draggable={false}
                        onDragStart={(e) => e.preventDefault()}
                        onLoad={() => setImageLoading(false)}
                        className="w-full h-full object-contain transition-all duration-500 ease-out select-none pointer-events-none opacity-80"
                      />
                    )}

                    {/* Page Flip Slide Counter Indicator */}
                    {history.length > 1 && (
                      <div className="absolute bottom-2 right-2 bg-slate-950/80 backdrop-blur-md border border-slate-800 text-[9px] text-slate-300 px-2.5 py-0.5 rounded-full font-mono shadow-md flex items-center gap-1.5 pointer-events-none select-none">
                        <span className="text-teal-400">❖</span>
                        <span>{idx + 1} / {history.length}</span>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="w-full shrink-0 snap-center flex flex-col items-center justify-center h-36 sm:h-44 relative bg-slate-900">
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
                  {imageUrl && (
                    <img
                      src={imageUrl}
                      alt={artwork}
                      draggable={false}
                      onDragStart={(e) => e.preventDefault()}
                      onLoad={() => {
                        console.log("[IMG-DEBUG] onLoad fired! Loading = false");
                        setImageLoading(false);
                      }}
                      onError={() => {
                        console.log("[IMG-DEBUG] onError fired! Loading = false, Error = true");
                        setImageLoading(false);
                        setImageError(true);
                      }}
                      className="w-full h-full object-contain transition-all duration-700 ease-out select-none pointer-events-none"
                    />
                  )}
                  {imageError && !imageUrl && !imageLoading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600 gap-1 p-2 text-center select-none bg-slate-900/20">
                      <span className="text-2xl">🖼️</span>
                      <p className="text-[11px] font-semibold text-slate-500 font-sans">作品画像を取得できませんでした</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className={`w-full max-w-2xl px-4 mx-auto ${responseShort || loading ? 'pt-64 sm:pt-72 pb-24' : 'py-12 md:py-20 flex flex-col items-center justify-center min-h-[calc(100vh-80px)]'}`}>

        {!responseShort && !loading && (
          <div className="w-full space-y-8 animate-fade-in flex flex-col items-center">
            <div className="text-center mb-4 space-y-3">
              <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight bg-gradient-to-r from-teal-400 via-emerald-400 to-blue-500 bg-clip-text text-transparent drop-shadow-sm select-none font-sans">
                ArtFreeGuide
              </h1>
              <p className="text-slate-400 text-base md:text-lg font-medium max-w-xl mx-auto font-sans leading-relaxed">
                専属キュレーターが贈る、あなたのための特別な音声ガイド。美術作品をもっと深く、もっと身近に。
              </p>
              <div className="flex justify-center pt-2">
                <button
                  onClick={() => setShowHistorySidebar(true)}
                  className="bg-slate-900/60 border border-slate-800 hover:bg-slate-900 hover:border-teal-500/40 text-slate-350 hover:text-teal-400 px-4 py-2 rounded-xl text-xs font-bold active:scale-95 transition-all flex items-center gap-1.5 shadow-md font-sans"
                >
                  <span>📜</span>
                  <span>閲覧履歴を見る ({history.length})</span>
                </button>
              </div>
            </div>

            <div className="w-full bg-slate-900/40 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-6 md:p-8 shadow-2xl relative">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-teal-500 via-emerald-500 to-blue-500 opacity-60"></div>
              {renderInputForm()}
            </div>
          </div>
        )}

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
          </div>
        )}

        {responseShort && (
          <div className="space-y-5 w-full animate-fade-in">
            {/* Museum Header & Metadata Banner (Title, Artist, Location, Year) */}
            <div className="flex flex-col pb-2.5 border-b border-slate-900/60 select-none">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-200 font-bold truncate pr-2 font-sans">
                  🎧 {artwork} {artist ? `(${artist})` : ''}
                </span>
                {ambientName && (
                  <div className="flex items-center gap-1 bg-teal-950/40 border border-teal-900 rounded-full px-2.5 py-0.5 text-[9px] text-teal-400 font-mono animate-pulse shrink-0">
                    <span>🎵</span>
                    <span>{ambientName}</span>
                  </div>
                )}
              </div>

              {(location || year) && (
                <div className="text-[10px] text-slate-400 font-sans tracking-wide mt-1 flex items-center gap-1.5">
                  <span className="text-teal-400/80">🏛️</span>
                  <span className="truncate flex items-center gap-1">
                    {location ? (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-teal-300 hover:underline transition-colors inline-flex items-center gap-0.5 font-medium text-slate-350"
                        title={`${location}をGoogle Mapで検索`}
                      >
                        <span className="truncate">{location}</span>
                        <span className="text-[9px] text-teal-400/80">↗</span>
                      </a>
                    ) : null}
                    {location && year ? <span className="text-slate-600 px-0.5">•</span> : null}
                    {year ? <span>{year}</span> : null}
                  </span>
                </div>
              )}
            </div>


            {/* Highlights Segment Box */}
            <div
              ref={scrollRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              className={`bg-slate-900/20 border border-slate-900 rounded-2xl p-4 md:p-6 max-h-[380px] overflow-y-auto space-y-3 font-serif leading-relaxed text-base selection:bg-teal-500/20 shadow-inner ${isDragging ? 'cursor-grabbing select-none' : 'cursor-text select-text'
                }`}
            >
              {/* 会話ログ: キュレーターとの対話が解説に追加される */}
              {conversationLog.length > 0 && (
                <div className="border border-teal-500/30 rounded-xl p-3 space-y-2 bg-teal-950/20 mb-2">
                  <div className="text-[10px] text-teal-400 font-bold tracking-wider mb-2">💬 キュレーターとの対話</div>
                  {conversationLog.map((msg, i) => (
                    <div key={i} className={`text-sm ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                      <div className={`inline-block max-w-[85%] p-2 rounded-lg text-xs ${msg.role === 'user'
                          ? 'bg-teal-500/20 text-teal-200'
                          : 'bg-slate-800 text-slate-200'
                        }`}>
                        <span className="font-bold text-[9px] mr-1">{msg.role === 'user' ? 'あなた' : 'キュレーター'}</span>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
                      className={`transition-all duration-500 rounded-xl px-3 py-2 border-l-4 font-sans text-sm md:text-base leading-relaxed text-slate-200 ${isActive
                          ? 'bg-teal-500/10 border-teal-500 pl-4 border-y border-r border-teal-500/20 shadow-sm'
                          : 'border-transparent hover:bg-slate-900/20 hover:text-slate-100'
                        }`}
                    >
                      <ReactMarkdown
                        components={{
                          p: ({ node, ...props }) => <p className="m-0 leading-relaxed font-sans" {...props} />,
                          strong: ({ node, ...props }) => <strong className="font-extrabold text-teal-300 bg-teal-500/10 px-1 py-0.5 rounded font-sans" {...props} />,
                          em: ({ node, ...props }) => <em className="italic text-teal-200/90 font-serif" {...props} />,
                          h1: ({ node, ...props }) => <h1 className="text-lg md:text-xl font-black text-teal-400 font-sans my-1" {...props} />,
                          h2: ({ node, ...props }) => <h2 className="text-base md:text-lg font-bold text-slate-100 font-sans my-1" {...props} />,
                          h3: ({ node, ...props }) => <h3 className="text-sm md:text-base font-bold text-teal-300 font-sans my-1" {...props} />
                        }}
                      >
                        {seg}
                      </ReactMarkdown>
                    </div>
                  );
                })
              ) : (
                <div className="text-slate-350 font-sans">解説を読み込み中...</div>
              )}
            </div>

            {/* AI Chat Input Area - キュレーターに質問 */}
            <div className="w-full max-w-sm mx-auto mt-3 space-y-2">
              <div className="flex gap-2">
                <textarea
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="質問する or 改善点を伝える..."
                  className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 transition-all resize-none h-10"
                />
                <button
                  onClick={handleMainAction}
                  disabled={chatLoading}
                  className="bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold px-3 rounded-xl transition-all active:scale-95 disabled:opacity-50 text-xs"
                >
                  {chatLoading ? '...' : '▶ 送信'}
                </button>
              </div>

              {/* AI-generated improvement suggestions */}
              {improvementSuggestions.length > 0 && (
                <div className="space-y-1.5">
                  {improvementSuggestions.map((suggestion, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        setInputValue(`${suggestion.icon} ${suggestion.message}`);
                        handleMainAction();
                      }}
                      className="w-full text-left text-xs px-3 py-2 bg-teal-950/30 border border-teal-500/20 rounded-lg hover:bg-teal-900/40 hover:border-teal-500/40 transition-all flex items-start gap-2"
                    >
                      <span className="text-sm flex-shrink-0 mt-0.5">{suggestion.icon}</span>
                      <span className="text-teal-300/90 leading-relaxed">{suggestion.message}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>


            {(recognition || explanationMode === 'deep') && (
              <div className="flex flex-wrap items-center justify-center gap-3 select-none pt-1">
                {recognition && (
                  <button
                    onClick={startListening}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5 shadow-md font-sans ${isListening
                        ? 'bg-rose-500 text-white animate-pulse'
                        : 'bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20'
                      }`}
                  >
                    <span>🎙️</span>
                    <span>{isListening ? 'お話し中...' : '感想を声で伝える'}</span>
                  </button>
                )}

                {explanationMode === 'deep' && (
                  <button
                    onClick={handleDeepDive}
                    disabled={deepDiveLoading}
                    className="px-4 py-2 bg-gradient-to-r from-teal-500/10 to-blue-500/10 border border-teal-500/20 hover:bg-teal-500/20 text-teal-300 rounded-xl text-xs font-bold active:scale-95 transition-all flex items-center gap-1.5 shadow-md font-sans disabled:opacity-40"
                  >
                    <span>{deepDiveLoading ? '探究中...' : '🔍 さらなる面白裏話を発掘'}</span>
                  </button>
                )}
              </div>
            )}

            {voiceText && (
              <div className="p-3 bg-slate-950/40 border border-slate-900 rounded-xl text-xs text-slate-400 flex items-start gap-2 select-text font-sans">
                <span className="text-sm">🗣️</span>
                <div>
                  <span className="font-semibold text-slate-300 block mb-0.5">あなたの感想:</span>
                  <p className="italic">「{voiceText}」</p>
                </div>
              </div>
            )}

            {recommendations.length > 0 && (
              <div className="pt-2 space-y-3 select-none">
                <h3 className="text-xs font-bold text-slate-400 tracking-wider uppercase font-sans">
                  💡 次におすすめの作品
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {recommendations.map((rec, index) => (
                    <div
                      key={index}
                      onClick={() => generateGuide(rec.title, rec.artist)}
                      className="bg-slate-900/30 border border-slate-900 hover:border-teal-500/40 hover:bg-slate-900/50 rounded-2xl p-3 flex gap-3 cursor-pointer transition-all duration-300 group shadow-md"
                    >
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

          </div>
        )}
      </div>

      {/* Downward Fixed Ultra-Compact Controller Panel */}
      {responseShort && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-slate-950/95 backdrop-blur-md border-t border-slate-900 px-3 sm:px-6 py-2 shadow-2xl flex items-center justify-between select-none h-16 pb-safe">
          <div className="flex items-center justify-between w-full max-w-md mx-auto px-1 font-sans">

            {/* 1. 再生速度 (倍速設定) */}
            <div className="relative flex justify-center">
              <button
                onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                className="flex flex-col items-center justify-center text-teal-400 hover:text-teal-350 transition-all active:scale-90 px-2"
                title="再生速度を変更"
              >
                <span className="text-sm">⚡</span>
                <span className="text-[9px] font-mono font-bold">{playbackSpeed.toFixed(1)}x</span>
              </button>

              {showSpeedMenu && (
                <div className="absolute bottom-12 left-0 bg-slate-950 border border-slate-850 rounded-2xl p-2 flex flex-col gap-1 shadow-2xl z-50 min-w-[70px] animate-fade-in">
                  {[1.0, 1.2, 1.5, 1.7, 2.0, 2.5].map(sp => (
                    <button
                      key={sp}
                      onClick={() => {
                        setPlaybackSpeed(sp);
                        setShowSpeedMenu(false);
                      }}
                      className={`py-1.5 text-[11px] font-mono font-bold rounded-lg transition-all text-center ${playbackSpeed === sp
                          ? 'bg-teal-500 text-slate-950 font-black'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                        }`}
                    >
                      {sp.toFixed(1)}x
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 2. 前作品 */}
            <button
              onClick={() => loadHistoryEntry(historyIndex - 1)}
              disabled={historyIndex <= 0}
              className="flex flex-col items-center justify-center text-slate-400 hover:text-teal-400 disabled:opacity-20 transition-all px-2 disabled:pointer-events-none"
              title="前の作品"
            >
              <span className="text-sm">⏮️</span>
              <span className="text-[9px] font-semibold">前作品</span>
            </button>

            {/* 3. 次作品 */}
            <button
              onClick={() => loadHistoryEntry(historyIndex + 1)}
              disabled={historyIndex >= history.length - 1 && !playlist}
              className="flex flex-col items-center justify-center text-slate-400 hover:text-teal-400 disabled:opacity-20 transition-all px-2"
              title="次の作品"
            >
              <span className="text-sm">⏭️</span>
              <span className="text-[9px] font-semibold">次作品</span>
            </button>

            {/* 4. 共有 */}
            <button
              onClick={handleShare}
              className="flex flex-col items-center justify-center text-teal-400 hover:text-teal-300 transition-all px-2"
              title="解説を共有"
            >
              <span className="text-sm">📤</span>
              <span className="text-[9px] font-semibold">共有</span>
            </button>

            {/* 5. 再生/一時停止 (最右端) */}
            <button
              onClick={handlePlayPause}
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-300 shadow-xl active:scale-95 relative overflow-hidden shrink-0 ml-auto ${isPlaying
                  ? 'bg-teal-500 text-slate-950 hover:bg-teal-400 hover:shadow-teal-400/20'
                  : 'bg-slate-900 text-teal-400 border border-teal-500/30 hover:border-teal-500'
                }`}
              title={isPlaying ? "一時停止" : "再生"}
            >
              {isPlaying && (
                <span className="absolute inset-0 rounded-full animate-ping bg-teal-500/20 opacity-75"></span>
              )}
              {isPlaying ? (
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4 fill-current translate-x-0.5" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

          </div>
        </div>
      )}

      {/* Tour Completed Modal */}
      {showTourCompletedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 max-w-sm w-full text-center space-y-5 shadow-2xl animate-scale-up">
            <div className="text-5xl animate-bounce">🎉</div>
            <div className="space-y-2">
              <h2 className="text-xl font-black text-slate-100 font-sans">ツアー完走！お疲れ様でした</h2>
              <p className="text-xs text-slate-400 leading-relaxed font-sans">
                『{playlist?.name || '音声ガイドツアー'}』の全作品（{history.length}作品）の解説を最後まで聴き終えました。
              </p>
            </div>

            <div className="pt-2 space-y-2.5 font-sans">
              <button
                onClick={() => {
                  setShowTourCompletedModal(false);
                  loadHistoryEntry(0);
                }}
                className="w-full py-3 bg-gradient-to-r from-teal-500 to-blue-600 hover:from-teal-400 hover:to-blue-500 text-slate-950 font-black rounded-xl text-xs shadow-lg active:scale-95 transition-all"
              >
                🔄 最初からもう一度ツアーを体験する
              </button>

              <button
                onClick={() => {
                  setShowTourCompletedModal(false);
                  setPlaylist(null);
                  window.history.replaceState({}, '', '/');
                }}
                className="w-full py-2.5 bg-slate-950 hover:bg-slate-850 border border-slate-800 text-slate-300 rounded-xl text-xs font-bold active:scale-95 transition-all"
              >
                🔍 別の作品を自由検索する
              </button>
            </div>
          </div>
        </div>
      )}

      {showInputDrawer && (
        <div className="fixed inset-0 z-50 flex items-end justify-center animate-fade-in select-none">
          <div
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            onClick={() => setShowInputDrawer(false)}
          ></div>

          <div className="relative w-full max-w-xl bg-slate-950 border-t border-slate-900 rounded-t-3xl shadow-2xl p-6 md:p-8 animate-slide-up z-10 max-h-[90vh] overflow-y-auto">
            <div className="w-12 h-1 bg-slate-800 rounded-full mx-auto mb-5"></div>

            <div className="flex items-center justify-between mb-6 font-sans">
              <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2">
                <span className="text-teal-400">✦</span> 音声ガイドの作品指定
              </h2>
              <button
                onClick={() => setShowInputDrawer(false)}
                className="text-slate-505 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            {renderInputForm()}
          </div>
        </div>
      )}

      {/* Integrated History & Playlist Pop-up Drawer */}
      <HistoryPlaylistDrawer
        isOpen={showHistorySidebar}
        onClose={() => setShowHistorySidebar(false)}
        history={history}
        historyIndex={historyIndex}
        onSelectHistory={(index) => loadHistoryEntry(index)}
        onClearHistory={() => {
          setHistory([]);
          setHistoryIndex(-1);
          localStorage.removeItem('art_free_guide_history');
          localStorage.removeItem('art_free_guide_history_index');
        }}
        currentPlaylistSlug={playlist?.slug}
        onSelectPlaylist={(slug) => {
          window.location.href = `/playlist/${slug}`;
        }}
      />
    </main>
  );
}
