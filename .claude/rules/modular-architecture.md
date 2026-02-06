# Modular Architecture Rules

> **Core Principle:** A file should have one reason to change. Code belongs where it coheres with its neighbors.

---

## The Golden Rule

**"Make the right thing easy and the wrong thing hard."**

Structure code so that:
- Adding code to the right place is obvious
- Adding code to the wrong place feels awkward
- The pattern for new code is visible from existing code

---

## Why Modularize?

### For Humans
- Easier to understand (one concept per file)
- Easier to test (isolated units)
- Easier to modify (changes are localized)

### For AI Agents (Token Efficiency)

Modular code is **cheaper to work with** for AI agents:

| Scenario | Lines Read | ~Tokens | Context Used |
|----------|------------|---------|--------------|
| Read monolith (9000 lines) | 9000 | ~36,000 | 36% of 100k |
| Read focused module (130 lines) | 130 | ~520 | 0.5% of 100k |

Benefits:
- Agents only need to read relevant modules, not entire monoliths
- Smaller files = more conversation context preserved
- Targeted changes = smaller diffs to review
- Clear module boundaries = agent can work on one piece without loading everything

**Rule of thumb:** If an agent needs to read >500 lines to make a 10-line change, the code is too coupled.

---

## File Health (Heuristics, Not Laws)

Line counts are guidelines. The real test is:

> **"Can someone new understand this file in one sitting?"**

### The Four Questions Test

Before adding code to an existing file, ask:

| Question | What It Tests |
|----------|---------------|
| **Cohesion:** Do I need the word "and" to describe this file? | Single responsibility |
| **Navigability:** Can someone find what they need quickly? | Organization |
| **Testability:** Can I test this in isolation? | Coupling |
| **Explainability:** Can a newcomer understand this in one read? | Complexity |

If a 1000-line file passes all four → it's fine.
If a 150-line file fails any → consider restructuring.

### Soft Guidelines

| Threshold | Action |
|-----------|--------|
| > 300 lines | Pause and ask the four questions |
| > 500 lines | Strongly consider extraction |
| Function > 50 lines | Look for helper extraction |
| > 10 imports | Consider intermediate module |

### When Large Files Are Justified

- **High cohesion** - Everything truly belongs together (physics engine, parser)
- **Performance** - Splitting would add overhead (hot paths, WebWorkers)
- **Readability** - Splitting would hurt understanding (state machines)
- **Generated code** - Not meant for human editing

---

## Code Routing Decision Tree

When adding new code, follow this hierarchy:

```
1. WHAT is it?
   ├── Type/Interface       → types/ or <domain>/types.ts
   ├── Pure function        → utils/ or lib/
   ├── Entity + operations  → entities/ or models/
   ├── UI component         → components/ or ui/
   ├── Side effect          → services/ or api/
   └── Orchestration        → entry point only

2. WHO uses it?
   ├── One file only        → keep inline (for now)
   ├── Same domain          → domain module
   └── Multiple domains     → shared/ or utils/

3. HOW often does it change?
   ├── Stable               → core/ or lib/
   ├── Business logic       → domain modules
   └── Frequently changing  → feature modules
```

---

## Entry Point Rules

The main entry point (main.ts, index.ts, App.tsx) is for **orchestration only**.

### Entry Point SHOULD:
- Initialize modules
- Wire up event handlers by calling module functions
- Coordinate between modules

### Entry Point SHOULD NOT contain:
- Type definitions → `types/`
- Utility functions → `utils/`
- Rendering logic → `rendering/`
- Complex handlers → `interactions/`
- UI component logic → `ui/`
- Entity definitions → `entities/`

### Before Adding Code to Entry Point, Ask:
1. Is this orchestration/wiring? → OK
2. Is this reusable logic? → Extract to module
3. Could another file use this? → Extract to module

---

## Module Extraction Pattern

When extracting from a monolith:

```
Before:
  bigfile.ts (800 lines)
    - TypeA, TypeB
    - utilA(), utilB(), utilC()
    - featureX logic
    - featureY logic

After:
  <domain>/
  ├── types.ts      (TypeA, TypeB)
  ├── utils.ts      (utilA, utilB, utilC)
  ├── featureX.ts   (featureX logic)
  ├── featureY.ts   (featureY logic)
  └── index.ts      (barrel exports)
```

---

## Entity Module Pattern

For domain entities, use this structure:

```typescript
// entities/<entity>.ts

// === Constants ===
export const ENTITY_DEFAULT_VALUE = 10;

// === Types ===
export interface CreateEntityOptions {
  id?: string;              // Auto-generated if not provided
  requiredProp: Type;       // Required properties
  optionalProp?: Type;      // Optional with defaults
}

// === Factory Function ===
export function createEntity(seq: number, options: CreateEntityOptions): Entity {
  const id = options.id ?? createId(ENTITY_PREFIX, seq);
  return {
    id,
    requiredProp: options.requiredProp,
    optionalProp: options.optionalProp ?? DEFAULT_VALUE,
  };
}

// === Operations ===
export function duplicateEntity(entity: Entity, seq: number): Entity {
  return { ...entity, id: createId(ENTITY_PREFIX, seq) };
}
```

### Key Design Decisions:
- `seq` parameter instead of internal counter → keeps state in caller
- Options interface with optional fields → flexible with sensible defaults
- Thin wrapper pattern in entry point → minimizes call site changes

---

## Barrel Export Pattern

Each module directory should have an `index.ts`:

```typescript
// <domain>/index.ts
export { TypeA, TypeB } from './types.js';
export { createEntity, duplicateEntity, ENTITY_DEFAULT } from './entity.js';
export { utilA, utilB } from './utils.js';
```

Benefits:
- Single import point for consumers
- Internal structure can change without affecting imports
- Clear public API

---

## Diagnostic Symptoms

| Symptom | Diagnosis | Treatment |
|---------|-----------|-----------|
| File > 500 lines | Growing monolith | Extract by responsibility |
| Function > 50 lines | Doing too much | Extract helpers |
| > 10 imports | High coupling | Create intermediate module |
| Circular imports | Tangled dependencies | Extract shared types/utils |
| "Utils" file > 200 lines | Junk drawer | Split by domain |
| Need word "and" to describe file | Multiple responsibilities | Split into focused modules |
| Agent reads 500+ lines for small change | Poor modularity | Extract to focused module |

---

## Prevention Checklist

Before committing new code:

- [ ] New code is in appropriate module, not entry point
- [ ] If adding to existing file, it coheres with existing code
- [ ] File still passes the four questions test
- [ ] Barrel exports updated if new public API
- [ ] No new circular dependencies

---

## References

- **Single Responsibility Principle** - SOLID principles applied to files
- **Screaming Architecture** - Folder structure reveals domain, not framework
- **Module Extraction Refactoring** - Inverse of "inline module"
- **Strangler Fig Pattern** - Gradual monolith decomposition

---

*Last updated: 2026-02-06*
