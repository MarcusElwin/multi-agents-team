'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { MODEL_OPTIONS, PROVIDER_LIST, type OpenAIModel } from '@/lib/models';

export function ModelSelector({
  value,
  onChange,
  disabled,
}: {
  value: OpenAIModel;
  onChange: (m: OpenAIModel) => void;
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

  const current = MODEL_OPTIONS.find((m) => m.value === value) ?? MODEL_OPTIONS[0];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-700 transition-colors',
          'hover:bg-stone-50',
          disabled && 'cursor-not-allowed opacity-50'
        )}
      >
        <Sparkles className="h-3.5 w-3.5 text-stone-500" />
        <span>{current.label}</span>
        <ChevronDown
          className={cn('h-3.5 w-3.5 text-stone-400 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 max-h-[min(70vh,24rem)] w-[min(16rem,calc(100vw-1.5rem))] overflow-y-auto overscroll-contain rounded-xl border border-stone-200 bg-white py-1 shadow-lg [scrollbar-width:thin]">
          {PROVIDER_LIST.map((p) => {
            const models = MODEL_OPTIONS.filter((m) => m.provider === p.id);
            if (models.length === 0) return null;
            return (
              <div key={p.id}>
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-stone-400">
                  {p.label}
                </div>
                {models.map((opt) => {
                  const selected = opt.value === value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        onChange(opt.value);
                        setOpen(false);
                      }}
                      className={cn(
                        'flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors',
                        selected ? 'bg-stone-100' : 'hover:bg-stone-50'
                      )}
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-stone-100">
                        <Sparkles className="h-3.5 w-3.5 text-stone-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-stone-900">{opt.label}</div>
                        {opt.description && (
                          <div className="truncate text-[11px] text-stone-500">{opt.description}</div>
                        )}
                      </div>
                      {selected && <Check className="h-4 w-4 shrink-0 text-stone-600" />}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
