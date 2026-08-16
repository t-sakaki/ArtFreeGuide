'use client';

interface HintBubbleProps {
  show: boolean;
  text: string;
  /** Where the bubble sits relative to the button it points at. */
  placement?: 'above' | 'below';
  dismissLabel: string;
  onDismiss: () => void;
}

/**
 * The bubble that points at the next button to press.
 *
 * It never swallows a tap: the bubble itself is inert so the button underneath
 * stays reachable, and only the ✕ takes clicks.
 */
export default function HintBubble({
  show,
  text,
  placement = 'above',
  dismissLabel,
  onDismiss
}: HintBubbleProps) {
  if (!show) return null;

  return (
    <span
      className={`animate-bounce pointer-events-none absolute left-1/2 z-40 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-teal-500 px-3 py-1 font-sans text-[10px] font-bold text-slate-950 shadow-lg ${
        placement === 'above' ? 'bottom-full mb-2' : 'top-full mt-2'
      }`}
    >
      {text}
      <button
        onClick={onDismiss}
        aria-label={dismissLabel}
        title={dismissLabel}
        className="pointer-events-auto -mr-1 rounded-full px-1 text-[11px] leading-none text-slate-950/60 transition-colors hover:text-slate-950"
      >
        ✕
      </button>
    </span>
  );
}
