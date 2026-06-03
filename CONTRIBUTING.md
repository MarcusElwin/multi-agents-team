# Contributing

This is a **living reference** for multi-agent AI architectures — and contributions are very welcome. The most valuable additions are **new coordination patterns** and **good references** (papers, posts, framework docs).

## Quick start

```bash
pnpm install          # this is a pnpm repo — do NOT use npm
cp .env.example .env.local   # add OPENAI_API_KEY (and/or ANTHROPIC_API_KEY)
pnpm dev              # needs Node 20.9+ (Next 16)
```

- Type-check: `pnpm exec tsc --noEmit`
- Smoke-test every mode end-to-end: `pnpm test:smoke` (needs an API key; `pnpm test:smoke v4 v8` to target specific modes)

## Add a reference

Easiest contribution. Edit **`lib/references.ts`** — add an entry to a section (or a new section). Per-pattern references live on each mode in **`lib/modes.ts`** (`references: [...]`). If the source has a brand logo, drop the SVG in `public/logos/<slug>.svg` and map it in `logoFor()`.

## Add a new architecture (mode)

The patterns are data-driven; adding one is mostly a runner + a mode entry. Using an existing mode as a template:

1. **Runner** — `lib/<name>-runner.ts`: a class + an exported `runX(query, options, onEvent?, conversation?)`. It accepts `{ model, apiKey, providerId }`, wraps its body in `withProvider(...)`, builds agents with `provider()(model)`, and emits `AgentEvent`s (`iteration_start`/`iteration_end` with token+cost, a `workflow_complete` with the `result` and an optional structured `summary`). `lib/hierarchical-runner.ts` is the cleanest template.
2. **Agents** — `lib/agents-<vN>/*.ts`: `new Agent({ model: provider()(model), system, tools, onStepFinish: makeStepHook(hooks) })`.
3. **Route** — `app/api/agents-<vN>/route.ts`: clone an existing one (it reads `apiKey`/`provider` from the body via `resolveCredentials`).
4. **Events** — add any new event variants + `RunSummary` kind to `lib/agent-events.ts`; widen the `mode` unions.
5. **Mode spec** — add a `MODES.vN` entry in `lib/modes.ts` (icon, tagline, description, `howItWorks`, `whenToUse`, `tradeoff`, `references`, `note`) and append to `MODE_LIST`. The landing grid, `/architectures/<vN>` page, and mode dropdown pick it up automatically.
6. **UI** (optional) — add a case to `app/components/DebugDrawer.tsx` for new events, and a bespoke card to `app/components/StrategyViews.tsx` if your `summary` warrants one.
7. **Smoke test** — add the runner to `scripts/smoke-test.ts`.

Open patterns we'd love help with are tracked as [issues](https://github.com/MarcusElwin/multi-agents-team/issues) (e.g. v10 Advisor/escalation).

## Conventions

- TypeScript, 2-space indent, match the surrounding style.
- Run `tsc --noEmit` before opening a PR; `pnpm build` should pass on Node 20+.
- Keep API keys out of logs and never commit them.

Thanks for contributing! — Marcus @ UmaiTech
