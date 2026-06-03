# Security

This document is the security review and threat model for the multi-agent
playground. It covers how API keys are handled in the bring-your-own-key (BYO)
model, the public-deploy posture, the request attack surface, and the items
fixed in this review versus the ones left as recommendations.

> **Reporting:** Found a vulnerability? Email **marcus@elwin.com** with details
> and reproduction steps. Please do not open a public issue for security
> reports.

---

## 1. Threat model

The app is a **public, bring-your-own-key demo**. The interesting properties:

- Visitors enter **their own** provider API keys (OpenAI / Anthropic / Mistral /
  Fireworks). The owner does **not** want their server key spent by visitors —
  see `PUBLIC_BYO_KEY_ONLY` below.
- Every model call is **proxied through this app's same-origin `/api/*`
  routes**. The browser never talks to a provider directly, so the user's key
  transits: browser `localStorage` → request body → our route → provider SDK.
- The primary assets to protect: **the visitor's API key** (don't leak/log/
  persist it), **the owner's server key** (don't let visitors spend it in public
  mode), and **the server's availability/cost** (don't let an anonymous caller
  run up unbounded compute).

Out of scope: there is no user database, no auth, no PII storage, no payments.
There is no server-side persistence of any conversation or key.

---

## 2. API key handling

| Property | Behaviour |
| --- | --- |
| **Where the user key lives** | The browser only — `localStorage` key `mat:settings:v1`. Sent per-request in the JSON body to same-origin `/api/*`. |
| **Server persistence** | **None.** Keys exist only for the lifetime of one request, inside an `AsyncLocalStorage` scope (`lib/provider.ts`). Never written to disk, DB, or cache. |
| **Logging** | Routes log the **model id only** (`🎬 API REQUEST: v1 · model=…`). The request body, history, and API key are **never** logged. Verified by grep over `app/api` + `lib`. |
| **Precedence** | `resolveCredentials` (`lib/provider.ts`): user key (body) > server env key > graceful error. |
| **Public mode** | `PUBLIC_BYO_KEY_ONLY=true` makes the server **ignore its own env key** — a visitor must supply their own, so the owner's key is never spent by the public. |
| **Concurrency isolation** | Per-request credentials are carried in `AsyncLocalStorage`, not module state, so two simultaneous runs with different keys cannot cross-talk. |

### Residual risk — `localStorage` is XSS-readable

Keys in `localStorage` are readable by any script running on the origin. This is
an **accepted tradeoff** for a client-only demo with no backend account system,
and it is disclosed to the user in the settings drawer copy ("stored in this
browser only… don't enter keys on a shared computer"). The Content-Security-
Policy (below) is the main mitigation against the XSS that would be required to
read them. A more defensive design (httpOnly cookie + server-side key vault)
would require introducing a backend session layer, which is out of scope for a
keyless demo.

---

## 3. Request attack surface

All nine agent-run routes (`/api/agents`, `/api/agents-v2…v9`) share one body
shape: `{ message, model, history, apiKey, provider }`.

### Fixed in this review

- **Unbounded request body (DoS / cost abuse) — FIXED.**
  Previously the routes parsed `message` and `history` with no size limit, so a
  caller could POST a multi-megabyte body. Added `lib/validate-request.ts`
  (`validateAgentRunBody`), now applied at the top of every run route:
  - `message`: required, non-empty, ≤ 8,000 chars.
  - `history`: optional; must be an array, ≤ 50 turns, each turn a
    `{ role: 'user'|'assistant', content: string }` with content ≤ 20,000 chars.
  - `apiKey`: optional; ≤ 400 chars.
  - `provider`: must be one of the four known ids or it's dropped.
  - Malformed JSON → `400`, never an unhandled throw.
  Verified live: empty / oversized / bad-type / invalid-JSON all return `400`.

- **Missing security headers — FIXED.**
  `next.config.ts` now sets, on every route:
  - `Content-Security-Policy` (see §4)
  - `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'` (clickjacking)
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - `Strict-Transport-Security` (HSTS, 2-year, preload)

### Already safe (verified, no change needed)

- **SSRF via web search — not present.** The researcher's web-search tool
  (`lib/tools/web-search.ts`) uses OpenAI's *hosted* Responses-API web search.
  It does **not** `fetch()` attacker-controlled URLs from our server, so there is
  no classic SSRF vector. On non-OpenAI providers the tool degrades gracefully
  (`webSearchAvailable()` returns false) rather than erroring.
- **Conversation prompt size is bounded downstream.** `Conversation.renderHistory`
  caps at 10 turns × 600 chars when building a prompt, independent of the route
  cap above.
- **No secret leakage in logs.** Confirmed (see §2).

### Known limitations / recommendations (not fixed here)

- **No rate limiting.** There is no per-IP request throttle. In `PUBLIC_BYO_KEY_ONLY`
  mode the cost lands on the *visitor's* key, which limits the owner's financial
  exposure, but an anonymous flood can still consume server compute. **Recommended**
  before a high-traffic public launch: add a rate limiter at the edge (e.g.
  Vercel BotID / a middleware token-bucket keyed on IP). Tracked as a follow-up.
- **Prompt injection.** Agents act on model output and (for the researcher) on
  web content. There are no tools that execute code, write files, or make
  authenticated calls on the user's behalf, so the blast radius of an injection
  is confined to the text of the response. No mitigation beyond that confinement
  is implemented.
- **CSP uses `'unsafe-inline'` / `'unsafe-eval'`.** Next.js injects inline
  bootstrap scripts and Tailwind injects inline styles, so the CSP allows inline
  script/style rather than a nonce pipeline. Tightening this to a nonce-based CSP
  is a worthwhile hardening step but is a larger change; documented here as a
  known gap. `connect-src` is already locked to `'self'` (the browser only ever
  talks to our own origin).

---

## 4. Content-Security-Policy

```
default-src 'self';
script-src 'self' 'unsafe-inline' 'unsafe-eval';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self' data:;
connect-src 'self';
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
object-src 'none'
```

`connect-src 'self'` is the important line: even if a visitor's key is read by
injected script, the CSP blocks exfiltration via `fetch`/`XHR`/`WebSocket` to any
non-origin endpoint. `script-src`/`style-src` allow inline because the framework
requires it today (see §3 limitations).

---

## 5. Environment variables

| Var | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Server fallback key (OpenAI). Ignored when `PUBLIC_BYO_KEY_ONLY=true`. |
| `ANTHROPIC_API_KEY` | Server fallback key (Anthropic). |
| `MISTRAL_API_KEY` | Server fallback key (Mistral). |
| `FIREWORKS_API_KEY` | Server fallback key (Fireworks). |
| `PUBLIC_BYO_KEY_ONLY` | `true` → server ignores its own keys; visitors must bring their own. |
| `NEXT_PUBLIC_BYO_KEY_ONLY` | Client mirror of the above (drives the settings banner). |

Never commit real keys. `.env.local` is git-ignored; use the deployment
platform's encrypted env store in production.
