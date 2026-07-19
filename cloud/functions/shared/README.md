# Shared frontend and Functions rules

`@mons/shared` is the canonical home for deterministic, side-effect-free rules
used by both the React app and Firebase Functions.

The package lives inside `cloud/functions` so Firebase's existing source
boundary includes it automatically. The root app and the Functions package
both consume it through local `file:` dependencies; no generated copy or
publish step is required.

Keep shared modules:

- browser-safe CommonJS JavaScript with a matching `.d.ts` file;
- free of Firebase, DOM, storage, network, and process-specific behavior;
- split into direct subpath imports such as `@mons/shared/mining`;
- explicit about policy differences, such as local versus UTC mining dates or
  strict client versus tolerant server normalization.

Firebase transactions, React state, persistence, logging, and other I/O stay in
their existing adapters. When a rule is needed by both runtimes, add it here
first and make each runtime delegate to it.
