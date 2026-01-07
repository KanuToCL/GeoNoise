# TODO

## Phase 1 Remaining
- [x] Wire UI compute to `engineCompute` with `requestId` cancellation, warnings, and timings.
- [x] Route UI compute preference into backend router + surface GPU capability reason from `@geonoise/engine-webgpu`.
- [ ] Save/load scene JSON with migrate/validate/normalize + tests `T6.1.1` and `T6.1.2`.
- [x] Incremental recompute on drag (source-only delta + resummation).
- [ ] Test `T7.1.1`: incremental equals full recompute within tolerance.
- [ ] DoD verification + integration tests.
- [ ] SPEC docs (`SPEC.*.md`) for Phase 1 behavior.

## Recently Completed (v0.4.0)
- [x] Barrier rotation and resize functionality (endpoint handles + rotation lollipop).
- [x] Auto-regenerate noise map after geometry modifications (barriers, buildings).
- [x] Properties panel with Length/Rotation controls for barriers.
- [x] Inline name editing for elements (double-click to rename).
- [x] Custom display names on map tooltips.

## Follow-Ups
- [ ] Align UI compute with engine propagation config (mode/output metric).
- [ ] Add canonical scenes and golden snapshots through router for receivers + panels.
