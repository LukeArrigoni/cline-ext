# Architect Mode Integration Plan

## Problem
The Architect Mode system (two-context workflow with Architect + Editor) is fully built but **never used**. The code exists but isn't wired into the main task execution flow.

## What Exists (Dead Code)
- ✅ `ArchitectOrchestrator` - Main orchestrator with Architect/Editor loop
- ✅ `ApprovalOracle` - Intelligent action approval
- ✅ `ArchitectureAnalyzer` - Codebase architecture analysis
- ✅ `LLMContextManager` - Session context persistence
- ✅ `PersonaLoader` - Custom persona injection
- ✅ Config types in `architect-types.ts`

## What's Missing (Integration Points)

### 1. Configuration Storage
**File**: `src/shared/storage/state-keys.ts` or storage config
- [ ] Add `architectConfig` to settings
- [ ] Add UI settings for Architect Mode toggle
- [ ] Add model selection for Architect vs Editor
- [ ] Add thinking budget, max iterations, etc.

### 2. Task Execution Integration
**File**: `src/core/task/index.ts`
- [ ] Import ArchitectOrchestrator
- [ ] Check if Architect Mode is enabled in `initiateTaskLoop`
- [ ] If enabled, delegate to `orchestrator.run()` instead of `recursivelyMakeClineRequests`
- [ ] Stream ArchitectUpdate events to UI

### 3. UI Feedback Loop
**Files**: 
- `webview-ui/src/components/chat/*`
- Message types for architect updates
- [ ] Add chat components for:
  - Planning phase display
  - Implementation phase display  
  - Evaluation phase display
  - Thinking content rendering
  - Architecture review prompts

### 4. Settings UI
**File**: `webview-ui/src/components/settings/*`
- [ ] Add "Architect" tab in settings
- [ ] Model dropdowns for Architect/Editor
- [ ] Thinking budget slider
- [ ] Max iterations input
- [ ] ApprovalOracle toggles
- [ ] Architecture awareness settings
- [ ] Persona configuration

## Implementation Strategy

### Phase 1: Minimal Viable Integration
```typescript
// In Task.initiateTaskLoop():
const architectConfig = this.stateManager.getGlobalSettingsKey("architectConfig")

if (architectConfig?.enabled) {
  await this.runArchitectMode(userContent)
} else {
  await this.recursivelyMakeClineRequests(userContent, includeFileDetails)
}
```

### Phase 2: Add Config & UI
1. Add architect config to state manager
2. Create settings UI tab
3. Wire up config changes

### Phase 3: Full Feature Set
1. Stream all architect updates to UI
2. Add approval oracle integration
3. Add architecture analyzer
4. Add LLM context persistence
5. Add persona injection

## Key Design Decisions

### When to Use Architect Mode?
**Option A**: Always on when enabled (replace normal mode)
**Option B**: Separate mode like Plan/Act toggle
**Option C**: Per-task toggle in task creation

**Recommendation**: Option A - Always on when enabled, but with easy global toggle

### How to Stream Updates?
Use existing `say()` mechanism with new message types:
- `architect_phase` - Phase transitions
- `architect_thinking` - Extended thinking content
- `architect_plan` - Generated plan
- `architect_implementation` - Editor's work
- `architect_evaluation` - Review feedback

### Backwards Compatibility
- Default `enabled: false` in config
- Graceful fallback to normal mode if config invalid
- Existing tasks continue to work unchanged

## Testing Plan
1. Enable Architect Mode in settings
2. Start a new task
3. Verify:
   - Opus is used for planning
   - Sonnet is used for implementation
   - Iterations work correctly
   - UI displays all phases
   - Cost tracking works

## Risks & Mitigation
- **Risk**: Breaking existing tasks
  - **Mitigation**: Feature flag, default disabled
- **Risk**: Config UI complexity
  - **Mitigation**: Start with minimal config, iterate
- **Risk**: Performance (two models = 2x cost)
  - **Mitigation**: Clear cost warnings in UI, make it opt-in

## Next Steps
1. Add config keys to storage
2. Wire up basic integration in Task
3. Test with simple task
4. Add UI feedback
5. Expand features incrementally
