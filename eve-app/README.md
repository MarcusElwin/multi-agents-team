# mat-eve-app — the eve (Vercel) backend

This directory is the **eve** agent that backs the app's `eve` execution backend.
[eve](https://vercel.com/eve) is Vercel's filesystem-first framework for
**durable** AI agents: you describe an agent as a directory of files and eve
compiles it into an app that runs on Vercel Functions, with durable execution,
sandboxes, approvals, and tracing built in.

Here, that agent (`mat`) hosts the project's **nine coordination patterns**, each
adapted as its own **harness**. The same `lib/` runners that power the in-app
backend run inside eve's durable session — so an eve run renders in the chat UI
identically, but gains checkpointed durability (it survives crashes, deploys, and
cold starts and resumes from its last step).

## Layout

```
eve-app/
├── agent/
│   ├── agent.ts                 # defineAgent — model + durable/sandbox defaults
│   ├── instructions.md          # system prompt (the dispatcher's job)
│   ├── channels/
│   │   └── http.ts              # durable HTTP session entrypoint → streams NDJSON events
│   ├── tools/
│   │   └── run-architecture.ts  # tool form: run a pattern, return the result
│   └── harnesses/               # the nine architectures, one harness each
│       ├── index.ts             #   Mode → HarnessSpec registry
│       ├── types.ts             #   HarnessSpec (durability/parallelism/context knobs)
│       └── v1-orchestrated.ts … v9-swarm.ts
├── shared/
│   └── run.ts                   # mode → harness dispatch (the one seam to lib/)
├── eve.config.ts                # env-driven config (token, agent name, flags)
├── eve.d.ts                     # ambient shim so it typechecks without `eve` installed
├── tsconfig.json                # maps @/* → ../* to reuse this repo's lib/
└── package.json
```

## One harness per architecture

`agent/harnesses/` is the heart of this backend. Each of v1–v9 is a `HarnessSpec`
that binds the existing runner to eve's durable harness with knobs tuned for that
pattern:

| Mode | Pattern | Checkpoint | Parallel | Context control | HITL |
| --- | --- | --- | --- | --- | --- |
| v1 | Orchestrated | iteration | — | summarize | ✅ |
| v2 | Choreographed | turn | — | append (inbox) | — |
| v3 | Hierarchical | node | ✅ (sandboxes) | per-branch | — |
| v4 | Evaluator–Optimizer | round | — | summarize | — |
| v5 | Debate | round | — | append (transcript) | — |
| v6 | Blackboard | round | — | shared-workspace | — |
| v7 | Market | turn | ✅ (bids) | append | — |
| v8 | Self-Consistency | sample | ✅ (sandboxes) | fan-in | — |
| v9 | Swarm | round | ✅ | shared-workspace | — |

- **Checkpoint** — the durable unit eve writes to the session event log, so a
  resume restarts from the last completed unit, not the top.
- **Parallel** — fan-out patterns (v3 sub-agents, v8 samples, v9 swarm, v7 bids)
  run their branches as isolated, durable sub-runs in eve sandboxes.
- **Context control** — how the growing transcript/workspace is fed to the model
  each step (eve's "context control" concept), tuned per pattern.

## Run & deploy

```bash
cd eve-app
npx eve@latest          # install the eve CLI + package, generate real types
eve dev                 # interactive local run
vercel deploy           # deploy to Vercel Functions (vercel deploy --prod for prod)
```

Then point the Next app at it (app-side env, e.g. on Vercel):

```bash
EVE_BASE_URL=https://<your-eve-app>.vercel.app
EVE_API_TOKEN=<shared secret>            # must match this app's EVE_API_TOKEN
NEXT_PUBLIC_EVE_BACKEND_ENABLED=true     # drop the "preview" badge in the UI
```

Select **eve (Vercel)** in the chat backend selector (or set it as the default in
Settings) and runs execute here instead of the in-app harness.

> **Beta note.** eve is in beta. The `eve` package surface used in
> `agent/agent.ts`, `agent/tools/*`, and `agent/channels/http.ts` is described by
> the local `eve.d.ts` shim and marked `VERIFY (eve beta)` where it may differ
> from the installed package; the app-side adapter (`lib/eve/run-eve.ts`) is
> deliberately tolerant of minor frame-shape drift. This directory is excluded
> from the Next app's typecheck/lint (`tsconfig.json` / `eslint.config.mjs`) — it
> ships its own toolchain.
