'use client';

import { memo, useMemo, type ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

function formatInline(text: string): ReactNode {
  if (!/[*_`]/.test(text)) return text;

  const re = /(\*\*(.+?)\*\*)|(__(.+?)__)|(\*([^*]+?)\*)|(_([^_]+?)_)|(`([^`]+?)`)/g;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    if (match[1]) parts.push(<strong key={key++}>{match[2]}</strong>);
    else if (match[3]) parts.push(<strong key={key++}>{match[4]}</strong>);
    else if (match[5]) parts.push(<em key={key++}>{match[6]}</em>);
    else if (match[7]) parts.push(<em key={key++}>{match[8]}</em>);
    else if (match[9])
      parts.push(
        <code key={key++} className="rounded bg-stone-100 px-1 py-0.5 text-xs">
          {match[10]}
        </code>
      );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

export const MarkdownContent = memo(function MarkdownContent({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const elements = useMemo(() => {
    if (!content) return null;
    const lines = content.split('\n');
    const out: ReactNode[] = [];
    let listItems: string[] = [];
    let inList = false;

    const flushList = () => {
      if (listItems.length > 0) {
        out.push(
          <ul key={`list-${out.length}`} className="my-2 list-disc space-y-1 pl-5">
            {listItems.map((item, i) => (
              <li key={i}>{formatInline(item)}</li>
            ))}
          </ul>
        );
        listItems = [];
      }
      inList = false;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Fenced code block: ```lang … ``` — accumulate until the closing fence
      // and render as a monospace block (fences stripped). Must run before the
      // list/heading checks so code content isn't mangled as prose.
      const fence = line.match(/^```([\w.+-]*)\s*$/);
      if (fence) {
        if (inList) flushList();
        const lang = fence[1];
        const codeLines: string[] = [];
        i++;
        while (i < lines.length && !/^```\s*$/.test(lines[i])) {
          codeLines.push(lines[i]);
          i++;
        }
        // i now points at the closing fence (or end of input); the for-loop ++ skips it.
        out.push(
          <pre
            key={`code-${i}`}
            className="my-2 overflow-x-auto rounded-lg bg-stone-950 px-3 py-2 text-[12px] leading-relaxed text-stone-100 [scrollbar-width:thin]"
          >
            {lang && (
              <div className="mb-1 font-mono text-[10px] uppercase tracking-wide text-stone-500">{lang}</div>
            )}
            <code className="whitespace-pre font-mono">{codeLines.join('\n')}</code>
          </pre>
        );
        continue;
      }

      // Markdown pipe table: a "| a | b |" header, a "|---|---|" separator, then
      // "| … |" rows. Render as a real <table> instead of leaking raw pipes.
      const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
      const isTableSep = (l: string) => /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(l) && l.includes('-');
      if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        if (inList) flushList();
        const splitRow = (l: string) =>
          l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
        const headers = splitRow(line);
        i += 2; // skip header + separator
        const rows: string[][] = [];
        while (i < lines.length && isTableRow(lines[i]) && !isTableSep(lines[i])) {
          rows.push(splitRow(lines[i]));
          i++;
        }
        i--; // the for-loop ++ will land on the next unprocessed line
        out.push(
          <div key={`tbl-${i}`} className="my-2 overflow-x-auto rounded-lg border border-stone-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-50 text-[11px] font-medium text-stone-500">
                <tr>
                  {headers.map((h, hi) => (
                    <th key={hi} className="px-2.5 py-1.5">{formatInline(h)}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {rows.map((r, ri) => (
                  <tr key={ri}>
                    {r.map((c, ci) => (
                      <td key={ci} className="px-2.5 py-1.5 text-stone-700">{formatInline(c)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }

      if (/^[-*]\s/.test(line)) {
        inList = true;
        listItems.push(line.replace(/^[-*]\s/, ''));
        continue;
      }
      if (/^\d+\.\s/.test(line)) {
        inList = true;
        listItems.push(line.replace(/^\d+\.\s/, ''));
        continue;
      }
      if (inList) flushList();

      if (line.trim() === '') {
        out.push(<br key={`br-${i}`} />);
        continue;
      }
      if (line.startsWith('### ')) {
        out.push(
          <h3 key={i} className="mt-3 mb-1 text-sm font-semibold">
            {formatInline(line.slice(4))}
          </h3>
        );
        continue;
      }
      if (line.startsWith('## ')) {
        out.push(
          <h2 key={i} className="mt-3 mb-1 text-base font-semibold">
            {formatInline(line.slice(3))}
          </h2>
        );
        continue;
      }
      if (line.startsWith('# ')) {
        out.push(
          <h1 key={i} className="mt-3 mb-1 text-lg font-bold">
            {formatInline(line.slice(2))}
          </h1>
        );
        continue;
      }
      out.push(
        <p key={i} className="my-1">
          {formatInline(line)}
        </p>
      );
    }
    if (inList) flushList();
    return out;
  }, [content]);

  return <div className={cn('text-sm leading-relaxed', className)}>{elements}</div>;
});
