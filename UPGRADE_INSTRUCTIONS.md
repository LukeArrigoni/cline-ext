# Upgrade Instructions for Cline Extended with Architect Mode Config

## Overview
The changes add Architect Mode configuration support without breaking existing installations. Since the feature defaults to `enabled: false`, existing tasks will continue to work exactly as before.

## Changes Made

### 1. Configuration Infrastructure (Non-Breaking)
- Added `architectConfig` to Settings interface (`src/shared/storage/state-keys.ts`)
- Added default config loading (`src/core/storage/utils/state-helpers.ts`)
- **Default**: `enabled: false` (backwards compatible)

### 2. What Still Needs Implementation
- Task execution integration (wiring ArchitectOrchestrator into main flow)
- UI components for Architect Mode
- Settings panel for configuration

## Upgrade Options

### Option A: In-Place Upgrade (Recommended for Development)

This preserves your existing tasks and settings.

```bash
cd c:\Users\win\code\cline-ext

# 1. Ensure dependencies are installed
npm install

# 2. Rebuild the extension
npm run compile

# 3. Package as VSIX (optional, for testing)
npx vsce package --allow-package-secrets sendgrid

# 4. Reload VS Code window
# Press Ctrl+Shift+P -> "Developer: Reload Window"
```

**Benefits:**
- Keeps all existing tasks and settings
- Fast iteration during development
- No data loss

**When to use:**
- During development
- Testing config changes
- Debugging

### Option B: Clean Re-Install (For Major Changes)

Only needed when making breaking changes to storage schema.

```bash
cd c:\Users\win\code\cline-ext

# 1. Uninstall current version
code --uninstall-extension local.cline-extended

# 2. Clean build
npm run clean:all
npm install

# 3. Rebuild everything
npm run compile

# 4. Package and install
npx vsce package --allow-package-secrets sendgrid
code --install-extension cline-extended-1.0.0.vsix
```

**When to use:**
- Breaking schema changes
- Corrupted state
- Major version upgrades

### Option C: Development Mode (Fastest for Active Development)

Run directly from source without packaging.

```bash
# 1. Compile with watch mode
npm run dev

# 2. Press F5 in VS Code to launch Extension Development Host
# The extension runs from source with hot reload
```

**Benefits:**
- Instant changes without rebuild
- Debug with breakpoints
- Best for development

## What Happens After Upgrade?

### For Existing Users
1. Extension loads normally
2. `architectConfig` defaults to `{ enabled: false }`
3. All existing tasks work unchanged
4. No UI changes (Architect Mode not yet wired up)

### State Migration
The changes are additive - no migration needed:

```typescript
// Old state (before upgrade)
{
  mode: "act",
  // ... other settings
}

// New state (after upgrade)
{
  mode: "act",
  architectConfig: {  // <- Automatically added with defaults
    enabled: false,
    architectModel: "claude-opus-4-5-20251101",
    editorModel: "claude-sonnet-4-5-20250929",
    // ... other defaults
  },
  // ... other settings
}
```

## Testing Your Upgrade

```bash
# 1. Check TypeScript compilation
npm run check-types

# 2. Run linter
npm run lint

# 3. Run tests (if implemented)
npm run test:unit

# 4. Build and verify
npm run compile
```

## Rollback (If Needed)

```bash
# Checkout previous commit
git log --oneline  # Find commit before changes
git checkout <commit-hash>

# Rebuild
npm run compile

# Reload VS Code window
```

## Next Steps After Upgrade

Once you've upgraded with the config infrastructure:

1. **Enable Architect Mode** (when implemented):
   - Settings → Cline Extended → Architect
   - Toggle "Enable Architect Mode"
   - Configure models and settings

2. **Start Using Two-Context Workflow**:
   - Create a new task
   - If enabled, Opus creates dev plan
   - Sonnet implements the plan
   - Opus evaluates and iterates

## Troubleshooting

### "Cannot find module @shared/architect-types"
```bash
# Missing types - recompile
npm run compile
```

### "Extension Host Did Not Start"
```bash
# Clean rebuild
npm run clean:build
npm run compile
```

### State/Settings Not Loading
```bash
# Check for corrupted state
# Delete: ~/.config/Code/User/globalStorage/local.cline-extended/
# Then reload VS Code
```

### Changes Not Appearing
```bash
# 1. Full rebuild
npm run compile

# 2. Reload window
# Ctrl+Shift+P -> "Developer: Reload Window"

# 3. If still not working, restart VS Code entirely
```

## Development Workflow Recommendation

For ongoing Architect Mode development:

```bash
# Terminal 1: Watch mode
npm run dev

# Terminal 2: Run extension
# Press F5 in VS Code

# Make changes → Save → Extension auto-reloads
```

This setup provides the fastest feedback loop for completing the Architect Mode integration.

## Deployment to Production

When ready to release with Architect Mode:

```bash
# 1. Update version in package.json
npm version patch  # or minor/major

# 2. Generate changeset
npm run changeset

# 3. Build production package
npm run package

# 4. Test the VSIX thoroughly
code --install-extension cline-extended-X.X.X.vsix

# 5. Publish (when ready)
npm run publish:marketplace
```

## Summary

**For immediate use**: Choose Option A (In-Place Upgrade)
- Fast, safe, preserves data
- Good for continuing development

**Current Status**: Configuration infrastructure is ready
**Next**: Wire ArchitectOrchestrator into Task execution
**Impact**: Zero breaking changes, fully backwards compatible
