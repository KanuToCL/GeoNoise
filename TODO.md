# TODO

## Phase 1 Remaining
- [x] Wire UI compute to `engineCompute` with `requestId` cancellation, warnings, and timings.
- [ ] Route UI compute preference into backend router + surface GPU capability reason from `@geonoise/engine-webgpu`.
- [ ] Save/load scene JSON with migrate/validate/normalize + tests `T6.1.1` and `T6.1.2`.
- [ ] Incremental recompute on drag (source-only delta + resummation) + test `T7.1.1`.
- [ ] DoD verification + integration tests.
- [ ] SPEC docs (`SPEC.*.md`) for Phase 1 behavior.

## Follow-Ups
- [ ] Align UI compute with engine propagation config (mode/output metric).
- [ ] Add canonical scenes and golden snapshots through router for receivers + panels.
