## Purpose

Describe the change and why it is needed. Link the issue it closes.

## Checklist

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes with zero warnings
- [ ] `npm run test` passes, and includes a test that would have failed before this change
- [ ] `npm run build` passes
- [ ] The browser journey passes if you touched a page: `npm run test:browser`
- [ ] Any new date, factor weight or resource figure has a URL in `CITATIONS`
- [ ] No new required environment variable, service or API key
- [ ] No secrets, tokens or internal URLs in the diff
- [ ] `README.md` still matches the routes, scripts and variables that exist

## Domain changes

- [ ] The engine, registry, resource model or classifier stayed pure, with no Node imports
- [ ] All state changes go through `src/lib/service.ts`
- [ ] Audit events are appended, never rewritten; deletes leave tombstones
- [ ] New fallbacks are labelled `fallback` with their own date

## Notes for the reviewer

<!-- Anything non-obvious, a tradeoff you took, or a place you would like a second opinion. -->