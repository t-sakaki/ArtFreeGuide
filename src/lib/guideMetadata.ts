import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getGuideStore } from '@/lib/guideStore';
import { Locale } from '@/lib/i18n';
import { localizeName } from '@/lib/names';
import { SHARE_META, previewText } from '@/lib/shareMeta';

export async function origin(): Promise<string> {
  const head = await headers();
  const host = head.get('x-forwarded-host') ?? head.get('host') ?? 'localhost:3000';
  const protocol = head.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${protocol}://${host}`;
}

/** The first lines of the archived guide, when the shared artwork has one. */
async function guideSummary(title: string, artist: string, locale: Locale): Promise<string | null> {
  try {
    const stored = await getGuideStore().get(title, artist, locale);
    if (!stored) return null;
    const payload = JSON.parse(stored.payload) as { short?: unknown; standard?: unknown };
    const text = typeof payload.short === 'string' ? payload.short : payload.standard;
    return typeof text === 'string' && text.trim() ? previewText(text) : null;
  } catch (error) {
    console.error('Share summary lookup failed:', error);
    return null;
  }
}

/**
 * A shared link has to unfurl into the artwork itself: the guide is rendered in
 * the browser, so without this a crawler would only ever see the empty shell
 * and every link would look the same.
 */
export async function guideMetadata({
  title,
  artist,
  locale,
  canonical,
}: {
  title: string;
  artist: string;
  locale: Locale;
  /** Path the artwork should be indexed under, when it has a permalink. */
  canonical?: string;
}): Promise<Metadata> {
  const copy = SHARE_META[locale];
  const base = await origin();
  const shown = title ? localizeName(title, locale) : '';
  const shownArtist = artist ? localizeName(artist, locale) : '';

  const heading = shown
    ? copy.guide(shownArtist ? `${shown}（${shownArtist}）` : shown)
    : `${copy.siteName} | ${copy.tagline}`;
  const description = (shown ? await guideSummary(title, artist, locale) : null) ?? copy.tagline;

  const image = new URL(title ? '/api/og-image' : '/og-default.png', base);
  if (title) {
    image.searchParams.set('artwork', title);
    if (artist) image.searchParams.set('artist', artist);
  }

  return {
    metadataBase: new URL(base),
    title: heading,
    description,
    ...(canonical ? { alternates: { canonical } } : {}),
    openGraph: {
      type: 'article',
      siteName: copy.siteName,
      title: heading,
      description,
      ...(canonical ? { url: new URL(canonical, base).toString() } : {}),
      images: [{ url: image.toString(), width: 1200, height: 630, alt: shown || copy.siteName }],
    },
    twitter: {
      card: 'summary_large_image',
      title: heading,
      description,
      images: [image.toString()],
    },
  };
}
