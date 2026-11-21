export interface WorkNavigationInput {
  hasActiveTour: boolean;
  tourIndex: number;
  tourLength: number;
  historyIndex: number;
  historyLength: number;
  loading: boolean;
}

export interface WorkNavigationState {
  mode: 'tour' | 'history';
  canGoPrev: boolean;
  canGoNext: boolean;
  prevIndex: number;
  nextIndex: number;
}

/**
 * Resolves the previous/next artwork navigation state for both the tour header
 * and the bottom control panel so they always stay in sync.
 */
export function getWorkNavigationState({
  hasActiveTour,
  tourIndex,
  tourLength,
  historyIndex,
  historyLength,
  loading,
}: WorkNavigationInput): WorkNavigationState {
  if (hasActiveTour) {
    return {
      mode: 'tour',
      canGoPrev: !loading && tourIndex > 0,
      canGoNext: !loading && tourIndex < tourLength - 1,
      prevIndex: tourIndex - 1,
      nextIndex: tourIndex + 1,
    };
  }

  return {
    mode: 'history',
    canGoPrev: !loading && historyIndex > 0,
    canGoNext: !loading && historyIndex < historyLength - 1,
    prevIndex: historyIndex - 1,
    nextIndex: historyIndex + 1,
  };
}
