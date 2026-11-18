'use client';

import { useState, type ComponentPropsWithRef, type ReactNode } from 'react';
import { commonsImageFallback } from '@/lib/commonsImageFallback';

type Props = ComponentPropsWithRef<'img'> & { fallback?: ReactNode };

/** Retry a failed external image through the app once, rather than leaving a black stage. */
export default function ResilientArtworkImage({ src, onError, fallback, ...props }: Props) {
  const [failure, setFailure] = useState<{ src: string; final: boolean } | null>(null);
  const original = typeof src === 'string' ? src : '';
  const proxy = original ? commonsImageFallback(original) : null;
  const failed = failure?.src === original;

  if (failure?.src === original && failure.final) return fallback ?? null;

  return (
    <img
      {...props}
      src={failed && proxy ? proxy : src}
      onError={event => {
        if (!failed && proxy) {
          setFailure({ src: original, final: false });
          return;
        }
        setFailure({ src: original, final: true });
        onError?.(event);
      }}
    />
  );
}