import { describe, expect, it } from 'vitest';
import { getWorkNavigationState } from './workNavigation';

describe('getWorkNavigationState', () => {
  it('enables next work during an active tour even when at the latest history entry', () => {
    const state = getWorkNavigationState({
      hasActiveTour: true,
      tourIndex: 0,
      tourLength: 5,
      historyIndex: 0,
      historyLength: 1,
      loading: false,
    });

    expect(state).toEqual({
      mode: 'tour',
      canGoPrev: false,
      canGoNext: true,
      prevIndex: -1,
      nextIndex: 1,
    });
  });

  it('enables both prev and next in the middle of a tour', () => {
    const state = getWorkNavigationState({
      hasActiveTour: true,
      tourIndex: 2,
      tourLength: 5,
      historyIndex: 4,
      historyLength: 5,
      loading: false,
    });

    expect(state).toEqual({
      mode: 'tour',
      canGoPrev: true,
      canGoNext: true,
      prevIndex: 1,
      nextIndex: 3,
    });
  });

  it('disables next work at the end of a tour', () => {
    const state = getWorkNavigationState({
      hasActiveTour: true,
      tourIndex: 4,
      tourLength: 5,
      historyIndex: 0,
      historyLength: 3,
      loading: false,
    });

    expect(state).toEqual({
      mode: 'tour',
      canGoPrev: true,
      canGoNext: false,
      prevIndex: 3,
      nextIndex: 5,
    });
  });

  it('disables both buttons while loading', () => {
    const state = getWorkNavigationState({
      hasActiveTour: true,
      tourIndex: 1,
      tourLength: 5,
      historyIndex: 1,
      historyLength: 3,
      loading: true,
    });

    expect(state.canGoPrev).toBe(false);
    expect(state.canGoNext).toBe(false);
  });

  it('falls back to history navigation when no tour is active', () => {
    const state = getWorkNavigationState({
      hasActiveTour: false,
      tourIndex: 0,
      tourLength: 0,
      historyIndex: 1,
      historyLength: 3,
      loading: false,
    });

    expect(state).toEqual({
      mode: 'history',
      canGoPrev: true,
      canGoNext: true,
      prevIndex: 0,
      nextIndex: 2,
    });
  });

  it('disables prev at the start and next at the end of history', () => {
    expect(
      getWorkNavigationState({
        hasActiveTour: false,
        tourIndex: 0,
        tourLength: 0,
        historyIndex: 0,
        historyLength: 1,
        loading: false,
      }),
    ).toEqual({
      mode: 'history',
      canGoPrev: false,
      canGoNext: false,
      prevIndex: -1,
      nextIndex: 1,
    });
  });
});
