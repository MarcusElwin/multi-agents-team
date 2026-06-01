/**
 * Extracts code-ish blocks from agent output for the side preview pane:
 * fenced ```code``` blocks, and — as a fallback — large bare JSON objects the
 * agents often emit inline (API response shapes, data models). Pure, no deps.
 */

/** Whether a block can be rendered live in the preview iframe, and how. */
export type PreviewKind = 'html' | 'react' | null;

export interface CodeBlock {
  /** Display label, e.g. "schema.ts" or "json". */
  label: string;
  language: string;
  code: string;
  /** If non-null, the block can be live-rendered in a sandboxed iframe. */
  previewKind: PreviewKind;
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
      previewKind: detectPreviewKind(language, code),
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
    if (best) blocks.push({ language: 'json', label: 'json', code: tryPrettyJson(best), previewKind: null });
  }

  return blocks;
}

export function hasPreviewableCode(text: string): boolean {
  return extractCodeBlocks(text).length > 0;
}

/**
 * Decide if a block can be live-rendered. HTML blocks (or fragments with tags)
 * render directly; JS/JSX/TSX that looks like a React component renders via
 * Babel-in-iframe. Anything else (JSON, SQL, prose, server code) is null.
 */
function detectPreviewKind(language: string, code: string): PreviewKind {
  if (language === 'html') return 'html';
  // A bare HTML fragment mislabeled as text but clearly markup.
  if ((language === 'text' || language === '') && /^\s*<(!doctype|html|div|section|main|button|ul|table|form|h[1-6])/i.test(code)) {
    return 'html';
  }
  if (['jsx', 'tsx', 'react', 'javascript', 'js', 'typescript', 'ts'].includes(language)) {
    // Must contain JSX and define a component to be worth rendering.
    const hasJsx = /<[A-Za-z][\w-]*[\s/>]/.test(code);
    const hasComponent = /\b(function|const)\s+[A-Z]\w*/.test(code) || /export\s+default/.test(code);
    if (hasJsx && hasComponent) return 'react';
  }
  return null;
}

/**
 * Build the iframe srcdoc that renders a previewable block. Includes the
 * Tailwind + (for React) Babel/React CDNs so agent UIs look styled. Runs fully
 * sandboxed — no access to our origin.
 */
export function buildPreviewDoc(block: CodeBlock): string {
  const head = `
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script src="https://cdn.tailwindcss.com"></script>
    <style>body{margin:0;padding:16px;font-family:ui-sans-serif,system-ui,sans-serif;}</style>
  `;

  if (block.previewKind === 'html') {
    // If it's a full document, use as-is; otherwise wrap the fragment.
    if (/^\s*<(!doctype|html)/i.test(block.code)) return block.code;
    return `<!doctype html><html><head>${head}</head><body>${block.code}</body></html>`;
  }

  // React: mount the component. Find an exported/declared component name, else
  // default to the last PascalCase declaration; fall back to "App".
  const nameMatch =
    block.code.match(/export\s+default\s+function\s+([A-Z]\w*)/) ??
    block.code.match(/export\s+default\s+([A-Z]\w*)/) ??
    block.code.match(/function\s+([A-Z]\w*)/) ??
    block.code.match(/const\s+([A-Z]\w*)\s*=/);
  const componentName = nameMatch?.[1] ?? 'App';
  // Strip import/export lines — everything runs in one Babel-compiled scope.
  const stripped = block.code
    .replace(/^\s*import\s.*$/gm, '')
    .replace(/^\s*export\s+default\s+/gm, '')
    .replace(/^\s*export\s+/gm, '');

  return `<!doctype html><html><head>${head}
    <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  </head><body>
    <div id="root"></div>
    <script type="text/babel" data-presets="react,typescript" data-type="module">
      ${stripped}
      try {
        const Comp = typeof ${componentName} !== 'undefined' ? ${componentName} : (() => null);
        ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Comp));
      } catch (e) {
        document.getElementById('root').innerHTML =
          '<pre style="color:#b91c1c;white-space:pre-wrap;font-size:12px">Preview error: ' + (e && e.message) + '</pre>';
      }
    </script>
  </body></html>`;
}
