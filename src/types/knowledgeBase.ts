export interface ArtworkRecord {
  id: number;
  title: string;
  artist: string;
  location?: string | null;
  year?: string | null;
  guide_short: string;
  guide_standard: string;
  guide_deep: string;
  search_query?: string | null;
  recommendations?: string | null; // JSON string
  artist_slug?: string | null;
  artwork_slug?: string | null;
  view_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface ArtworkImageRecord {
  id: number;
  artwork_id: number;
  url: string;
  is_primary: number; // 0 or 1
  is_valid: number;   // 0 or 1
  added_at?: string;
}

export interface FeedbackRecord {
  id?: number;
  artwork_id: number;
  type: 'content_quality' | 'image_validity' | 'fact_correction';
  score?: number | null;
  comment?: string | null;
  created_at?: string;
}

export interface RecommendationItem {
  title: string;
  artist: string;
  reason: string;
}

export interface ImageItem {
  id: number;
  url: string;
  is_primary: boolean;
  is_valid: boolean;
}

export interface GuideResponse {
  id: number;
  title: string;
  artist: string;
  location?: string | null;
  year?: string | null;
  short: string;
  standard: string;
  deep: string;
  searchQuery?: string | null;
  images: ImageItem[];
  recommendations: RecommendationItem[];
  artist_slug?: string | null;
  artwork_slug?: string | null;
  view_count?: number;
  from_cache: boolean;
}

export interface InitialGuideData {
  id?: number;
  title: string;
  artist: string;
  location?: string | null;
  year?: string | null;
  short: string;
  standard: string;
  deep: string;
  searchQuery?: string | null;
  imageUrl?: string | null;
  recommendations?: RecommendationItem[];
  artistSlug?: string | null;
  artworkSlug?: string | null;
}

export interface PlaylistRecord {
  id: number;
  name: string;
  description?: string | null;
  playlist_slug?: string | null;
  created_at?: string;
}

export interface PlaylistItemRecord {
  id: number;
  playlist_id: number;
  artwork_id: number;
  position: number;
  created_at?: string;
}

export interface PlaylistData {
  id: number;
  name: string;
  description?: string | null;
  slug?: string | null;
  items: Array<InitialGuideData & { position: number }>;
}

export interface PlaylistSummary {
  id: number;
  name: string;
  description: string | null;
  slug: string;
  itemCount: number;
  thumbnailUrl: string | null;
}

