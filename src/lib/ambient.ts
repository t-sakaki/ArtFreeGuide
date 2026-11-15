'use client';

/**
 * Procedural score engine.
 *
 * The LLM does not pick from a handful of canned moods; it returns a *music spec*
 * (key, mode, tempo, timbre and four continuous 0-1 axes). Every field is clamped and
 * falls back individually, so an invalid or partial spec still produces music.
 */

export const TONICS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
export type Tonic = (typeof TONICS)[number];

/** Semitone offsets from the tonic. Japanese modes are included so ukiyo-e does not get Western harmony. */
export const SCALES = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  pentatonic: [0, 2, 4, 7, 9],
  whole_tone: [0, 2, 4, 6, 8, 10],
  hirajoshi: [0, 2, 3, 7, 8],
  insen: [0, 1, 5, 7, 10],
} as const;
export type ScaleName = keyof typeof SCALES;

export const TEXTURES = ['strings', 'choir', 'bell', 'pluck', 'glass', 'breath'] as const;
export type Texture = (typeof TEXTURES)[number];

export interface MusicSpec {
  tonic: Tonic;
  scale: ScaleName;
  /** 40-100 */
  tempoBpm: number;
  texture: Texture;
  /** 0-1, low-pass cutoff */
  brightness: number;
  /** 0-1, harmonic content of the pad */
  warmth: number;
  /** 0-1, how often melodic notes appear */
  density: number;
  /** 0-1, added dissonance and detune */
  tension: number;
  /** 0-1, reverb size */
  space: number;
}

export const DEFAULT_MUSIC_SPEC: MusicSpec = {
  tonic: 'D',
  scale: 'dorian',
  tempoBpm: 56,
  texture: 'strings',
  brightness: 0.4,
  warmth: 0.6,
  density: 0.35,
  tension: 0.25,
  space: 0.7,
};

interface TextureConfig {
  padType: OscillatorType;
  leadType: OscillatorType;
  /** Seconds */
  attack: number;
  release: number;
  /** Octave offset applied to melodic notes */
  leadOctave: number;
  padLevel: number;
  leadLevel: number;
  label: string;
}

const TEXTURE_CONFIG: Record<Texture, TextureConfig> = {
  strings: { padType: 'sawtooth', leadType: 'sawtooth', attack: 0.6, release: 1.8, leadOctave: 1, padLevel: 0.05, leadLevel: 0.05, label: '弦のパッド' },
  choir: { padType: 'sine', leadType: 'triangle', attack: 0.9, release: 2.2, leadOctave: 1, padLevel: 0.06, leadLevel: 0.045, label: '声のような重なり' },
  bell: { padType: 'sine', leadType: 'sine', attack: 0.01, release: 3.0, leadOctave: 2, padLevel: 0.04, leadLevel: 0.06, label: '鐘の残響' },
  pluck: { padType: 'triangle', leadType: 'triangle', attack: 0.005, release: 1.0, leadOctave: 2, padLevel: 0.035, leadLevel: 0.06, label: '撥弦の響き' },
  glass: { padType: 'sine', leadType: 'sine', attack: 0.15, release: 2.4, leadOctave: 2, padLevel: 0.04, leadLevel: 0.05, label: 'ガラスのような倍音' },
  breath: { padType: 'triangle', leadType: 'sine', attack: 1.2, release: 2.6, leadOctave: 1, padLevel: 0.05, leadLevel: 0.03, label: '息のようなドローン' },
};

const SCALE_LABELS: Record<ScaleName, string> = {
  ionian: '長調',
  aeolian: '短調',
  dorian: 'ドリアン旋法',
  lydian: 'リディアン旋法',
  phrygian: 'フリジアン旋法',
  mixolydian: 'ミクソリディアン旋法',
  pentatonic: 'ペンタトニック',
  whole_tone: '全音音階',
  hirajoshi: '平調子（和）',
  insen: '陰旋法（和）',
};

function clamp01(value: unknown, fallback: number): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(Math.max(num, 0), 1);
}

const FLAT_TO_SHARP: Record<string, string> = { DB: 'C#', EB: 'D#', GB: 'F#', AB: 'G#', BB: 'A#' };

function normalizeTonic(value: string): string {
  const upper = value.trim().toUpperCase();
  return FLAT_TO_SHARP[upper] ?? upper;
}

/** Accepts anything the model produced and returns a spec that is always playable. */
export function normalizeMusicSpec(raw: unknown): MusicSpec {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const fallback = DEFAULT_MUSIC_SPEC;

  const tonicRaw = typeof input.tonic === 'string' ? normalizeTonic(input.tonic) : '';
  const tonic = (TONICS as readonly string[]).includes(tonicRaw) ? (tonicRaw as Tonic) : fallback.tonic;

  const scaleRaw = typeof input.scale === 'string' ? input.scale.trim().toLowerCase() : '';
  const scale = scaleRaw in SCALES ? (scaleRaw as ScaleName) : fallback.scale;

  const textureRaw = typeof input.texture === 'string' ? input.texture.trim().toLowerCase() : '';
  const texture = (TEXTURES as readonly string[]).includes(textureRaw) ? (textureRaw as Texture) : fallback.texture;

  const tempoRaw = typeof input.tempoBpm === 'number' ? input.tempoBpm : Number(input.tempoBpm);
  const tempoBpm = Number.isFinite(tempoRaw) ? Math.min(Math.max(tempoRaw, 40), 100) : fallback.tempoBpm;

  return {
    tonic,
    scale,
    tempoBpm,
    texture,
    brightness: clamp01(input.brightness, fallback.brightness),
    warmth: clamp01(input.warmth, fallback.warmth),
    density: clamp01(input.density, fallback.density),
    tension: clamp01(input.tension, fallback.tension),
    space: clamp01(input.space, fallback.space),
  };
}

/** Short Japanese description shown in the now-playing chip. */
export function describeMusicSpec(spec: MusicSpec): string {
  return `${spec.tonic} ${SCALE_LABELS[spec.scale]}・${Math.round(spec.tempoBpm)}BPM・${TEXTURE_CONFIG[spec.texture].label}`;
}

/**
 * Heuristic used when the model returns nothing usable, and for guides cached before
 * the spec existed. Keyword driven so a demo never plays the same thing for every artwork.
 */
export function guessMusicSpec(text: string): MusicSpec {
  const source = text.toLowerCase();
  const has = (words: string[]) => words.some(word => source.includes(word.toLowerCase()));

  if (has(['北斎', '広重', '浮世絵', '屏風', '琳派', '宗達', '若冲', '雪舟', '仁清'])) {
    return { tonic: 'E', scale: 'hirajoshi', tempoBpm: 54, texture: 'pluck', brightness: 0.5, warmth: 0.5, density: 0.4, tension: 0.3, space: 0.6 };
  }
  if (has(['叫び', 'ゲルニカ', '戦', '地獄', '最後の審判', 'ムンク', 'ゴヤ'])) {
    return { tonic: 'C', scale: 'phrygian', tempoBpm: 72, texture: 'strings', brightness: 0.25, warmth: 0.8, density: 0.5, tension: 0.9, space: 0.75 };
  }
  if (has(['聖', 'マリア', '受胎告知', '大聖堂', '祈', 'ダビデ', 'ミケランジェロ', '仏', '曼荼羅'])) {
    return { tonic: 'G', scale: 'aeolian', tempoBpm: 46, texture: 'choir', brightness: 0.35, warmth: 0.6, density: 0.2, tension: 0.2, space: 0.95 };
  }
  if (has(['夜', '雨', '冬', '孤独', '悲', 'レンブラント', '記憶の固執', 'ダリ'])) {
    return { tonic: 'A', scale: 'aeolian', tempoBpm: 50, texture: 'glass', brightness: 0.3, warmth: 0.55, density: 0.3, tension: 0.45, space: 0.85 };
  }
  if (has(['踊', '舞踏', '祭', '子供', '春', 'ルノワール', '草間', 'ウォーホル', '南瓜'])) {
    return { tonic: 'F', scale: 'lydian', tempoBpm: 88, texture: 'bell', brightness: 0.8, warmth: 0.4, density: 0.65, tension: 0.15, space: 0.5 };
  }
  if (has(['睡蓮', '水', '海', '湖', '風景', 'モネ', 'フェルメール', '光'])) {
    return { tonic: 'D', scale: 'ionian', tempoBpm: 48, texture: 'glass', brightness: 0.6, warmth: 0.45, density: 0.3, tension: 0.1, space: 0.9 };
  }
  return DEFAULT_MUSIC_SPEC;
}

/** Guides cached before the spec existed stored one of these five mood words. */
const LEGACY_MOOD_SPECS: Record<string, MusicSpec> = {
  serene: { tonic: 'C', scale: 'ionian', tempoBpm: 48, texture: 'glass', brightness: 0.6, warmth: 0.45, density: 0.3, tension: 0.1, space: 0.85 },
  dramatic: { tonic: 'G', scale: 'phrygian', tempoBpm: 74, texture: 'strings', brightness: 0.25, warmth: 0.8, density: 0.5, tension: 0.85, space: 0.7 },
  melancholic: { tonic: 'A', scale: 'aeolian', tempoBpm: 52, texture: 'strings', brightness: 0.3, warmth: 0.6, density: 0.3, tension: 0.4, space: 0.8 },
  playful: { tonic: 'F', scale: 'lydian', tempoBpm: 86, texture: 'bell', brightness: 0.8, warmth: 0.4, density: 0.6, tension: 0.15, space: 0.5 },
  sacred: { tonic: 'G', scale: 'aeolian', tempoBpm: 44, texture: 'choir', brightness: 0.35, warmth: 0.6, density: 0.2, tension: 0.2, space: 0.95 },
};

export function specFromLegacyMood(mood: unknown): MusicSpec | null {
  if (typeof mood !== 'string') return null;
  return LEGACY_MOOD_SPECS[mood] ?? null;
}

function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Map a scale degree (may be negative or beyond one octave) to a midi note. */
function degreeToMidi(spec: MusicSpec, rootMidi: number, degree: number): number {
  const steps = SCALES[spec.scale];
  const octave = Math.floor(degree / steps.length);
  const index = ((degree % steps.length) + steps.length) % steps.length;
  return rootMidi + steps[index] + octave * 12;
}

/** Noise burst with exponential decay — a cheap stand-in for a real impulse response. */
function createImpulseResponse(context: AudioContext, space: number): AudioBuffer {
  const seconds = 0.4 + space * 3.5;
  const length = Math.max(1, Math.floor(context.sampleRate * seconds));
  const buffer = context.createBuffer(2, length, context.sampleRate);
  const decay = 2 + (1 - space) * 4;
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return buffer;
}

const DUCK_FACTOR = 0.35;
const FADE_IN_SECONDS = 3;
const FADE_OUT_SECONDS = 1;
const DUCK_SECONDS = 0.6;

export class AmbientPlayer {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private padGain: GainNode | null = null;
  private noteBus: GainNode | null = null;
  private padOscillators: OscillatorNode[] = [];
  private lfo: OscillatorNode | null = null;
  private noteTimer: ReturnType<typeof setInterval> | null = null;
  private spec: MusicSpec | null = null;
  private degree = 0;
  private ducked = false;

  start(spec: MusicSpec): MusicSpec | null {
    this.stop();

    const AudioContextClass =
      typeof window === 'undefined'
        ? undefined
        : window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;

    const texture = TEXTURE_CONFIG[spec.texture];
    const context = new AudioContextClass();
    const now = context.currentTime;

    const masterGain = context.createGain();
    masterGain.gain.setValueAtTime(0, now);
    masterGain.connect(context.destination);

    // brightness drives the cutoff; a dark spec sounds distant and muffled
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(220 + spec.brightness * 3600, now);
    filter.connect(masterGain);

    // Parallel dry/wet so `space` is audible without washing the pad away
    const dry = context.createGain();
    dry.gain.setValueAtTime(1 - spec.space * 0.6, now);
    dry.connect(filter);

    const reverb = context.createConvolver();
    reverb.buffer = createImpulseResponse(context, spec.space);
    const wet = context.createGain();
    wet.gain.setValueAtTime(spec.space * 0.9, now);
    reverb.connect(wet);
    wet.connect(filter);

    const bus = context.createGain();
    bus.gain.setValueAtTime(1, now);
    bus.connect(dry);
    bus.connect(reverb);

    const padGain = context.createGain();
    padGain.gain.setValueAtTime(texture.padLevel, now);
    padGain.connect(bus);

    const noteBus = context.createGain();
    noteBus.gain.setValueAtTime(texture.leadLevel, now);
    noteBus.connect(bus);

    const rootMidi = 36 + TONICS.indexOf(spec.tonic); // C2-based root
    // Root / third / fifth of the mode, plus a colour tone when the spec is tense
    const chordDegrees = spec.tension > 0.6 ? [0, 2, 4, 6] : [0, 2, 4];
    this.padOscillators = chordDegrees.map((degree, index) => {
      const osc = context.createOscillator();
      // warmth blends a plain sine into the texture's richer waveform
      osc.type = spec.warmth > 0.5 ? texture.padType : 'sine';
      osc.frequency.setValueAtTime(midiToFrequency(degreeToMidi(spec, rootMidi + 12, degree)), now);
      osc.detune.setValueAtTime((index - 1) * spec.tension * 14, now);
      osc.connect(padGain);
      osc.start();
      return osc;
    });

    // Slow breathing so the pad never sits perfectly still
    const lfo = context.createOscillator();
    const lfoGain = context.createGain();
    lfo.frequency.setValueAtTime(0.04 + spec.density * 0.2, now);
    lfoGain.gain.setValueAtTime(texture.padLevel * 0.35, now);
    lfo.connect(lfoGain);
    lfoGain.connect(padGain.gain);
    lfo.start();

    masterGain.gain.linearRampToValueAtTime(1, now + FADE_IN_SECONDS);

    this.context = context;
    this.masterGain = masterGain;
    this.padGain = padGain;
    this.noteBus = noteBus;
    this.lfo = lfo;
    this.spec = spec;
    this.degree = 0;
    this.ducked = false;

    this.scheduleNotes(spec);

    return spec;
  }

  /** Sparse melodic notes drawn from the mode, walking up and down by step. */
  private scheduleNotes(spec: MusicSpec) {
    const beatsPerNote = spec.density > 0.66 ? 1 : spec.density > 0.33 ? 2 : 4;
    const intervalMs = (60 / spec.tempoBpm) * beatsPerNote * 1000;

    this.noteTimer = setInterval(() => {
      // density also decides how often a slot is a rest
      if (Math.random() > 0.35 + spec.density * 0.6) return;
      this.degree += Math.random() < 0.5 ? -1 : 1;
      if (Math.abs(this.degree) > 7) this.degree = 0;
      this.playNote(spec, this.degree);
    }, Math.max(400, intervalMs));
  }

  private playNote(spec: MusicSpec, degree: number) {
    const context = this.context;
    const noteBus = this.noteBus;
    if (!context || !noteBus) return;

    const texture = TEXTURE_CONFIG[spec.texture];
    const rootMidi = 36 + TONICS.indexOf(spec.tonic) + 12 * (1 + texture.leadOctave);
    const now = context.currentTime;

    const osc = context.createOscillator();
    osc.type = texture.leadType;
    osc.frequency.setValueAtTime(midiToFrequency(degreeToMidi(spec, rootMidi, degree)), now);
    osc.detune.setValueAtTime((Math.random() - 0.5) * spec.tension * 20, now);

    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(1, now + texture.attack);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + texture.attack + texture.release);

    osc.connect(envelope);
    envelope.connect(noteBus);
    osc.start(now);
    osc.stop(now + texture.attack + texture.release + 0.1);
    osc.onended = () => {
      try {
        envelope.disconnect();
      } catch {}
    };
  }

  /** Lower the music while speech plays, restore it afterwards. */
  setDucked(ducked: boolean) {
    if (this.ducked === ducked) return;
    this.ducked = ducked;

    const context = this.context;
    const masterGain = this.masterGain;
    if (!context || !masterGain) return;

    const target = ducked ? DUCK_FACTOR : 1;
    masterGain.gain.cancelScheduledValues(context.currentTime);
    masterGain.gain.setValueAtTime(masterGain.gain.value, context.currentTime);
    masterGain.gain.linearRampToValueAtTime(target, context.currentTime + DUCK_SECONDS);
  }

  stop() {
    const context = this.context;
    const masterGain = this.masterGain;
    const padOscillators = this.padOscillators;
    const lfo = this.lfo;

    if (this.noteTimer) clearInterval(this.noteTimer);
    this.noteTimer = null;
    this.context = null;
    this.masterGain = null;
    this.padGain = null;
    this.noteBus = null;
    this.padOscillators = [];
    this.lfo = null;
    this.spec = null;
    this.ducked = false;

    if (!context || !masterGain) return;

    try {
      masterGain.gain.cancelScheduledValues(context.currentTime);
      masterGain.gain.setValueAtTime(masterGain.gain.value, context.currentTime);
      masterGain.gain.linearRampToValueAtTime(0, context.currentTime + FADE_OUT_SECONDS);
      setTimeout(() => {
        padOscillators.forEach(osc => {
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
