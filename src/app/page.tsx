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
  response: string;
  imageUrl: string | null;
  imageError: boolean;
  searchQuery: string;
  recommendations: Recommendation[];
  segments: string[];
  speakableSegments: string[];
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
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);

  // Client-side cache for fetched guides to avoid redundant API hits & rate limits
  const [guideCache, setGuideCache] = useState<Record<string, GuideCacheEntry>>({});

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
    if (suggestion.artist) {
      setArtist(suggestion.artist);
    }
    setShowArtworkSuggestions(false);
    setFocusedArtworkIndex(-1);
  };

  const selectArtistSuggestion = (name: string) => {
    setArtist(name);
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
      }
    } finally {
      setImageLoading(false);
    }
  };

  const fetchRecommendationImages = async (recs: Recommendation[]) => {
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
          return copy;
        });
      } catch (error) {
        console.error('Error fetching rec image:', error);
        setRecommendations(prev => {
          const copy = [...prev];
          if (copy[index]) {
            copy[index] = { ...copy[index], imageUrl: null, imageLoading: false };
          }
          return copy;
        });
      }
    });
  };


  const generateGuide = async (customArtwork?: string, customArtist?: string) => {
    const targetArtwork = customArtwork ?? artwork;
    const targetArtist = customArtist ?? artist;

    if (!targetArtwork.trim()) return;

    if (customArtwork) setArtwork(customArtwork);
    if (customArtist !== undefined) setArtist(customArtist);

    if (speechSupported) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      stopAmbientSound();
    }

    const cacheKey = `${targetArtwork.trim().toLowerCase()}::${targetArtist.trim().toLowerCase()}`;

    // CHECK CLIENT-SIDE CACHE
    if (guideCache[cacheKey]) {
      const cached = guideCache[cacheKey];
      setResponse(cached.response);
      setSegments(cached.segments);
      setSpeakableSegments(cached.speakableSegments);
      setImageUrl(cached.imageUrl);
      setImageError(cached.imageError);
      setSearchQuery(cached.searchQuery);
      setRecommendations(cached.recommendations);
      
      // Auto Play back from cache
      setActiveSegmentIndex(0);
      setIsPlaying(true);
      startAmbientSound(targetArtwork);
      return;
    }

    setLoading(true);
    setResponse('');
    setSegments([]);
    setSpeakableSegments([]);
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
          setResponse('現在、大変混雑しているため音声ガイドを生成できません。しばらく時間をおいてから再度お試しください。');
        } else {
          setResponse('現在、音声ガイドサービスをご利用いただけません。しばらく時間をおいてから再度お試しください。');
        }
      } else {
        let rawExplanation = data.text;
        let queryForImage = `${targetArtwork} ${targetArtist}`.trim();
        let recs: Recommendation[] = [];

        try {
          let jsonString = data.text.trim();
          const firstBrace = jsonString.indexOf('{');
          const lastBrace = jsonString.lastIndexOf('}');
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            jsonString = jsonString.substring(firstBrace, lastBrace + 1);
          }
          const parsed = JSON.parse(jsonString);
          rawExplanation = parsed.explanation || data.text;
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
          const match = data.text.match(/"explanation"\s*:\s*"([\s\S]*?)"\s*,\s*"searchQuery"/);
          if (match && match[1]) {
            rawExplanation = match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
          } else {
            if (data.text.trim().startsWith('{')) {
              rawExplanation = "音声ガイドの解析中にエラーが発生しました。もう一度生成をお試しください。";
            } else {
              rawExplanation = data.text;
            }
          }
        }

        setResponse(rawExplanation);
        const parsedSegs = parseSegments(rawExplanation);
        const cleanSpeakables = parsedSegs.filter(seg => seg.replace(/[#*_`~\s]/g, '').trim().length > 0);

        setSegments(parsedSegs);
        setSpeakableSegments(cleanSpeakables);

        // Store primary metadata in cache
        const newEntry: GuideCacheEntry = {
          response: rawExplanation,
          imageUrl: null,
          imageError: false,
          searchQuery: queryForImage,
          recommendations: recs,
          segments: parsedSegs,
          speakableSegments: cleanSpeakables
        };
        
        setGuideCache(prev => ({ ...prev, [cacheKey]: newEntry }));

        // Start progressive loading
        fetchImage(queryForImage, cacheKey);
        startAmbientSound(targetArtwork);

        if (recs.length > 0) {
          setRecommendations(recs);
          fetchRecommendationImages(recs);
        }

        // Auto-play
        setActiveSegmentIndex(0);
        setIsPlaying(true);
      }
    } catch (e: any) {
      console.error(e);
      const errMsg = e.message || '';
      if (errMsg.includes('429') || errMsg.includes('Too Many Requests')) {
        setResponse('現在、大変混雑しているため音声ガイドを生成できません。しばらく時間をおいてから再度お試しください。');
      } else {
        setResponse('現在、混雑のため音声ガイドを生成できません。しばらく時間をおいてから再度お試しください。');
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
    const wasPlaying = isPlaying;
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
        // Silent block or simple notification instead of raw trace
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

      // Split the deep dive content into sentences
      const deepSegments = parseSegments(rawText);

      // Insert deep dive segments right after the current active index
      const insertIndex = activeSegmentIndex + 1;
      
      const newSegments = [...segments];
      const cleanDeepSpeakables = deepSegments.filter(s => s.replace(/[#*_`~\s]/g, '').trim().length > 0);

      // Format deep dive visual header block
      const visualHeader = `\n> 🔍 **ディープな深掘りエピソードへようこそ**\n`;
      newSegments.splice(insertIndex, 0, visualHeader, ...deepSegments);

      const newSpeakables = [...speakableSegments];
      newSpeakables.splice(insertIndex, 0, ...cleanDeepSpeakables);

      setSegments(newSegments);
      setSpeakableSegments(newSpeakables);

      // Save to cache as well so it stays persistent
      const cacheKey = `${artwork.trim().toLowerCase()}::${artist.trim().toLowerCase()}`;
      setGuideCache(prev => {
        if (prev[cacheKey]) {
          return {
            ...prev,
            [cacheKey]: {
              ...prev[cacheKey],
              segments: newSegments,
              speakableSegments: newSpeakables
            }
          };
        }
        return prev;
      });

      // Auto play deep dive segments
      setActiveSegmentIndex(insertIndex);
      setIsPlaying(true);
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

      // Render curator reply
      const replySegments = parseSegments(rawText);

      const header = `\n> 🎙️ **あなたへの語りかけ対話**\n`;
      const cleanReplySpeakables = replySegments.filter(s => s.replace(/[#*_`~\s]/g, '').trim().length > 0);

      const newSegments = [...segments, header, ...replySegments];
      const newSpeakables = [...speakableSegments, ...cleanReplySpeakables];

      setSegments(newSegments);
      setSpeakableSegments(newSpeakables);

      // Save updated data to cache
      const cacheKey = `${artwork.trim().toLowerCase()}::${artist.trim().toLowerCase()}`;
      setGuideCache(prev => {
        if (prev[cacheKey]) {
          return {
            ...prev,
            [cacheKey]: {
              ...prev[cacheKey],
              segments: newSegments,
              speakableSegments: newSpeakables
            }
          };
        }
        return prev;
      });
      
      // Auto play reply
      const newIndex = speakableSegments.length;
      setActiveSegmentIndex(newIndex);
      setIsPlaying(true);
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

  return (
    <main className="max-w-4xl mx-auto px-4 py-12 md:py-20 flex flex-col items-center justify-center min-h-screen">
      {/* Header Section */}
      <div className="text-center mb-10 space-y-3">
        <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight bg-gradient-to-r from-teal-400 via-emerald-400 to-blue-500 bg-clip-text text-transparent drop-shadow-sm select-none">
          ArtFreeGuide
        </h1>
        <p className="text-slate-400 text-lg md:text-xl font-medium max-w-xl mx-auto">
          AIキュレーターが贈る、あなたのための特別な音声ガイド。美術作品をもっと深く、もっと身近に。
        </p>
      </div>

      {/* Main Form & Response Layout */}
      <div className="w-full grid grid-cols-1 gap-8">

        {/* Input Form Card */}
        <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-visible">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-teal-500 via-emerald-500 to-blue-500 opacity-60"></div>

          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-200 flex items-center gap-2">
                <span className="text-teal-400">✦</span> 作品指定
              </h2>
              {/* Quick Audio Start Button */}
              {artwork.trim() && (
                <button
                  onClick={() => generateGuide()}
                  disabled={loading}
                  className="bg-gradient-to-r from-teal-500/20 to-teal-400/20 border border-teal-500/35 hover:bg-teal-500/30 text-teal-350 px-4 py-1.5 rounded-full text-xs font-bold active:scale-95 transition-all flex items-center gap-1.5"
                >
                  🎧 今すぐ音声ガイドを開始する
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Artwork Input with Autocomplete */}
              <div className="relative space-y-2">
                <label htmlFor="artwork" className="text-sm font-medium text-slate-400 block">作品名 <span className="text-rose-500">*</span></label>
                <input
                  id="artwork"
                  type="text"
                  placeholder="例: ひまわり、モナ・リザ"
                  value={artwork}
                  onChange={(e) => {
                    setArtwork(e.target.value);
                    setShowArtworkSuggestions(true);
                    setFocusedArtworkIndex(-1);
                  }}
                  onKeyDown={handleArtworkKeyDown}
                  onFocus={() => setShowArtworkSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowArtworkSuggestions(false), 200)}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-3.5 text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 transition-all font-medium"
                  autoComplete="off"
                />

                {showArtworkSuggestions && artworkSuggestions.length > 0 && (
                  <ul className="absolute z-50 w-full mt-1 bg-slate-950/95 border border-slate-850 rounded-xl overflow-hidden shadow-2xl backdrop-blur-xl max-h-60 overflow-y-auto divide-y divide-slate-800/40">
                    {artworkSuggestions.map((suggestion, index) => (
                      <li
                        key={index}
                        onMouseDown={() => selectArtworkSuggestion(suggestion)}
                        className={`px-4 py-3.5 cursor-pointer text-sm transition-all flex items-center justify-between ${
                          focusedArtworkIndex === index
                            ? 'bg-teal-500/10 text-teal-400'
                            : 'hover:bg-slate-900/80 text-slate-300'
                        }`}
                      >
                        <div>
                          {renderHighlightedText(suggestion.title, artwork)}
                          {suggestion.artist && (
                            <span className="text-xs text-slate-500 ml-2 block sm:inline">
                              by {suggestion.artist}
                            </span>
                          )}
                        </div>
                        {suggestion.artist && (
                          <span className="text-[10px] bg-teal-500/10 border border-teal-500/20 text-teal-400 px-1.5 py-0.5 rounded font-mono select-none">
                            作者自動入力
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Artist Input with Autocomplete */}
              <div className="relative space-y-2">
                <label htmlFor="artist" className="text-sm font-medium text-slate-400 block">作者名</label>
                <input
                  id="artist"
                  type="text"
                  placeholder="例: ゴッホ、ダ・ヴィンチ"
                  value={artist}
                  onChange={(e) => {
                    setArtist(e.target.value);
                    setShowArtistSuggestions(true);
                    setFocusedArtistIndex(-1);
                  }}
                  onKeyDown={handleArtistKeyDown}
                  onFocus={() => setShowArtistSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowArtistSuggestions(false), 200)}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-3.5 text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 transition-all font-medium"
                  autoComplete="off"
                />

                {showArtistSuggestions && artistSuggestions.length > 0 && (
                  <ul className="absolute z-50 w-full mt-1 bg-slate-950/95 border border-slate-850 rounded-xl overflow-hidden shadow-2xl backdrop-blur-xl max-h-60 overflow-y-auto divide-y divide-slate-800/40">
                    {artistSuggestions.map((name, index) => (
                      <li
                        key={index}
                        onMouseDown={() => selectArtistSuggestion(name)}
                        className={`px-4 py-3.5 cursor-pointer text-sm transition-all ${
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
              onClick={() => generateGuide()}
              disabled={loading || !artwork.trim()}
              className="w-full bg-gradient-to-r from-teal-500 to-blue-600 hover:from-teal-400 hover:to-blue-500 text-slate-950 font-bold py-4 px-6 rounded-xl shadow-lg shadow-teal-500/10 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 group text-base"
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
        </div>

        {/* Response / Output Card */}
        {(response || loading) && (
          <div className="space-y-8">
            <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-6 md:p-8 shadow-2xl relative transition-all duration-300">
              {loading ? (
                // Loading Skeleton
                <div className="space-y-6 animate-pulse py-4">
                  <div className="w-full aspect-video bg-slate-800 rounded-2xl flex items-center justify-center">
                    <div className="text-slate-600 text-sm">画像を読み込み中...</div>
                  </div>
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
              ) : (
                // Guide Presentation
                <div className="space-y-6">

                  {/* Header info */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/60">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-full bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 text-2xl relative">
                        🎙️
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-slate-200 text-lg">AIキュレーター音声ガイド</h3>
                          {isPlaying && (
                            <span className="flex h-2.5 w-2.5 relative">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-teal-500"></span>
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400">
                          {artwork} {artist ? `(${artist})` : ''}
                        </p>
                      </div>
                    </div>

                    {/* Ambient Sound Indicator */}
                    {ambientName && (
                      <div className="flex items-center gap-1.5 px-3 py-1 bg-teal-950/40 border border-teal-850 rounded-full text-[10px] text-teal-400 font-mono animate-pulse">
                        <span className="text-xs">🎵</span>
                        <span>{ambientName}</span>
                      </div>
                    )}
                  </div>

                  {/* Artwork Image Section */}
                  <div className="relative w-full aspect-video md:aspect-[21/9] rounded-2xl overflow-hidden bg-slate-950 border border-slate-800/60 shadow-inner flex items-center justify-center group">
                    {imageLoading && (
                      <div className="absolute inset-0 bg-slate-900/60 flex flex-col items-center justify-center gap-2">
                        <div className="animate-pulse flex space-x-2">
                          <div className="h-2 w-2 bg-slate-600 rounded-full animate-bounce"></div>
                          <div className="h-2 w-2 bg-slate-600 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                          <div className="h-2 w-2 bg-slate-600 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                        </div>
                        <span className="text-slate-500 text-xs">Wikimedia Commons から画像を取得中...</span>
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
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600 gap-2 p-6 text-center select-none bg-slate-900/20">
                        <span className="text-3xl">🖼️</span>
                        <p className="text-sm font-semibold text-slate-500">作品画像を取得できませんでした</p>
                        <p className="text-xs text-slate-600">検索用クエリ: {searchQuery}</p>
                      </div>
                    )}
                  </div>

                  {/* Next-Gen Audio Control Panel */}
                  {speechSupported && speakableSegments.length > 0 && (
                    <div className="bg-slate-950/80 border border-slate-850 p-6 rounded-3xl flex flex-col items-center gap-6 shadow-xl select-none">
                      
                      {/* Main Audio Deck - Play/Pause and Skip buttons */}
                      <div className="flex items-center justify-center gap-8 w-full">
                        {/* Skip backward */}
                        <button
                          onClick={handleSkipBackward}
                          disabled={activeSegmentIndex <= 0}
                          className="w-12 h-12 flex items-center justify-center rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-teal-400 disabled:opacity-20 disabled:hover:text-slate-400 transition-all active:scale-90"
                          title="1文戻る"
                        >
                          <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                            <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/>
                          </svg>
                        </button>

                        {/* GIANT CENTER PLAY/PAUSE BUTTON */}
                        <button
                          onClick={handlePlayPause}
                          className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-500 shadow-2xl active:scale-95 relative group overflow-hidden ${
                            isPlaying
                              ? 'bg-teal-500 text-slate-950 hover:bg-teal-400 hover:shadow-teal-400/30'
                              : 'bg-slate-900 text-teal-400 border-2 border-teal-500/40 hover:bg-slate-900/80 hover:border-teal-500 hover:shadow-teal-500/10'
                          }`}
                          title={isPlaying ? '音声ガイドを一時停止' : '音声ガイドを再生'}
                        >
                          {isPlaying && (
                            <span className="absolute inset-0 rounded-full animate-ping bg-teal-500/20 opacity-75"></span>
                          )}
                          {isPlaying ? (
                            <svg className="w-10 h-10 fill-current" viewBox="0 0 24 24">
                              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                            </svg>
                          ) : (
                            <svg className="w-10 h-10 fill-current translate-x-0.5" viewBox="0 0 24 24">
                              <path d="M8 5v14l11-7z"/>
                            </svg>
                          )}
                        </button>

                        {/* Skip forward */}
                        <button
                          onClick={handleSkipForward}
                          disabled={activeSegmentIndex >= speakableSegments.length - 1}
                          className="w-12 h-12 flex items-center justify-center rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-teal-400 disabled:opacity-20 disabled:hover:text-slate-400 transition-all active:scale-90"
                          title="1文進む"
                        >
                          <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                            <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/>
                          </svg>
                        </button>
                      </div>

                      {/* Speed selector: Touch-friendly horizontal pill button rows */}
                      <div className="w-full space-y-2 border-t border-slate-800/60 pt-4">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block text-center sm:text-left">
                          再生速度 (タッチターゲット 44px 確保)
                        </span>
                        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 overflow-x-auto pb-1 scrollbar-thin">
                          {[1.0, 1.2, 1.5, 1.7, 2.0, 2.5].map((sp) => {
                            const isSelected = playbackSpeed === sp;
                            return (
                              <button
                                key={sp}
                                onClick={() => setPlaybackSpeed(sp)}
                                className={`min-h-[44px] min-w-[56px] px-3.5 rounded-xl text-xs font-mono font-bold transition-all duration-200 active:scale-95 flex items-center justify-center ${
                                  isSelected
                                    ? 'bg-teal-500 text-slate-950 font-black shadow-lg shadow-teal-500/10'
                                    : 'bg-slate-900 border border-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                                }`}
                              >
                                {sp.toFixed(1)}x
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Deep Dive & Speech interaction buttons */}
                      <div className="w-full flex items-center justify-between border-t border-slate-800/60 pt-4 gap-4">
                        {/* Deep dive button */}
                        <button
                          onClick={handleDeepDive}
                          disabled={deepDiveLoading}
                          className="flex-1 min-h-[44px] px-4 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 text-amber-400 hover:text-amber-300 rounded-xl text-xs font-bold active:scale-95 transition-all flex items-center justify-center gap-1.5"
                        >
                          {deepDiveLoading ? (
                            <svg className="animate-spin h-4 w-4 text-amber-400" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          ) : '🔍'}
                          <span>解説をさらに深掘りする</span>
                        </button>

                        {/* Interactive Speech Response button */}
                        {recognition && (
                          <button
                            onClick={startListening}
                            className={`flex-1 min-h-[44px] px-4 rounded-xl text-xs font-bold active:scale-95 transition-all flex items-center justify-center gap-1.5 ${
                              isListening
                                ? 'bg-rose-500 text-white animate-pulse'
                                : 'bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 text-blue-400 hover:text-blue-300'
                            }`}
                            title={isListening ? '音声を聞き取り中...' : 'AIと声で対話'}
                          >
                            <span>🎙️</span>
                            <span>{isListening ? '聞き取り中...' : 'AIと対話する'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Visual Highlighting Segment Box */}
                  <div className="bg-slate-950/20 border border-slate-900 rounded-2xl p-4 md:p-6 max-h-96 overflow-y-auto space-y-3 font-serif leading-relaxed text-base selection:bg-teal-500/20 shadow-inner">
                    {segments.length > 0 ? (
                      segments.map((seg, index) => {
                        const isSpeakable = speakableSegments.includes(seg);
                        const speakableIndex = speakableSegments.indexOf(seg);
                        const isActive = isPlaying && speakableIndex === activeSegmentIndex;

                        if (seg.startsWith('\n>')) {
                          // Render callout block formatting for deep dive headers
                          return (
                            <div key={index} className="py-2">
                              <ReactMarkdown>{seg}</ReactMarkdown>
                            </div>
                          );
                        }

                        return (
                          <div
                            key={index}
                            id={`seg-${speakableIndex}`}
                            className={`transition-all duration-500 rounded-xl px-3 py-2 border-l-3 ${
                              isActive
                                ? 'bg-teal-500/10 text-teal-300 border-teal-500 font-medium pl-4 scale-[1.01] shadow-sm'
                                : 'text-slate-350 border-transparent hover:bg-slate-900/10 hover:text-slate-200'
                            }`}
                          >
                            <ReactMarkdown
                              components={{
                                p: ({node, ...props}) => <span {...props} />,
                                h1: ({node, ...props}) => <h1 className="text-xl font-bold text-slate-100" {...props} />,
                                h2: ({node, ...props}) => <h2 className="text-lg font-bold text-slate-100 mt-2 mb-1" {...props} />,
                                h3: ({node, ...props}) => <h3 className="text-base font-bold text-slate-100" {...props} />,
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
                      // Fallback text if segment parse failed or not loaded yet
                      <div className="text-slate-300">
                        <ReactMarkdown
                          components={{
                            strong: ({node, ...props}) => <strong className="font-bold text-teal-400" {...props} />,
                          }}
                        >
                          {response}
                        </ReactMarkdown>
                      </div>
                    )}
                  </div>

                  {/* Microphone speech feedback display */}
                  {voiceText && (
                    <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl text-xs text-slate-400 flex items-start gap-2">
                      <span className="text-sm">🗣️</span>
                      <div>
                        <span className="font-semibold text-slate-300 block mb-0.5">あなたの感想:</span>
                        <p className="italic select-text">「{voiceText}」</p>
                      </div>
                    </div>
                  )}

                </div>
              )}
            </div>

            {/* Recommendations Section */}
            {!loading && recommendations.length > 0 && (
              <div className="mt-8 space-y-6 animate-fade-in">
                <h3 className="text-xl font-bold text-slate-200 flex items-center gap-2 select-none">
                  <span className="text-teal-400">💡</span> 次におすすめの作品
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {recommendations.map((rec, index) => (
                    <div
                      key={index}
                      onClick={() => generateGuide(rec.title, rec.artist)}
                      className="bg-slate-900/40 border border-slate-800/80 hover:border-teal-500/50 hover:bg-slate-900/60 rounded-2xl p-4 flex flex-col gap-3 cursor-pointer transition-all duration-300 group shadow-lg"
                    >
                      {/* Card Thumbnail */}
                      <div className="relative w-full aspect-[16/10] rounded-xl overflow-hidden bg-slate-950 border border-slate-850 flex items-center justify-center">
                        {rec.imageLoading ? (
                          <div className="absolute inset-0 bg-slate-900/40 flex items-center justify-center">
                            <div className="animate-pulse flex space-x-1">
                              <div className="h-1.5 w-1.5 bg-slate-600 rounded-full animate-bounce"></div>
                              <div className="h-1.5 w-1.5 bg-slate-600 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                              <div className="h-1.5 w-1.5 bg-slate-600 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                            </div>
                          </div>
                        ) : rec.imageUrl ? (
                          <img
                            src={rec.imageUrl}
                            alt={rec.title}
                            className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500"
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center text-slate-600 text-2xl bg-slate-900/10 select-none">
                            🖼️
                          </div>
                        )}
                      </div>

                      {/* Card Info */}
                      <div className="flex-1 flex flex-col justify-between">
                        <div>
                          <h4 className="font-semibold text-slate-200 text-sm line-clamp-1 group-hover:text-teal-400 transition-colors">
                            {rec.title}
                          </h4>
                          <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">
                            {rec.artist}
                          </p>
                        </div>
                        <p className="text-xs text-slate-500 mt-2.5 line-clamp-2 italic leading-relaxed border-t border-slate-800/40 pt-2.5">
                          {rec.reason}
                        </p>


                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
