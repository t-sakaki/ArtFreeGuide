'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

/** The order the hints walk the visitor through the app. */
export const FIRST_RUN_STEPS = [
  'artwork',
  'play',
  'hotspot',
  'deepDive',
  'ask',
  'language'
] as const;

export type FirstRunStep = (typeof FIRST_RUN_STEPS)[number];

/** A step and whether its button is on screen right now. */
export type HintCandidate = readonly [FirstRunStep, boolean];

const STORAGE_KEY = 'afg.hints.v1';

/** A hint nobody acted on stops asking, so it never nags during a demo. */
const HINT_LIFETIME_MS = 60_000;

function readDone(): FirstRunStep[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return FIRST_RUN_STEPS.filter(step => parsed.includes(step));
  } catch {
    return [];
  }
}

function writeDone(done: readonly FirstRunStep[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(done));
  } catch {
    // A visitor with storage disabled simply sees the hints again next time.
  }
}

export interface FirstRunHints {
  /** The one hint to show, or null when the visitor needs no help. */
  step: FirstRunStep | null;
  /** Every step is done or dismissed: the walkthrough is over for good. */
  finished: boolean;
  /** The visitor did the thing: never offer this hint again, on any visit. */
  complete: (step: FirstRunStep) => void;
  /** The visitor tapped ✕: stop the whole walkthrough. */
  dismiss: () => void;
  /** Show the walkthrough again from the beginning. */
  restart: () => void;
}

/**
 * Walk a first-time visitor through the app, one bubble at a time.
 *
 * Nothing is ever dimmed or blocked: the caller passes the steps whose buttons
 * are currently on screen, and the earliest one the visitor has not done yet
 * gets a bubble. Doing the thing is what advances the walkthrough, so someone
 * who ignores the bubbles is never stuck behind them.
 *
 * Progress lives in `localStorage` because nothing on the server needs it.
 */
export function useFirstRunHints(candidates: readonly HintCandidate[]): FirstRunHints {
  // Server-rendered markup must not contain hints the client would remove.
  const [done, setDone] = useState<FirstRunStep[] | null>(null);
  const [expired, setExpired] = useState<FirstRunStep[]>([]);

  useEffect(() => {
    setDone(readDone());
  }, []);

  const step = useMemo(() => {
    if (!done) return null;
    for (const [candidate, onScreen] of candidates) {
      if (!onScreen || done.includes(candidate) || expired.includes(candidate)) continue;
      return candidate;
    }
    return null;
  }, [candidates, done, expired]);

  useEffect(() => {
    if (!step) return;
    const timer = setTimeout(() => setExpired(current => [...current, step]), HINT_LIFETIME_MS);
    return () => clearTimeout(timer);
  }, [step]);

  const complete = useCallback((completed: FirstRunStep) => {
    setDone(current => {
      const previous = current ?? readDone();
      if (previous.includes(completed)) return previous;
      const next = [...previous, completed];
      writeDone(next);
      return next;
    });
  }, []);

  const dismiss = useCallback(() => {
    setDone(() => {
      const next = [...FIRST_RUN_STEPS];
      writeDone(next);
      return next;
    });
  }, []);

  const restart = useCallback(() => {
    setExpired([]);
    setDone(() => {
      writeDone([]);
      return [];
    });
  }, []);

  const finished = done !== null && FIRST_RUN_STEPS.every(candidate => done.includes(candidate));

  return { step, finished, complete, dismiss, restart };
}
