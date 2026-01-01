# LLM Context Checkpoint Specification

**File:** `.cline/llm-context.md` (or `llm-context.yaml` for structured parsing)

**Purpose:** Machine-readable project state for LLM cold boots. Not for humans. Optimized for token efficiency and fast context reconstruction.

---

## Design Principles

1. **Density over readability** - LLMs don't need whitespace or prose
2. **Recency-weighted** - Recent decisions at top, history compressed
3. **Actionable state** - What's in progress, what's blocked, what's next
4. **Self-updating** - LLM writes this at end of sessions

---

## Format Option A: Compressed Markdown

```markdown
# llm-context

## state
active: clearance-api-latency-optimization
blocked: platform-suno-integration (waiting: api-key)
next: [enforcement-batch-processing, detection-gpu-scaling]
stage: growth
branch: feat/clearance-cache

## recent-decisions
- 2024-01-15: switched from redis to dragonfly for sub-ms latency
- 2024-01-14: rejected celery, using dramatiq for task queue
- 2024-01-12: types.yaml canonical, all services must reference

## active-context
files-hot: [src/clearance/cache.ts, src/clearance/handlers.ts, contracts/clearance.yaml]
files-cold: [src/enforcement/*, src/detection/*]
tests-failing: [clearance.cache.invalidation, clearance.handlers.timeout]
debt: [TODO:src/clearance/cache.ts:47, HACK:src/clearance/handlers.ts:123]

## architecture
style: modular_monolith
domains: [clearance, enforcement, detection, registry, platform, billing]
boundaries-violated: [clearance imports from detection directly]
extraction-candidates: [detection:gpu-bound, platform:independent-deploy]

## momentum
velocity: high
blockers: 1
last-session: 2024-01-15T18:30:00Z
last-action: implemented dragonfly cache layer, tests pending

## session-notes
- cache invalidation logic incomplete, need to handle rights_holder update events
- handlers.ts:89 has race condition on concurrent clearance checks
- suno integration blocked on their api key rotation, follow up fri

## contracts-drift
clearance.yaml: current
enforcement.yaml: stale (missing batch endpoints)
detection.yaml: current

## human-context
luke: wants <200ms p99 on clearance, non-negotiable
brandon: owns platform integrations, async on suno
```

---

## Format Option B: Structured YAML (better for parsing)

```yaml
llm_context_version: 1

state:
  active_task: clearance-api-latency-optimization
  blocked:
    - task: platform-suno-integration
      reason: waiting on api key
  next_tasks:
    - enforcement-batch-processing
    - detection-gpu-scaling
  git_branch: feat/clearance-cache
  last_session: 2024-01-15T18:30:00Z
  last_action: "implemented dragonfly cache layer, tests pending"

decisions:
  - date: 2024-01-15
    decision: "redis -> dragonfly for sub-ms latency"
    rationale: "redis p99 was 3ms, dragonfly hits 0.5ms"
  - date: 2024-01-14
    decision: "rejected celery, using dramatiq"
    rationale: "celery overhead too high for our queue sizes"
  - date: 2024-01-12
    decision: "types.yaml is canonical"
    rationale: "naming drift was causing integration bugs"

files:
  hot:
    - src/clearance/cache.ts
    - src/clearance/handlers.ts
    - contracts/clearance.yaml
  modified_this_session:
    - src/clearance/cache.ts
  do_not_modify:
    - contracts/types.yaml  # requires team review

tests:
  failing:
    - clearance.cache.invalidation
    - clearance.handlers.timeout
  skipped:
    - platform.suno.*  # blocked

debt:
  - file: src/clearance/cache.ts
    line: 47
    type: TODO
    note: "handle bulk invalidation"
  - file: src/clearance/handlers.ts
    line: 123
    type: HACK
    note: "retry logic is naive"

architecture:
  style: modular_monolith
  stage: growth
  domains: [clearance, enforcement, detection, registry, platform, billing]
  violations:
    - type: cross_domain_import
      from: clearance
      to: detection
      file: src/clearance/handlers.ts:15
  extraction_candidates:
    - domain: detection
      reason: gpu_bound
    - domain: platform
      reason: independent_deploy

contracts:
  clearance.yaml: current
  enforcement.yaml:
    status: stale
    missing: [batch_endpoints]
  detection.yaml: current

momentum:
  velocity: high  # low | medium | high
  blockers_count: 1
  risk: "cache invalidation race condition"

session_notes: |
  - cache invalidation logic incomplete
  - need to handle rights_holder update events
  - handlers.ts:89 has race condition on concurrent checks
  - suno blocked on api key, follow up friday

human_context:
  luke:
    priority: "<200ms p99 on clearance"
    constraint: "non-negotiable"
  brandon:
    owns: platform integrations
    status: "async on suno issue"
```

---

## Auto-Update Protocol

At end of each session, LLM should:

```
1. Read current llm-context.yaml
2. Update:
   - state.last_session = now
   - state.last_action = summary of what was done
   - state.active_task = current focus
   - files.hot = files touched this session
   - files.modified_this_session = files changed
   - tests.failing = current test state
   - decisions = append any new decisions
   - session_notes = key context for next boot
   - debt = any new TODOs/HACKs added
3. Write updated llm-context.yaml
```

---

## Cold Boot Protocol

When LLM starts fresh session:

```
1. Read llm-context.yaml
2. Read files in files.hot (primary context)
3. Read contracts/*.yaml for current service (if identifiable)
4. Read types.yaml (always)
5. Resume from state.active_task
6. Check state.blocked for anything unblocked
7. Review session_notes for continuity
```

---

## Cline Extended Integration

### Auto-load on startup

In `src/core/Cline.ts`:

```typescript
private async loadLLMContext(): Promise<string> {
  const locations = [
    path.join(this.workspaceRoot, ".cline", "llm-context.yaml"),
    path.join(this.workspaceRoot, ".cline", "llm-context.md"),
    path.join(this.workspaceRoot, "llm-context.yaml"),
    path.join(this.workspaceRoot, "llm-context.md"),
  ];

  for (const loc of locations) {
    if (fs.existsSync(loc)) {
      const content = fs.readFileSync(loc, "utf-8");
      return `<llm_context>\n${content}\n</llm_context>`;
    }
  }

  return "";
}
```

### Auto-save on session end

```typescript
private async saveLLMContext(updates: Partial<LLMContext>): Promise<void> {
  const contextPath = path.join(this.workspaceRoot, ".cline", "llm-context.yaml");
  
  let existing: LLMContext = {};
  if (fs.existsSync(contextPath)) {
    existing = yaml.load(fs.readFileSync(contextPath, "utf-8")) as LLMContext;
  }

  const updated: LLMContext = {
    ...existing,
    ...updates,
    state: {
      ...existing.state,
      ...updates.state,
      last_session: new Date().toISOString(),
    },
  };

  fs.writeFileSync(contextPath, yaml.dump(updated));
}
```

### Inject into architect context

In `ArchitectOrchestrator.run()`:

```typescript
// At start of run()
const llmContext = await this.loadLLMContext();
if (llmContext) {
  codebaseContext = `${llmContext}\n\n${codebaseContext}`;
}
```

---

## Token Efficiency

The YAML format at typical project state: ~400-600 tokens.
Buys significant context reconstruction for minimal cost.

Compare to re-reading 10 source files: 5000-15000 tokens.

---

## Versioning

The `llm_context_version: 1` field allows future format changes without breaking existing projects.

---

## .gitignore Recommendation

```gitignore
# LLM context is local/ephemeral
.cline/llm-context.yaml
.cline/llm-context.md

# But keep the schema
!.cline/llm-context.schema.yaml
```

Or commit it if you want context continuity across machines/developers.
