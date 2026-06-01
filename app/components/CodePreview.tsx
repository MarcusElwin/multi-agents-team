'use client';

import { useEffect, useState } from 'react';
import { X, Copy, Check, Code2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { CodeBlock } from '@/lib/utils/extract-code';

interface CodePreviewProps {
  open: boolean;
  title?: string;
  blocks: CodeBlock[];
  onClose: () => void;
}

/**
 * Side preview pane for code/JSON blocks extracted from an agent's deliverable.
 * Slide-over (same family as DebugDrawer): language tabs, line numbers, copy.
 * Read-only — no execution.
 */
export function CodePreview({ open, title, blocks, onClose }: CodePreviewProps) {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) setActive(0);
  }, [open, blocks]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const block = blocks[active] ?? blocks[0];

  const copy = async () => {
    if (!block) return;
    try {
      await navigator.clipboard.writeText(block.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked; ignore */
    }
  };

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-stone-900/20 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      )}
      <aside
        className={cn(
          'fixed right-0 top-0 z-50 flex h-full w-full max-w-2xl flex-col border-l border-stone-200 bg-white shadow-2xl transition-transform duration-200 ease-out',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
        aria-hidden={!open}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-stone-200 px-4">
          <div className="flex min-w-0 items-center gap-2">
            <Code2 className="h-4 w-4 shrink-0 text-stone-600" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold leading-tight">{title ?? 'Code preview'}</div>
              <div className="text-[11px] leading-tight text-stone-500">
                {blocks.length} block{blocks.length === 1 ? '' : 's'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-stone-500 hover:bg-stone-100 hover:text-stone-900"
            aria-label="Close code preview"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {blocks.length > 1 && (
          <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-stone-200 px-3 py-2 [scrollbar-width:thin]">
            {blocks.map((b, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActive(i)}
                className={cn(
                  'shrink-0 rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors',
                  i === active
                    ? 'border-stone-900 bg-stone-900 text-white'
                    : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300',
                )}
              >
                {b.label}
              </button>
            ))}
          </div>
        )}

        {block && (
          <div className="relative flex-1 overflow-auto bg-stone-950 [scrollbar-width:thin]">
            <button
              type="button"
              onClick={copy}
              className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/10 px-2 py-1 text-[11px] font-medium text-stone-100 backdrop-blur hover:bg-white/20"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <CodeBody code={block.code} language={block.language} />
          </div>
        )}
      </aside>
    </>
  );
}

// Minimal, dependency-free token highlighting. Good enough for JSON/TS/JS
// readability without pulling in a highlighter (keeps the bundle lean).
const KEYWORDS =
  /\b(const|let|var|function|return|if|else|for|while|import|export|from|type|interface|enum|class|extends|implements|async|await|new|public|private|true|false|null|undefined)\b/g;

function highlight(line: string): React.ReactNode {
  // Order matters: strings first so keywords inside strings aren't recolored.
  const tokens: React.ReactNode[] = [];
  const re = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\/\/[^\n]*)|(\b\d+(?:\.\d+)?\b)/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  const pushPlain = (s: string) => {
    // Highlight keywords within plain segments.
    let l = 0;
    let km: RegExpExecArray | null;
    KEYWORDS.lastIndex = 0;
    while ((km = KEYWORDS.exec(s)) !== null) {
      if (km.index > l) tokens.push(s.slice(l, km.index));
      tokens.push(<span key={key++} className="text-violet-300">{km[0]}</span>);
      l = km.index + km[0].length;
    }
    if (l < s.length) tokens.push(s.slice(l));
  };
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) pushPlain(line.slice(last, m.index));
    if (m[1]) tokens.push(<span key={key++} className="text-emerald-300">{m[1]}</span>);
    else if (m[2]) tokens.push(<span key={key++} className="text-stone-500">{m[2]}</span>);
    else if (m[3]) tokens.push(<span key={key++} className="text-amber-300">{m[3]}</span>);
    last = m.index + m[0].length;
  }
  if (last < line.length) pushPlain(line.slice(last));
  return tokens;
}

function CodeBody({ code, language }: { code: string; language: string }) {
  const lines = code.split('\n');
  const useHighlight = ['json', 'js', 'jsx', 'ts', 'tsx', 'javascript', 'typescript'].includes(language);
  const gutter = String(lines.length).length;

  return (
    <pre className="px-3 py-3 text-[12px] leading-relaxed text-stone-100">
      <code className="font-mono">
        {lines.map((line, i) => (
          <div key={i} className="flex">
            <span className="mr-3 inline-block shrink-0 select-none text-right text-stone-600" style={{ width: `${gutter}ch` }}>
              {i + 1}
            </span>
            <span className="whitespace-pre-wrap break-words">{useHighlight ? highlight(line) : line}</span>
          </div>
        ))}
      </code>
    </pre>
  );
}
