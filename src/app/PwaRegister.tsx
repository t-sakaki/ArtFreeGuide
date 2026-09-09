'use client';

import { useEffect } from 'react';

/** Registers the service worker required for PWA/TWA installability. */
export default function PwaRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  return null;
}
