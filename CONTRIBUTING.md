# Contributing to PQC Triage

Thanks for looking. This project is deliberately small in surface area and strict about
being honest, so the bar for a change is mostly "does it stay true when the network is down
and when the input is junk?".

## Getting set up

```bash
git clone https://github.com/aniruddhaadak80/pqc-triage
cd pqc-triage
npm ci
npm run dev
```

You need **no environment variables and no database**. Local development uses an embedded
PGlite Postgres at `.pgdata/`, which is the same Postgres compiled to WebAssembly, running
the same schema and the same SQL that production runs.

## Before you open a pull request

```bash
npm run typecheck   # tsc --noEmit, strict mode
npm run lint        # zero warnings tolerated
npm run test        # vitest
npm run build       # next build
npm run test:browser  # optional; needs a build first
```

CI runs the same four commands on Node 22, plus a browser journey on desktop and a mobile
viewport. All of them must be green.

## What a good pull request looks like

- **Small and single-purpose.** One behaviour change, one test that proves it.
- **Explainable engine changes.** If you touch `src/lib/engine.ts`, `crypto-registry.ts`
  or `resource.ts`, the change needs a citation in the table and a unit test for the
  normal, boundary, empty, malformed and deterministic-repeat cases.
- **A test that would have failed before.** A test that passes on the unmodified code is
  not a test.
- **No secrets, no new required environment variables, no new services.** The core
  experience must keep working with zero configuration.

## House rules

1. **No fake state.** A control that cannot work is removed, not stubbed. There are no
   decorative handlers, no simulated results presented as live, and no counters that do not
   count something real.
2. **One writer.** All state changes go through `src/lib/service.ts`. REST routes and
   JSON-RPC tools both call it; if you add a mutation, add it there first.
3. **Deterministic domain code.** The engine, registry, resource model and classifier must
   stay pure TypeScript with no Node imports, so the browser can run the same function the
   server does.
4. **Honest fallbacks.** A source that cannot be reached returns a sealed dated sample with
   `sourceStatus: "fallback"`. Never relabel it as live.
5. **Append-only audit.** Nothing rewrites or hard-deletes an audit event. Deletes leave
   tombstones so replay keeps working.
6. **Citations, not vibes.** Every standard date and resource estimate traces to a URL in
   `CITATIONS`.

## Reporting bugs

Open an issue with what you did, what you expected, what happened, and the output of
`/api/health`. A reproduction beats a description.

## Hacktoberfest

This project participates in Hacktoberfest through
[DEV](https://dev.to) and [MLH](https://mlh.io). If you are contributing, mention the
challenge in your pull request so it can be attributed.