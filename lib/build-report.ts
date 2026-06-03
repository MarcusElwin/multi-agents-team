import { MODE_LIST } from './modes';
import { REFERENCE_SECTIONS } from './references';

/**
 * Builds a self-contained, print-friendly HTML document summarizing all the
 * agent architectures + the curated reading list. No framework, no external
 * assets — inline <style> with print CSS so "Save as PDF" looks clean.
 * Used by the /references "Export" action for both HTML download and print.
 */

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const STYLES = `
  :root {
    --ink: #1c1917; --muted: #57534e; --faint: #a8a29e;
    --line: #e7e5e4; --paper: #ffffff; --soft: #fafaf9; --accent: #0f172a;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; color: var(--ink); background: var(--soft);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    line-height: 1.55; font-size: 14px;
  }
  .wrap { max-width: 760px; margin: 0 auto; padding: 48px 28px 64px; }
  header.doc { border-bottom: 1px solid var(--line); padding-bottom: 20px; margin-bottom: 28px; }
  .eyebrow { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--faint); font-weight: 600; }
  h1 { font-size: 30px; line-height: 1.15; letter-spacing: -.01em; margin: 8px 0 6px; }
  h2.section { font-size: 20px; margin: 40px 0 4px; letter-spacing: -.01em; }
  h3 { font-size: 16px; margin: 0; }
  p.lede { color: var(--muted); margin: 6px 0 0; }
  .card { background: var(--paper); border: 1px solid var(--line); border-radius: 14px; padding: 18px 20px; margin: 14px 0; }
  .card-head { display: flex; align-items: baseline; gap: 8px; }
  .badge { font: 600 10px ui-monospace, monospace; text-transform: uppercase; letter-spacing: .06em; color: var(--faint); }
  .tag { display: inline-block; border: 1px solid var(--line); border-radius: 999px; padding: 1px 8px; font-size: 11px; color: var(--muted); margin-left: auto; }
  .tagline { color: var(--muted); margin: 8px 0 0; }
  .label { font-size: 10px; text-transform: uppercase; letter-spacing: .07em; color: var(--faint); font-weight: 600; margin-top: 14px; }
  ol.steps { margin: 6px 0 0; padding-left: 18px; color: var(--muted); }
  ol.steps li { margin: 3px 0; }
  .kv { font-size: 13px; color: var(--muted); margin-top: 4px; }
  .kv b { color: var(--ink); font-weight: 600; }
  .agents div { font-size: 13px; color: var(--muted); margin-top: 2px; }
  .agents b { color: var(--ink); font-weight: 600; display: inline-block; min-width: 96px; }
  .note { background: var(--soft); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; margin-top: 12px; font-size: 13px; color: var(--muted); }
  a { color: var(--accent); text-decoration: none; }
  ul.refs { list-style: none; margin: 6px 0 0; padding: 0; }
  ul.refs li { font-size: 13px; margin: 4px 0; color: var(--muted); }
  ul.refs .src { color: var(--faint); }
  footer.doc { border-top: 1px solid var(--line); margin-top: 48px; padding-top: 18px; font-size: 12px; color: var(--faint); text-align: center; }
  @media print {
    body { background: #fff; font-size: 12px; }
    .wrap { max-width: none; padding: 0 12px; }
    .card { break-inside: avoid; border-radius: 8px; }
    h2.section { break-after: avoid; }
    a { color: var(--ink); }
    @page { margin: 18mm 14mm; }
  }
`;

export function buildArchitecturesReport(): string {
  const date = new Date().toISOString().slice(0, 10);

  const archCards = MODE_LIST.map((m) => {
    const steps = m.howItWorks.map((s) => `<li>${esc(s)}</li>`).join('');
    const agents = m.agents
      .map((a) => `<div><b>${esc(a.name)}</b> ${esc(a.role)}</div>`)
      .join('');
    const refs = (m.references ?? [])
      .map((r) => `<li><a href="${esc(r.url)}">${esc(r.label)}</a></li>`)
      .join('');
    return `
      <div class="card">
        <div class="card-head">
          <h3>${esc(m.pattern)}</h3>
          <span class="badge">${esc(m.value)}</span>
          <span class="tag">${esc(m.label)}</span>
        </div>
        <p class="tagline">${esc(m.tagline)}</p>
        <div class="label">How it works</div>
        <ol class="steps">${steps}</ol>
        <div class="kv"><b>Best for:</b> ${esc(m.whenToUse)}</div>
        <div class="kv"><b>Trade-off:</b> ${esc(m.tradeoff)}</div>
        <div class="label">Agents</div>
        <div class="agents">${agents}</div>
        ${m.note ? `<div class="note">${esc(m.note)}</div>` : ''}
        ${refs ? `<div class="label">References</div><ul class="refs">${refs}</ul>` : ''}
      </div>`;
  }).join('');

  const readingList = REFERENCE_SECTIONS.map((sec) => {
    const items = sec.items
      .map(
        (it) =>
          `<li><a href="${esc(it.url)}">${esc(it.title)}</a> · <span class="src">${esc(it.source)} · ${esc(it.type)}</span>${it.note ? `<br><span class="src">${esc(it.note)}</span>` : ''}</li>`,
      )
      .join('');
    return `<h2 class="section">${esc(sec.heading)}</h2>${sec.blurb ? `<p class="lede">${esc(sec.blurb)}</p>` : ''}<ul class="refs">${items}</ul>`;
  }).join('');

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Multi-Agent Architectures — Reference Report</title>
<style>${STYLES}</style>
</head><body>
<div class="wrap">
  <header class="doc">
    <div class="eyebrow">Multi-Agent Team · Reference report</div>
    <h1>${MODE_LIST.length} ways to coordinate LLM agents</h1>
    <p class="lede">How each architecture works, when to use it, its trade-offs, the agents involved, and further reading. Generated ${date}.</p>
  </header>

  <h2 class="section">The architectures</h2>
  ${archCards}

  <h2 class="section">Reading list</h2>
  <p class="lede">Papers, framework docs, and posts on multi-agent systems.</p>
  ${readingList}

  <footer class="doc">Made with ♥ in Stockholm by Marcus Elwin @ UmaiTech · github.com/MarcusElwin/multi-agents-team</footer>
</div>
</body></html>`;
}
