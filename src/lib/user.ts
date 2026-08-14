const STORAGE_KEY = 'art_free_guide_user_id';

/**
 * The app has no login: each browser gets a locally generated uuid that is
 * registered server-side as a `user_profiles` row.
 */
export function getStoredUserId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEY);
}

export async function ensureAnonymousUser(): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  const existing = getStoredUserId();
  if (existing) return existing;

  try {
    const res = await fetch('/api/users', { method: 'POST' });
    if (!res.ok) return null;

    const { userId } = (await res.json()) as { userId?: string };
    if (!userId) return null;

    localStorage.setItem(STORAGE_KEY, userId);
    return userId;
  } catch (error) {
    console.error('Failed to register anonymous user:', error);
    return null;
  }
}
