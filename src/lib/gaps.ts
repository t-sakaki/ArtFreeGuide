export interface GapMessage {
  field: string;
  ja: string;
  en?: string;
}

export interface Gaps {
  fields: string[];
  messages: GapMessage[];
}

export interface ArtworkInputData {
  title?: string | null;
  artist?: string | null;
  year?: string | null;
  location?: string | null;
  medium?: string | null;
  imageUrl?: string | null;
  dimensions?: string | null;
  images?: Array<{ url: string }>;
}

function isUnknownOrEmpty(val?: string | null): boolean {
  if (!val || typeof val !== 'string') return true;
  const trimmed = val.trim().toLowerCase();
  if (!trimmed || trimmed === '-' || trimmed === 'null' || trimmed === 'undefined' || trimmed === 'none') return true;
  if (trimmed.includes('不明') || trimmed.includes('unknown')) return true;
  return false;
}

function hasNoImage(artwork: ArtworkInputData): boolean {
  if (artwork.imageUrl && artwork.imageUrl.trim() && artwork.imageUrl.trim() !== 'null') {
    return false;
  }
  if (artwork.images && artwork.images.length > 0 && artwork.images.some(img => img.url && img.url.trim())) {
    return false;
  }
  return true;
}

/**
 * Detects missing or unknown information fields for an artwork prior to or after guide generation.
 */
export function detectGaps(artwork: ArtworkInputData): Gaps {
  const fields: string[] = [];
  const messages: GapMessage[] = [];

  // 1. Check imageUrl
  if (hasNoImage(artwork)) {
    fields.push('imageUrl');
    messages.push({
      field: 'imageUrl',
      ja: 'この作品の画像について心当たりはありますか？',
      en: 'Do you have an image of this artwork?'
    });
  }

  // 2. Check year
  if (isUnknownOrEmpty(artwork.year)) {
    fields.push('year');
    messages.push({
      field: 'year',
      ja: '制作年について情報をお持ちですか？',
      en: 'Do you have information about the creation year?'
    });
  }

  // 3. Check location
  if (isUnknownOrEmpty(artwork.location)) {
    fields.push('location');
    messages.push({
      field: 'location',
      ja: '所蔵している美術館やコレクションの情報をお持ちですか？',
      en: 'Do you have information about the museum or location?'
    });
  }

  // 4. Check medium
  if (isUnknownOrEmpty(artwork.medium)) {
    fields.push('medium');
    messages.push({
      field: 'medium',
      ja: '技法や材質（油彩、キャンバス等）について情報をお持ちですか？',
      en: 'Do you have information about the medium or materials?'
    });
  }

  // 5. Check dimensions
  if (isUnknownOrEmpty(artwork.dimensions)) {
    fields.push('dimensions');
    messages.push({
      field: 'dimensions',
      ja: '作品のサイズ・寸法について情報をお持ちですか？',
      en: 'Do you have information about the dimensions?'
    });
  }

  return { fields, messages };
}
