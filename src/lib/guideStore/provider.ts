/** A generated guide, stored verbatim so a repeat visit skips the LLM entirely. */
export interface StoredGuide {
  /** The raw JSON payload the guide endpoint returned to the browser. */
  payload: string;
  updatedAt: string | null;
}

export interface GuideStore {
  readonly name: string;
  get(title: string, artist: string): Promise<StoredGuide | null>;
  put(title: string, artist: string, payload: string): Promise<void>;
}

/** Titles arrive from free text, so normalise before they become a key. */
export function guideKey(title: string, artist: string): string {
  return `${title.trim().toLowerCase()}::${artist.trim().toLowerCase()}`;
}
