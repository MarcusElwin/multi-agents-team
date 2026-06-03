'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { MODE_LIST, type Mode } from '@/lib/modes';

export function ModeSelector({
  value,
  onChange,
  disabled,
}: {
  value: Mode;
  onChange: (m: Mode) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const current = MODE_LIST.find((m) => m.value === value) ?? MODE_LIST[0];
  const CurrentIcon = current.icon;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-700 transition-colors',
          'hover:bg-stone-50',
          disabled && 'cursor-not-allowed opacity-50'
        )}
      >
        <CurrentIcon className="h-3.5 w-3.5 shrink-0 text-stone-500" />
        <span className="hidden sm:inline">{current.label}</span>
        <ChevronDown
          className={cn('h-3.5 w-3.5 text-stone-400 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-50 mt-1 max-h-[min(70vh,24rem)] w-[min(18rem,calc(100vw-1.5rem))] overflow-y-auto overscroll-contain rounded-xl border border-stone-200 bg-white py-1 shadow-lg [scrollbar-width:thin]"
        >
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-stone-400">
            Agentic system
          </div>
          {MODE_LIST.map((opt) => {
            const selected = opt.value === value;
            const Icon = opt.icon;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-start gap-3 px-3 py-2 text-left text-sm transition-colors',
                  selected ? 'bg-stone-100' : 'hover:bg-stone-50'
                )}
              >
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-stone-100">
                  <Icon className="h-3.5 w-3.5 text-stone-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-stone-900">{opt.label}</div>
                  <div className="text-[11px] text-stone-500">{opt.tagline}</div>
                </div>
                {selected && <Check className="mt-0.5 h-4 w-4 shrink-0 text-stone-600" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
