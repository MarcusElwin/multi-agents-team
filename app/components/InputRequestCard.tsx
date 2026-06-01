'use client';

import { useState, type FormEvent } from 'react';
import { HelpCircle, ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { prettyAgentName } from '@/lib/modes';

/**
 * Shown mid-run when an agent requests input from the human. Submitting resumes
 * the paused run by answering the matching input_request.
 */
export function InputRequestCard({
  agent,
  question,
  onSubmit,
}: {
  agent: string;
  question: string;
  onSubmit: (answer: string) => void;
}) {
  const [answer, setAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = answer.trim();
    if (!trimmed || submitted) return;
    setSubmitted(true);
    onSubmit(trimmed);
  }

  return (
    <div className="my-4 rounded-2xl border border-sky-200 bg-sky-50 p-4">
      <div className="mb-2 flex items-center gap-2">
        <HelpCircle className="h-4 w-4 text-sky-600" />
        <span className="text-xs font-semibold text-sky-800">
          {prettyAgentName(agent)} needs your input
        </span>
      </div>
      <p className="mb-3 text-sm text-sky-900">{question}</p>
      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <input
          type="text"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          disabled={submitted}
          autoFocus
          placeholder="Type your answer…"
          className={cn(
            'flex-1 rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm',
            'placeholder:text-sky-300 focus:border-sky-400 focus:outline-none',
            'disabled:opacity-60'
          )}
        />
        <button
          type="submit"
          disabled={submitted || !answer.trim()}
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors',
            answer.trim() && !submitted ? 'bg-sky-600 text-white hover:bg-sky-700' : 'bg-sky-200 text-sky-400'
          )}
          aria-label="Send answer"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </form>
      {submitted && <p className="mt-2 text-[11px] text-sky-600">Answer sent — resuming…</p>}
    </div>
  );
}
