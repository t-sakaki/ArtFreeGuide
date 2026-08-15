import baseReadings from '@/data/readings.json';

/**
 * Reading dictionary for the speech synthesiser.
 *
 * The Web Speech API gives no way to supply readings (Chrome ignores SSML
 * `<phoneme>`), so the only lever is the string handed to the utterance.
 * Entries are applied to that string only — the guide text on screen is never
 * touched, so the visitor still reads the original kanji.
 *
 * The baseline lives in `src/data/readings.json`; write replacements in
 * katakana, which Japanese voices read literally. Visitors can report a
 * misreading through the feedback form, and readings approved in
 * `pronunciation_corrections` are layered on top at runtime by
 * `loadDynamicReadings()`.
 */
const BASE_READINGS: Record<string, string> = baseReadings;

let readings: Record<string, string> = BASE_READINGS;
let pattern = buildPattern(readings);

function buildPattern(map: Record<string, string>): RegExp {
  return new RegExp(
    Object.keys(map)
      // Longest first, so 木版画 wins over 木版.
      .sort((a, b) => b.length - a.length)
      .map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|'),
    'g'
  );
}

/** Layer approved corrections over the bundled dictionary. */
export function setDynamicReadings(corrections: Record<string, string>): void {
  const usable = Object.entries(corrections).filter(
    ([original, reading]) => original.trim() && reading.trim()
  );

  readings = { ...BASE_READINGS, ...Object.fromEntries(usable) };
  pattern = buildPattern(readings);
}

/**
 * Fetch the approved corrections once per page load. A failure leaves the
 * bundled dictionary in place, so narration keeps working offline.
 */
export async function loadDynamicReadings(): Promise<void> {
  try {
    const res = await fetch('/api/readings');
    if (!res.ok) return;

    const data = (await res.json()) as { readings?: Record<string, string> };
    if (data.readings && Object.keys(data.readings).length > 0) {
      setDynamicReadings(data.readings);
    }
  } catch (error) {
    console.error('Failed to load approved readings:', error);
  }
}

/**
 * Rewrite a guide sentence into what the synthesiser should say.
 * Display text must keep using the original string.
 */
export function toSpokenText(text: string): string {
  return text.replace(pattern, term => readings[term]);
}
