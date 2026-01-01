# Quick Reload Guide: Update Cline-Extended Without Reinstalling

## Method 1: Hot Reload (Fastest - 10 seconds)

If you've made code changes and want to test them immediately:

### Step 1: Compile
```bash
cd c:\Users\win\code\cline-ext
npm run compile
```

### Step 2: Reload VS Code Window
- Press `Ctrl+Shift+P`
- Type: `Developer: Reload Window`
- Hit Enter

**That's it!** Your changes are now live.

---

## Method 2: Rebuild and Reload (30 seconds)

If you want to ensure everything is clean:

### Step 1: Clean Build
```bash
cd c:\Users\win\code\cline-ext
npm run compile
```

### Step 2: Reload VS Code Window
- Press `Ctrl+Shift+P`
- Type: `Developer: Reload Window`
- Hit Enter

---

## Method 3: Full Development Install (5 minutes)

Only needed if you're changing package.json or adding new dependencies:

```bash
cd c:\Users\win\code\cline-ext
npm install
npm run compile
```

Then reload VS Code window.

---

## Verification Steps

After reloading, verify the changes loaded:

1. Open Cline sidebar
2. Check version in settings (should show your local version)
3. Test your changes

---

## Troubleshooting

### Changes Not Showing Up?

**Problem:** Code changes don't appear after reload

**Solutions:**
1. Make sure compilation succeeded (check for errors)
2. Try closing and reopening VS Code completely
3. Check if you're editing the right files (not node_modules)

### Compilation Errors?

**Problem:** `npm run compile` shows errors

**Solutions:**
1. Check TypeScript errors: `npm run check-types`
2. Fix any type errors in your code
3. Re-run `npm run compile`

### Extension Not Loading?

**Problem:** Extension doesn't load at all after changes

**Solutions:**
1. Check VS Code's Output panel → "Extension Host"
2. Look for error messages
3. If broken, restore from git: `git checkout .`
4. Rebuild: `npm run compile`

---

## Development Workflow

Here's the recommended workflow for iterative development:

```bash
# Terminal 1: Watch mode (auto-compiles on save)
cd c:\Users\win\code\cline-ext
npm run watch

# Make your code changes in editor...
# Save file
# Wait for "Compilation complete" message
# Reload VS Code window (Ctrl+Shift+P → Reload Window)
# Test changes
# Repeat!
```

---

## Quick Reference Commands

| Task | Command |
|------|---------|
| Compile once | `npm run compile` |
| Watch mode (auto-compile) | `npm run watch` |
| Type checking | `npm run check-types` |
| Linting | `npm run lint` |
| Clean build | `npm run clean && npm run compile` |
| Reload VS Code | `Ctrl+Shift+P` → "Developer: Reload Window" |

---

## Your Current Setup

You're running from: `c:\Users\win\code\cline-ext`

Since you already have the extension loaded, you just need:
```bash
# Compile your changes
npm run compile

# Reload VS Code
Ctrl+Shift+P → "Developer: Reload Window"
```

Done! No reinstall needed. 🚀

---

## What Gets Reloaded?

✅ **Auto-reloaded:**
- TypeScript code changes
- Configuration changes
- All backend logic
- Message types
- API handlers

❌ **Requires full reload:**
- package.json changes (dependencies)
- Extension manifest (package.json "contributes" section)
- Proto definitions (rare)

For most development, hot reload is all you need!
