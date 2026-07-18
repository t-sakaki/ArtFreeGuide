'use client';

import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';

interface ArtworkSuggestion {
  title: string;
  artist: string;
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

  // Autocomplete States
  const [artworkSuggestions, setArtworkSuggestions] = useState<ArtworkSuggestion[]>([]);
  const [showArtworkSuggestions, setShowArtworkSuggestions] = useState(false);
  const [focusedArtworkIndex, setFocusedArtworkIndex] = useState(-1);

  const [artistSuggestions, setArtistSuggestions] = useState<string[]>([]);
  const [showArtistSuggestions, setShowArtistSuggestions] = useState(false);
  const [focusedArtistIndex, setFocusedArtistIndex] = useState(-1);

  // Image State
  const [imageUrl, setImageUrl] = useState<string | null>(null);
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

  // Ambient Sound States
  const [ambientName, setAmbientName] = useState<string | null>(null);

  // Refs for tracking properties in async speech callbacks
  const isPlayingRef = useRef(false);
  const speedRef = useRef(1.5);
  const activeIndexRef = useRef(-1);
  const speakableSegmentsRef = useRef<string[]>([]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
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

            // If draft artwork/artist is empty, fall back to the active history entry
            if (!draftArtwork) setArtwork(entry.title);
            if (!draftArtist) setArtist(entry.artist);

            // Restore output states
            setResponseShort(entry.short || '');
            setResponseStandard(entry.standard || '');
            setResponseDeep(entry.deep || '');
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
  }, []);

  // Save speed when changed
  useEffect(() => {
    localStorage.setItem('art_free_guide_playback_speed', String(playbackSpeed));
  }, [playbackSpeed]);

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

    setResponseShort(entry.short || '');
    setResponseStandard(entry.standard || '');
    setResponseDeep(entry.deep || '');
    setExplanationMode('short');
    setImageUrl(entry.imageUrl);
    setImageError(entry.imageError);
    setSearchQuery(entry.searchQuery);
    setRecommendations(entry.recommendations);

    // Stop speaking immediately on navigation
    setActiveSegmentIndex(-1);
    setIsPlaying(false);
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      stopAmbientSound();
    }
  };

  // SpeechSynthesis and SpeechRecognition Initialization
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      setSpeechSupported(true);
    }

    if (typeof window !== 'undefined') {
      const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognitionClass) {
        const rec = new SpeechRecognitionClass();
        rec.continuous = false;
        rec.interimResults = false;
        rec.lang = 'ja-JP';
        setRecognition(rec);
      }
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.speechSynthesis.cancel();
        stopAmbientSound();
      }
    };
  }, []);

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

  // Trigger speech for active index
  useEffect(() => {
    if (isPlaying && activeSegmentIndex >= 0 && activeSegmentIndex < speakableSegments.length) {
      speakSegment(activeSegmentIndex);
    } else if (isPlaying && activeSegmentIndex >= speakableSegments.length && speakableSegments.length > 0) {
      // Finished speaking
      setIsPlaying(false);
      setActiveSegmentIndex(-1);
      stopAmbientSound();
    }
  }, [activeSegmentIndex, isPlaying]);

  const speakSegment = (index: number) => {
    if (!speechSupported || index < 0 || index >= speakableSegments.length) {
      return;
    }

    window.speechSynthesis.cancel();

    const rawText = speakableSegments[index];
    const cleanText = rawText
      .replace(/#+\s+/g, '')
      .replace(/[*_`~>]/g, '')
      .replace(/[-\d]+\.\s+/g, '')
      .replace(/\[.*?\]/g, '')
      .replace(/\n+/g, ' ')
      .trim();

    if (!cleanText) {
      // Skip empty segments
      setTimeout(() => {
        if (isPlayingRef.current && activeIndexRef.current === index) {
          setActiveSegmentIndex(prev => prev + 1);
        }
      }, 50);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'ja-JP';
    utterance.rate = speedRef.current;

    utterance.onend = () => {
      if (isPlayingRef.current && activeIndexRef.current === index) {
        setActiveSegmentIndex(prev => prev + 1);
      }
    };

    utterance.onerror = (e) => {
      console.warn('SpeechSynthesis error:', e);
      if (isPlayingRef.current && activeIndexRef.current === index) {
        setActiveSegmentIndex(prev => prev + 1);
      }
    };

    window.speechSynthesis.speak(utterance);
  };

  // Start Ambient Soundscape using Web Audio API
  const startAmbientSound = (artworkTitle: string) => {
    try {
      stopAmbientSound(); // Reset previous ambient context

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;

      const ctx = new AudioContextClass();
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0, ctx.currentTime);

      // Frequencies for a warm, relaxing ambient drone
      let frequencies = [110, 165, 220]; // A2, E3, A3
      if (artworkTitle.includes('睡蓮') || artworkTitle.includes('水') || artworkTitle.includes('モネ')) {
        frequencies = [130.81, 196.00, 261.63]; // C3, G3, C4
      } else if (artworkTitle.includes('叫び') || artworkTitle.includes('ゲルニカ') || artworkTitle.includes('ピカソ')) {
        frequencies = [98.00, 146.83, 196.00]; // G2, D3, G3
      }

      const oscs = frequencies.map(freq => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        osc.detune.setValueAtTime((Math.random() - 0.5) * 12, ctx.currentTime);
        osc.connect(gain);
        osc.start();
        return osc;
      });

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(350, ctx.currentTime);

      gain.connect(filter);
      filter.connect(ctx.destination);

      // Fade in ambient hum gently to volume 5%
      gain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 3.0);

      (window as any)._ambientGain = gain;
      (window as any)._ambientCtx = ctx;
      (window as any)._ambientOscs = oscs;

      setAmbientName(
        artworkTitle.includes('睡蓮') || artworkTitle.includes('モネ')
          ? '水面の揺らぎと森の風（432Hz調和音響）'
          : artworkTitle.includes('叫び') || artworkTitle.includes('ゲルニカ')
          ? '深層の心理ドローン（緊張と静寂）'
          : '夜のカフェテラスと温かい灯火（心地よい低音ドローン）'
      );
    } catch (err) {
      console.warn('Web Audio Ambient error:', err);
    }
  };

  // Stop Ambient Soundscape
  const stopAmbientSound = () => {
    const gain = (window as any)._ambientGain;
    const ctx = (window as any)._ambientCtx;
    const oscs = (window as any)._ambientOscs;

    if (gain && ctx) {
      try {
        gain.gain.linearRampToValueAtTime(0.0, ctx.currentTime + 1.0);
        setTimeout(() => {
          if (oscs) oscs.forEach((o: any) => o.stop());
          ctx.close();
        }, 1000);
      } catch (e) {
        console.warn(e);
      }
      (window as any)._ambientGain = null;
      (window as any)._ambientCtx = null;
      (window as any)._ambientOscs = null;
    }
    setAmbientName(null);
  };

  // Debounce Autocomplete Artwork
  useEffect(() => {
    if (!artwork.trim()) {
      setArtworkSuggestions([]);
      return;
    }

    const handler = setTimeout(async () => {
      // Local Filter
      const localMatches = PRESET_ARTWORKS.filter(item =>
        item.title.toLowerCase().includes(artwork.toLowerCase())
      );

      // Wikipedia API Search
      try {
        const url = `https://ja.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(artwork)}&limit=6&namespace=0&format=json&origin=*`;
        const res = await fetch(url);
        const data = await res.json();
        const apiTitles: string[] = data[1] || [];

        // Map API results
        const apiSuggestions = apiTitles
          .filter(title => !localMatches.some(m => m.title === title))
          .map(title => ({ title, artist: '' }));

        setArtworkSuggestions([...localMatches, ...apiSuggestions]);
      } catch (error) {
        console.error('Artwork suggest error:', error);
        setArtworkSuggestions(localMatches);
      }
    }, 300);

    return () => clearTimeout(handler);
  }, [artwork]);

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

  const selectArtworkSuggestion = (suggestion: ArtworkSuggestion) => {
    setArtwork(suggestion.title);
    localStorage.setItem('art_free_guide_draft_artwork', suggestion.title);
    if (suggestion.artist) {
      setArtist(suggestion.artist);
      localStorage.setItem('art_free_guide_draft_artist', suggestion.artist);
    }
    setShowArtworkSuggestions(false);
    setFocusedArtworkIndex(-1);
  };

  const selectArtistSuggestion = (name: string) => {
    setArtist(name);
    localStorage.setItem('art_free_guide_draft_artist', name);
    setShowArtistSuggestions(false);
    setFocusedArtistIndex(-1);
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

  const fetchImage = async (query: string, cacheKey?: string) => {
    setImageLoading(true);
    setImageError(false);
    setImageUrl(null);
    setSearchQuery(query);

    try {
      const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&prop=imageinfo&iiprop=url&iiurlwidth=800&format=json&origin=*`;
      const res = await fetch(url);
      const data = await res.json();

      let thumbUrl: string | null = null;
      if (data.query && data.query.pages) {
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

  const generateGuide = async (customArtwork?: string, customArtist?: string) => {
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

    if (speechSupported) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      stopAmbientSound();
    }

    const cacheKey = `${targetArtwork.trim().toLowerCase()}::${targetArtist.trim().toLowerCase()}`;

    // CHECK CLIENT-SIDE CACHE
    if (guideCache[cacheKey]) {
      const cached = guideCache[cacheKey];
      setResponseShort(cached.short);
      setResponseStandard(cached.standard);
      setResponseDeep(cached.deep);
      setExplanationMode('short');
      setImageUrl(cached.imageUrl);
      setImageError(cached.imageError);
      setSearchQuery(cached.searchQuery);
      setRecommendations(cached.recommendations);
      
      // Auto Play back from cache
      setActiveSegmentIndex(0);
      setIsPlaying(true);
      startAmbientSound(targetArtwork);

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
    setExplanationMode('short');
    setActiveSegmentIndex(-1);
    setImageUrl(null);
    setImageError(false);
    setRecommendations([]);

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

        setResponseShort(shortText);
        setResponseStandard(standardText);
        setResponseDeep(deepText);
        setExplanationMode('short');

        // Store primary metadata in cache
        const newEntry: GuideCacheEntry = {
          short: shortText,
          standard: standardText,
          deep: deepText,
          imageUrl: null,
          imageError: false,
          searchQuery: queryForImage,
          recommendations: recs
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
          timestamp: new Date().toISOString()
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
        fetchImage(queryForImage, cacheKey);
        startAmbientSound(targetArtwork);

        if (recs.length > 0) {
          setRecommendations(recs);
          fetchRecommendationImages(recs, targetArtwork, targetArtist);
        }

        // Close input drawer
        setShowInputDrawer(false);

        // Auto-play
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
    window.speechSynthesis.cancel();

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

  // Interactive Voice feedback Mode
  const startListening = () => {
    if (!recognition) return;
    setIsListening(true);
    setVoiceText('');
    
    // Pause BGM & Guide Synthesis
    window.speechSynthesis.cancel();
    setIsPlaying(false);
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
      } catch (e) {}

      const header = `\n> 🎙️ **あなたへの語りかけ対話**\n`;
      const updatedDeep = `${responseDeep}\n\n${header}\n\n${rawText}`;
      
      setResponseDeep(updatedDeep);
      setExplanationMode('deep');

      // Update History Entry
      updateHistoryEntryByArtwork(artwork, artist, { deep: updatedDeep });

      // Play replies
      const prevLength = speakableSegments.length;
      setTimeout(() => {
        setActiveSegmentIndex(prevLength);
        setIsPlaying(true);
      }, 100);

    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Playback Control Handlers
  const handlePlayPause = () => {
    if (!speechSupported || speakableSegments.length === 0) return;

    if (isPlaying) {
      setIsPlaying(false);
      window.speechSynthesis.cancel();
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

  const renderInputForm = () => {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Artwork Input with Autocomplete */}
          <div className="relative space-y-2">
            <label htmlFor="artwork" className="text-sm font-medium text-slate-400 block text-left font-sans select-none">作品名 <span className="text-rose-500">*</span></label>
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
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-3.5 text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 transition-all font-medium text-sm font-sans"
              autoComplete="off"
            />
            {showArtworkSuggestions && artworkSuggestions.length > 0 && (
              <ul className="absolute z-50 w-full mt-1 bg-slate-950/95 border border-slate-850 rounded-xl overflow-hidden shadow-2xl backdrop-blur-xl max-h-40 overflow-y-auto divide-y divide-slate-800/40">
                {artworkSuggestions.map((suggestion, index) => (
                  <li
                    key={index}
                    onMouseDown={() => selectArtworkSuggestion(suggestion)}
                    className={`px-4 py-3 cursor-pointer text-sm transition-all flex items-center justify-between font-sans ${
                      focusedArtworkIndex === index
                        ? 'bg-teal-500/10 text-teal-400'
                        : 'hover:bg-slate-900/80 text-slate-300'
                    }`}
                  >
                    <div className="text-left">
                      {renderHighlightedText(suggestion.title, artwork)}
                      {suggestion.artist && (
                        <span className="text-xs text-slate-500 ml-2 block sm:inline">
                          by {suggestion.artist}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Artist Input with Autocomplete */}
          <div className="relative space-y-2">
            <label htmlFor="artist" className="text-sm font-medium text-slate-400 block text-left font-sans select-none">作者名</label>
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
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-3.5 text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 transition-all font-medium text-sm font-sans"
              autoComplete="off"
            />
            {showArtistSuggestions && artistSuggestions.length > 0 && (
              <ul className="absolute z-50 w-full mt-1 bg-slate-950/95 border border-slate-850 rounded-xl overflow-hidden shadow-2xl backdrop-blur-xl max-h-40 overflow-y-auto divide-y divide-slate-800/40">
                {artistSuggestions.map((name, index) => (
                  <li
                    key={index}
                    onMouseDown={() => selectArtistSuggestion(name)}
                    className={`px-4 py-3 cursor-pointer text-sm transition-all text-left font-sans ${
                      focusedArtistIndex === index
                        ? 'bg-teal-500/10 text-teal-400'
                        : 'hover:bg-slate-900/80 text-slate-305'
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

      {/* Upper Fixed Layer */}
      {(responseShort || loading) && (
        <div className="fixed top-0 left-0 right-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-900 px-4 py-3 flex flex-col items-center select-none shadow-md">
          {/* App Title */}
          <h1 className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-teal-400 via-emerald-400 to-blue-500 bg-clip-text text-transparent select-none font-sans">
            ArtFreeGuide
          </h1>

          {/* Large Artwork Thumbnail (fixed) */}
          <div className="relative w-full max-w-md h-36 sm:h-44 mt-2.5 rounded-2xl overflow-hidden bg-slate-900 border border-slate-800/80 shadow-inner flex items-center justify-center group shrink-0">
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
                className="w-full h-full object-contain transition-all duration-700 ease-out"
              />
            )}
            {imageError && !imageUrl && !imageLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600 gap-1 p-2 text-center select-none bg-slate-900/20">
                <span className="text-2xl">🖼️</span>
                <p className="text-[11px] font-semibold text-slate-500 font-sans">作品画像を取得できませんでした</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Scrollable Center Content */}
      <div className={`w-full max-w-2xl px-4 mx-auto ${responseShort || loading ? 'pt-60 sm:pt-68 pb-28' : 'py-12 md:py-20 flex flex-col items-center justify-center min-h-[calc(100vh-80px)]'}`}>
        
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

            {/* Inline search block for initial page load */}
            <div className="w-full bg-slate-900/40 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-6 md:p-8 shadow-2xl relative">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-teal-500 via-emerald-500 to-blue-500 opacity-60"></div>
              {renderInputForm()}
            </div>
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
          </div>
        )}

        {/* Guide content */}
        {responseShort && (
          <div className="space-y-6 w-full animate-fade-in">
            {/* Ambient indicator and subtitle banner */}
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

            {/* Explanation mode selector tabs */}
            <div className="flex bg-slate-950 border border-slate-900 p-1 rounded-xl select-none w-full max-w-sm mx-auto">
              {(['short', 'standard', 'deep'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => {
                    setExplanationMode(mode);
                    // Reset active segment to start clean
                    setActiveSegmentIndex(-1);
                    setIsPlaying(false);
                    if (speechSupported) window.speechSynthesis.cancel();
                  }}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all active:scale-95 font-sans ${
                    explanationMode === mode
                      ? 'bg-teal-500 text-slate-950 shadow-md font-black'
                      : 'text-slate-400 hover:text-slate-205'
                  }`}
                >
                  {mode === 'short' ? '概要' : mode === 'standard' ? '標準' : '詳細'}
                </button>
              ))}
            </div>

            {/* Highlights Segment Box */}
            <div className="bg-slate-900/20 border border-slate-900 rounded-2xl p-4 md:p-6 max-h-[420px] overflow-y-auto space-y-3 font-serif leading-relaxed text-base selection:bg-teal-500/20 shadow-inner">
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
                      if (explanationMode === 'short') {
                        setExplanationMode('standard');
                      } else {
                        setExplanationMode('deep');
                      }
                      setActiveSegmentIndex(-1);
                      setIsPlaying(false);
                      if (speechSupported) window.speechSynthesis.cancel();
                    }}
                    className="px-6 py-2.5 bg-teal-500/10 border border-teal-500/20 hover:bg-teal-500/20 text-teal-400 hover:text-teal-300 rounded-xl text-xs font-bold active:scale-95 transition-all flex items-center gap-1.5 shadow-sm font-sans"
                  >
                    <span>👇</span>
                    <span>{explanationMode === 'short' ? 'さらに詳しく（標準解説を追記）' : 'さらに深く（詳細エピソードを追記）'}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Voice feedback transcription indicator */}
            {voiceText && (
              <div className="p-3 bg-slate-950/40 border border-slate-900 rounded-xl text-xs text-slate-400 flex items-start gap-2 select-text font-sans">
                <span className="text-sm">🗣️</span>
                <div>
                  <span className="font-semibold text-slate-300 block mb-0.5">あなたの感想:</span>
                  <p className="italic">「{voiceText}」</p>
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

          </div>
        )}
      </div>

      {/* Downward Fixed Controller Panel */}
      {responseShort && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-slate-950/95 border-t border-slate-900 px-4 py-3 shadow-2xl flex items-center justify-between gap-2 select-none h-20">
          
          {/* Left edge controls: Change artwork & History */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowInputDrawer(true)}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-900 border border-slate-800 text-slate-350 hover:text-teal-400 transition-all active:scale-90 shadow-md font-sans"
              title="作品を変える"
            >
              🎨
            </button>
            <button
              onClick={() => setShowHistorySidebar(true)}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-900 border border-slate-800 text-slate-350 hover:text-teal-400 transition-all active:scale-90 relative shadow-md font-sans"
              title="履歴を見る"
            >
              📜
              {history.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-teal-500 text-slate-950 font-bold font-mono rounded-full w-4 h-4 flex items-center justify-center text-[9px]">
                  {history.length}
                </span>
              )}
            </button>
          </div>

          {/* Center Playback control group */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadHistoryEntry(historyIndex - 1)}
              disabled={historyIndex <= 0}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-900 border border-slate-800 text-slate-450 hover:text-teal-400 disabled:opacity-20 transition-all active:scale-90 disabled:pointer-events-none"
              title="前の作品に戻る"
            >
              ⏮️
            </button>
            <button
              onClick={handleSkipBackward}
              disabled={activeSegmentIndex <= 0}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-900/60 border border-slate-850 text-slate-450 hover:text-teal-400 disabled:opacity-20 transition-all active:scale-90"
              title="1文戻る"
            >
              ⏪
            </button>
            
            {/* Play Pause central circle */}
            <button
              onClick={handlePlayPause}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg active:scale-95 relative overflow-hidden shrink-0 ${
                isPlaying
                  ? 'bg-teal-500 text-slate-950 hover:bg-teal-400 hover:shadow-teal-400/20'
                  : 'bg-slate-900 text-teal-400 border border-teal-500/30 hover:border-teal-500 hover:shadow-teal-500/10'
              }`}
            >
              {isPlaying && (
                <span className="absolute inset-0 rounded-full animate-ping bg-teal-500/20 opacity-75"></span>
              )}
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

            <button
              onClick={handleSkipForward}
              disabled={activeSegmentIndex >= speakableSegments.length - 1}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-900/60 border border-slate-850 text-slate-450 hover:text-teal-400 disabled:opacity-20 transition-all active:scale-90"
              title="1文進む"
            >
              ⏩
            </button>
            <button
              onClick={() => loadHistoryEntry(historyIndex + 1)}
              disabled={historyIndex >= history.length - 1}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-900 border border-slate-800 text-slate-450 hover:text-teal-400 disabled:opacity-20 transition-all active:scale-90 disabled:pointer-events-none"
              title="次の作品に進む"
            >
              ⏭️
            </button>
          </div>

          {/* Right edge: Speed Menu trigger & speech toggle */}
          <div className="flex items-center gap-1.5 relative">
            {/* Speed popover button */}
            <button
              onClick={() => setShowSpeedMenu(!showSpeedMenu)}
              className="w-11 h-10 px-1 rounded-xl bg-slate-900 border border-slate-800 text-teal-400 text-xs font-mono font-bold hover:bg-slate-800 active:scale-90 transition-all flex items-center justify-center gap-0.5 shadow-inner"
              title="再生速度を変更"
            >
              <span>⚡</span>
              <span>{playbackSpeed.toFixed(1)}</span>
            </button>

            {/* Smart Speed Selector Popover */}
            {showSpeedMenu && (
              <div className="absolute bottom-12 right-0 bg-slate-950 border border-slate-850 rounded-2xl p-2 flex flex-col gap-1 shadow-2xl z-50 min-w-[70px] animate-fade-in">
                {[1.0, 1.2, 1.5, 1.7, 2.0, 2.5].map(sp => {
                  const isSelected = playbackSpeed === sp;
                  return (
                    <button
                      key={sp}
                      onClick={() => {
                        setPlaybackSpeed(sp);
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
            
            {/* Speech interaction trigger */}
            {recognition && (
              <button
                onClick={startListening}
                className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all active:scale-90 shrink-0 ${
                  isListening
                    ? 'bg-rose-500 text-white animate-pulse'
                    : 'bg-blue-500/10 border border-blue-500/20 text-blue-450 hover:bg-blue-500/20'
                }`}
                title="対話する"
              >
                🎙️
              </button>
            )}
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
          <div className="relative w-full max-w-xl bg-slate-950 border-t border-slate-900 rounded-t-3xl shadow-2xl p-6 md:p-8 animate-slide-up z-10 max-h-[90vh] overflow-y-auto">
            
            {/* Handle bar */}
            <div className="w-12 h-1 bg-slate-800 rounded-full mx-auto mb-5"></div>

            <div className="flex items-center justify-between mb-6 font-sans">
              <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2">
                <span className="text-teal-400">✦</span> 音声ガイドの作品指定
              </h2>
              <button
                onClick={() => setShowInputDrawer(false)}
                className="text-slate-500 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            {renderInputForm()}
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
          <div className="relative w-full max-w-xs bg-slate-950 border-l border-slate-900 h-full flex flex-col shadow-2xl p-6 overflow-y-auto z-50">
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
            <div className="flex-1 space-y-2 overflow-y-auto pr-1 scrollbar-thin font-sans">
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
