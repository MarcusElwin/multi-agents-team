'use client';

import { useEffect, useState } from 'react';
import { X, KeyRound, Eye, EyeOff, Check, ExternalLink, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { PROVIDER_LIST, type ProviderId } from '@/lib/models';
import { trackApiKeyConfigured } from '@/lib/analytics';

/** True when this deployment requires visitors to bring their own key. */
export const BYO_KEY_ONLY = process.env.NEXT_PUBLIC_BYO_KEY_ONLY === 'true';

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  apiKeys: Partial<Record<ProviderId, string>>;
  onSetKey: (provider: ProviderId, key: string) => void;
  onClearKey: (provider: ProviderId) => void;
}

export function SettingsDrawer({ open, onClose, apiKeys, onSetKey, onClearKey }: SettingsDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-stone-900/20 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      )}
      <aside
        className={cn(
          'fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-stone-200 bg-white shadow-2xl transition-transform duration-200 ease-out',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
        aria-hidden={!open}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-stone-200 px-4">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-stone-600" />
            <div className="text-sm font-semibold">API keys</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-stone-500 hover:bg-stone-100 hover:text-stone-900"
            aria-label="Close settings"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4 [scrollbar-width:thin]">
          {BYO_KEY_ONLY && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] leading-snug text-amber-900">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span>This is a public demo — add your own API key to run agents. Your key is used only for your requests and isn’t stored on the server.</span>
            </div>
          )}

          {PROVIDER_LIST.map((p) => (
            <KeyField
              key={p.id}
              providerId={p.id}
              label={p.label}
              placeholder={`${p.keyPrefix}…`}
              keysUrl={p.keysUrl}
              value={apiKeys[p.id] ?? ''}
              onSave={(key) => onSetKey(p.id, key)}
              onClear={() => onClearKey(p.id)}
            />
          ))}

          <p className="text-[11px] leading-relaxed text-stone-400">
            Keys are stored in this browser only (localStorage) and sent directly to the model
            provider through this app’s API. They’re never persisted on the server or logged.
            Don’t enter keys on a shared computer.
          </p>
        </div>
      </aside>
    </>
  );
}

function KeyField({
  providerId,
  label,
  placeholder,
  keysUrl,
  value,
  onSave,
  onClear,
}: {
  providerId: ProviderId;
  label: string;
  placeholder: string;
  keysUrl: string;
  value: string;
  onSave: (key: string) => void;
  onClear: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const [show, setShow] = useState(false);
  const [saved, setSaved] = useState(false);

  // Keep the field in sync if the stored value changes elsewhere.
  useEffect(() => setDraft(value), [value]);

  const dirty = draft.trim() !== value.trim();

  const save = () => {
    const next = draft.trim();
    onSave(next);
    // Record only the provider + whether a key was set or removed — never the key.
    trackApiKeyConfigured({
      provider: providerId,
      label,
      action: next ? 'configured' : 'cleared',
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="rounded-xl border border-stone-200 p-3">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-sm font-medium text-stone-800">{label}</span>
        <a
          href={keysUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 text-[11px] text-stone-400 hover:text-stone-700"
        >
          get a key <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <div className="flex items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-50/50 px-2 focus-within:border-stone-400">
        <input
          type={show ? 'text' : 'password'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && dirty) save();
          }}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent py-2 font-mono text-xs text-stone-800 placeholder:text-stone-400 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="shrink-0 rounded p-1 text-stone-400 hover:text-stone-700"
          aria-label={show ? 'Hide key' : 'Show key'}
        >
          {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={!dirty}
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
            dirty ? 'bg-stone-900 text-white hover:bg-stone-800' : 'bg-stone-100 text-stone-400',
          )}
        >
          {saved ? <Check className="h-3 w-3" /> : null}
          {saved ? 'Saved' : 'Save'}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => {
              onClear();
              setDraft('');
              trackApiKeyConfigured({ provider: providerId, label, action: 'cleared' });
            }}
            className="text-[11px] font-medium text-stone-400 hover:text-red-600"
          >
            Clear
          </button>
        )}
        {value && !dirty && <span className="text-[11px] text-green-600">● key set</span>}
      </div>
    </div>
  );
}
