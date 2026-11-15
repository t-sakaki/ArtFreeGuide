const STORAGE_KEY = 'art_free_guide_user_id';

/**
 * The app has no login: each browser gets a locally generated uuid that is
 * registered server-side as a `user_profiles` row.
 */
export function getStoredUserId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEY);
}

/** Point this browser at a profile, e.g. the one resolved after signing in. */
export function setStoredUserId(userId: string): void {
  localStorage.setItem(STORAGE_KEY, userId);
}

/** Forget the profile on sign-out; the next visit starts a fresh anonymous one. */
export function clearStoredUserId(): void {
  localStorage.removeItem(STORAGE_KEY);
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
