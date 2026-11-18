/** Keep the fallback on this origin and restrict upstream lookups to Commons files. */
export function commonsImageFallback(src: string): string | null {
  try {
    const url = new URL(src);
    let file: string | undefined;
    if (url.protocol !== 'https:') return null;
    if (url.hostname === 'commons.wikimedia.org' && url.pathname.startsWith('/wiki/Special:FilePath/')) {
      file = decodeURIComponent(url.pathname.slice('/wiki/Special:FilePath/'.length));
    } else if (['upload.wikimedia.org', 'thumb.wikimedia.org'].includes(url.hostname)) {
      file = decodeURIComponent(url.pathname.match(/^\/wikipedia\/commons\/(?:thumb\/)?[a-f0-9]\/[a-f0-9]{2}\/([^/]+)/)?.[1] ?? '');
    }
    if (!file || !isCommonsImageFile(file)) return null;
    const params = new URLSearchParams({ file, width: url.searchParams.get('width') || '960' });
    return `/api/artwork-image/file?${params}`;
  } catch {
    return null;
  }
}

export function isCommonsImageFile(file: string): boolean {
  return file.length <= 512 && !/[\r\n\0/\\]/.test(file) && /\.(?:jpe?g|png|webp|gif)$/i.test(file);
}