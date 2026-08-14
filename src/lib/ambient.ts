'use client';

export const AMBIENT_MOODS = ['serene', 'dramatic', 'melancholic', 'playful', 'sacred'] as const;

export type AmbientMood = (typeof AMBIENT_MOODS)[number];

export interface AmbientPreset {
  /** Shown in the now-playing chip */
  label: string;
  /** Drone frequencies in Hz (a chord that suits the mood) */
  frequencies: number[];
  oscillatorType: OscillatorType;
  /** Low-pass cutoff — lower is darker and further away */
  cutoffHz: number;
  /** Slow amplitude movement so the pad breathes */
  tremoloHz: number;
  /** Peak gain of the pad (before ducking) */
  volume: number;
}

export const AMBIENT_PRESETS: Record<AmbientMood, AmbientPreset> = {
  // C major open fifth — calm water, light, gardens
  serene: {
    label: '静謐 — 水面のような穏やかなパッド',
    frequencies: [130.81, 196.0, 261.63],
    oscillatorType: 'sine',
    cutoffHz: 420,
    tremoloHz: 0.07,
    volume: 0.05,
  },
  // G minor-ish cluster with a beating low end — tension, unrest
  dramatic: {
    label: '緊張 — 低く沈むドローン',
    frequencies: [98.0, 116.54, 146.83],
    oscillatorType: 'sawtooth',
    cutoffHz: 240,
    tremoloHz: 0.18,
    volume: 0.035,
  },
  // A minor — introspection, melancholy
  melancholic: {
    label: '沈思 — 陰りのある低音の和音',
    frequencies: [110.0, 130.81, 164.81],
    oscillatorType: 'triangle',
    cutoffHz: 320,
    tremoloHz: 0.1,
    volume: 0.045,
  },
  // Bright major triad, a touch higher — vivid colour, movement
  playful: {
    label: '軽やか — 明るく弾む響き',
    frequencies: [174.61, 220.0, 261.63],
    oscillatorType: 'triangle',
    cutoffHz: 620,
    tremoloHz: 0.22,
    volume: 0.04,
  },
  // Perfect fifths stacked — cathedral, stillness, awe
  sacred: {
    label: '荘厳 — 聖堂のような重なり',
    frequencies: [87.31, 130.81, 196.0],
    oscillatorType: 'sine',
    cutoffHz: 300,
    tremoloHz: 0.05,
    volume: 0.05,
  },
};

export const DEFAULT_MOOD: AmbientMood = 'serene';

export function isAmbientMood(value: unknown): value is AmbientMood {
  return typeof value === 'string' && (AMBIENT_MOODS as readonly string[]).includes(value);
}

/** Volume multiplier applied while narration is speaking, so the voice stays on top. */
const DUCK_FACTOR = 0.35;
const FADE_IN_SECONDS = 3;
const FADE_OUT_SECONDS = 1;
const DUCK_SECONDS = 0.6;

/**
 * Procedural ambient pad driven by the artwork's mood. No audio assets, no licensing,
 * and it ducks itself while the guide is being spoken.
 */
export class AmbientPlayer {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private oscillators: OscillatorNode[] = [];
  private lfo: OscillatorNode | null = null;
  private preset: AmbientPreset | null = null;
  private ducked = false;

  get currentLabel(): string | null {
    return this.preset?.label ?? null;
  }

  start(mood: AmbientMood): AmbientPreset | null {
    this.stop();

    const AudioContextClass =
      typeof window === 'undefined'
        ? undefined
        : window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;

    const preset = AMBIENT_PRESETS[mood];
    const context = new AudioContextClass();
    const now = context.currentTime;

    const masterGain = context.createGain();
    masterGain.gain.setValueAtTime(0, now);

    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(preset.cutoffHz, now);

    this.oscillators = preset.frequencies.map(frequency => {
      const osc = context.createOscillator();
      osc.type = preset.oscillatorType;
      osc.frequency.setValueAtTime(frequency, now);
      // Slight detune keeps the chord from sounding synthetic
      osc.detune.setValueAtTime((Math.random() - 0.5) * 12, now);
      osc.connect(masterGain);
      osc.start();
      return osc;
    });

    // Slow tremolo so the pad breathes instead of sitting still
    const lfo = context.createOscillator();
    const lfoGain = context.createGain();
    lfo.frequency.setValueAtTime(preset.tremoloHz, now);
    lfoGain.gain.setValueAtTime(preset.volume * 0.35, now);
    lfo.connect(lfoGain);
    lfoGain.connect(masterGain.gain);
    lfo.start();

    masterGain.connect(filter);
    filter.connect(context.destination);
    masterGain.gain.linearRampToValueAtTime(preset.volume, now + FADE_IN_SECONDS);

    this.context = context;
    this.masterGain = masterGain;
    this.lfo = lfo;
    this.preset = preset;
    this.ducked = false;

    return preset;
  }

  /** Lower the pad while speech plays, restore it afterwards. */
  setDucked(ducked: boolean) {
    if (this.ducked === ducked) return;
    this.ducked = ducked;

    const context = this.context;
    const masterGain = this.masterGain;
    const preset = this.preset;
    if (!context || !masterGain || !preset) return;

    const target = ducked ? preset.volume * DUCK_FACTOR : preset.volume;
    masterGain.gain.cancelScheduledValues(context.currentTime);
    masterGain.gain.setValueAtTime(masterGain.gain.value, context.currentTime);
    masterGain.gain.linearRampToValueAtTime(target, context.currentTime + DUCK_SECONDS);
  }

  stop() {
    const context = this.context;
    const masterGain = this.masterGain;
    const oscillators = this.oscillators;
    const lfo = this.lfo;

    this.context = null;
    this.masterGain = null;
    this.oscillators = [];
    this.lfo = null;
    this.preset = null;
    this.ducked = false;

    if (!context || !masterGain) return;

    try {
      masterGain.gain.cancelScheduledValues(context.currentTime);
      masterGain.gain.setValueAtTime(masterGain.gain.value, context.currentTime);
      masterGain.gain.linearRampToValueAtTime(0, context.currentTime + FADE_OUT_SECONDS);
      setTimeout(() => {
        oscillators.forEach(osc => {
          try {
            osc.stop();
          } catch {}
        });
        try {
          lfo?.stop();
        } catch {}
        context.close().catch(() => {});
      }, FADE_OUT_SECONDS * 1000);
    } catch (error) {
      console.warn('Ambient stop failed:', error);
    }
  }
}

/**
 * Fallback when the model does not return a usable mood: pick from the title/artist so a
 * demo never plays the same pad for every artwork.
 */
export function guessMoodFromText(text: string): AmbientMood {
  const normalized = text.toLowerCase();
  const rules: [AmbientMood, string[]][] = [
    ['dramatic', ['叫び', 'ゲルニカ', '戦', '地獄', '最後の審判', 'ムンク', 'ピカソ', 'ゴヤ']],
    ['sacred', ['聖', 'マリア', '受胎告知', '大聖堂', '仏', '曼荼羅', '祈', 'ダビデ', 'ミケランジェロ']],
    ['melancholic', ['夜', '雨', '冬', '孤独', '悲', '骸骨', 'レンブラント']],
    ['playful', ['踊', '舞踏', '祭', '子供', '花', '春', 'ルノワール', '草間', 'ウォーホル']],
    ['serene', ['睡蓮', '水', '海', '湖', '風景', 'モネ', 'フェルメール']],
  ];

  for (const [mood, keywords] of rules) {
    if (keywords.some(keyword => normalized.includes(keyword.toLowerCase()))) {
      return mood;
    }
  }
  return DEFAULT_MOOD;
}
