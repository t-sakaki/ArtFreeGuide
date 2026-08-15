'use client';

import { useEffect, useRef, useState } from 'react';

export interface MenuItem {
  id: string;
  icon: string;
  label: string;
  /** A count shown after the label, e.g. how many works have been heard. */
  badge?: number;
  onSelect: () => void;
}

interface Props {
  label: string;
  items: MenuItem[];
  /** Rendered inside the menu, under the items (the language switcher). */
  footer?: React.ReactNode;
}

/**
 * One button in the corner instead of a row of them.
 *
 * Browse, history, sharing and the account all used to sit in the header,
 * competing with the artwork. They live behind this menu now, so the guide
 * screen is the painting, its text and nothing else.
 */
export default function AppMenu({ label, items, footer }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative font-sans">
      <button
        onClick={() => setOpen(prev => !prev)}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="text-slate-300 hover:text-teal-400 transition-colors bg-slate-900/60 border border-slate-800 hover:border-teal-500/40 w-9 h-9 rounded-xl flex flex-col items-center justify-center gap-[3px] active:scale-95"
      >
        <span className={`block h-[1.5px] w-4 bg-current transition-transform ${open ? 'translate-y-[4.5px] rotate-45' : ''}`} />
        <span className={`block h-[1.5px] w-4 bg-current transition-opacity ${open ? 'opacity-0' : ''}`} />
        <span className={`block h-[1.5px] w-4 bg-current transition-transform ${open ? '-translate-y-[4.5px] -rotate-45' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-11 z-50 w-56 bg-slate-950/95 backdrop-blur-xl border border-slate-800 rounded-2xl p-1.5 shadow-2xl animate-fade-in"
        >
          {items.map(item => (
            <button
              key={item.id}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold text-slate-300 hover:bg-slate-900 hover:text-teal-400 transition-colors text-left"
            >
              <span className="text-sm w-5 text-center shrink-0">{item.icon}</span>
              <span className="truncate">{item.label}</span>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="ml-auto bg-slate-900 border border-slate-800 text-slate-400 font-mono rounded-full px-2 py-0.5 text-[10px]">
                  {item.badge}
                </span>
              )}
            </button>
          ))}

          {footer && <div className="border-t border-slate-800/80 mt-1.5 pt-1.5 px-1.5 pb-0.5">{footer}</div>}
        </div>
      )}
    </div>
  );
}
