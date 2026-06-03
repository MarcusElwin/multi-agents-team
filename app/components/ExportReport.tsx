'use client';

import { useState, useRef, useEffect } from 'react';
import { Download, ChevronDown, FileText, Printer } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { buildArchitecturesReport } from '@/lib/build-report';

/**
 * Exports the architectures + reading list as a self-contained styled report:
 *   · Download HTML  → a single .html file
 *   · Save as PDF    → opens the report in a new window and triggers print
 *                      (the browser's "Save as PDF"), using the report's print CSS.
 */
export function ExportReport() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const downloadHtml = () => {
    const html = buildArchitecturesReport();
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'multi-agent-architectures.html';
    a.click();
    URL.revokeObjectURL(url);
    setOpen(false);
  };

  const printPdf = () => {
    const html = buildArchitecturesReport();
    const w = window.open('', '_blank');
    if (!w) {
      // Popup blocked — fall back to an HTML download.
      downloadHtml();
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    // Give the new document a tick to lay out, then open the print dialog.
    w.onload = () => setTimeout(() => w.print(), 150);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 transition-colors hover:border-stone-300 hover:bg-stone-50"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Download className="h-4 w-4" />
        Export
        <ChevronDown className={cn('h-3.5 w-3.5 text-stone-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-xl border border-stone-200 bg-white py-1 shadow-lg">
          <button
            type="button"
            onClick={printPdf}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-50"
          >
            <Printer className="h-4 w-4 text-stone-500" />
            Save as PDF
          </button>
          <button
            type="button"
            onClick={downloadHtml}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-50"
          >
            <FileText className="h-4 w-4 text-stone-500" />
            Download HTML
          </button>
        </div>
      )}
    </div>
  );
}
