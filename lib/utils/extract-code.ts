/**
 * Extracts code-ish blocks from agent output for the side preview pane:
 * fenced ```code``` blocks, and — as a fallback — large bare JSON objects the
 * agents often emit inline (API response shapes, data models). Pure, no deps.
 */

export interface CodeBlock {
  /** Display label, e.g. "schema.ts" or "json". */
  label: string;
  language: string;
  code: string;
}

const FENCE_RE = /```([\w.+-]*)\n([\s\S]*?)```/g;

/** Pretty-print a JSON string if it parses; otherwise return it unchanged. */
export function tryPrettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/** Find a balanced JSON object/array starting at `start`, or null. */
function scanBalanced(text: string, start: number): string | null {
  const open = text[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inStr = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Extract preview-worthy code blocks. Fenced blocks first; if none, look for a
 * sizeable bare JSON object/array embedded in the prose.
 */
export function extractCodeBlocks(text: string): CodeBlock[] {
  if (!text) return [];
  const blocks: CodeBlock[] = [];

  let m: RegExpExecArray | null;
  FENCE_RE.lastIndex = 0;
  while ((m = FENCE_RE.exec(text)) !== null) {
    const language = (m[1] || '').toLowerCase() || 'text';
    const code = m[2].trim();
    if (!code) continue;
    blocks.push({
      language,
      label: language === 'text' ? `block ${blocks.length + 1}` : language,
      code: language === 'json' ? tryPrettyJson(code) : code,
    });
  }

  if (blocks.length === 0) {
    // Fallback: find the largest bare JSON blob (>= 80 chars) in the text.
    let best: string | null = null;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '{' || text[i] === '[') {
        const found = scanBalanced(text, i);
        if (found && found.length >= 80 && (!best || found.length > best.length)) {
          // Only keep it if it actually parses as JSON.
          try {
            JSON.parse(found);
            best = found;
          } catch {
            /* not valid JSON, skip */
          }
        }
      }
    }
    if (best) blocks.push({ language: 'json', label: 'json', code: tryPrettyJson(best) });
  }

  return blocks;
}

export function hasPreviewableCode(text: string): boolean {
  return extractCodeBlocks(text).length > 0;
}
