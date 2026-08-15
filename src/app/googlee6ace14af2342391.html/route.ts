export const dynamic = 'force-static';

export function GET(): Response {
  return new Response('google-site-verification: googlee6ace14af2342391.html', {
    headers: { 'content-type': 'text/html; charset=utf-8' }
  });
}
