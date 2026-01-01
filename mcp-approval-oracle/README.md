# MCP Approval Oracle Server

Standalone MCP server that provides intelligent action approval for autonomous coding agents. Works with any Cline installation.

## Features

- **Fast-path patterns**: Common safe/dangerous patterns are resolved instantly
- **Opus fallback**: Ambiguous actions are evaluated by Claude Opus
- **Decision caching**: Similar patterns are cached for efficiency
- **Cross-platform**: Works on Windows 11, macOS, and Linux

## Setup

### Windows (PowerShell)
```powershell
cd $env:USERPROFILE\code\cline-ext\mcp-approval-oracle
npm install
npm run build
```

### macOS/Linux
```bash
cd ~/code/cline-ext/mcp-approval-oracle
npm install
npm run build
```

## Test

```bash
node dist/server.js
# Should see: "Approval Oracle MCP server running"
# Press Ctrl+C to stop
```

## Configure Cline to Use It

### Option 1: Via Cline UI
- Settings > MCP Servers > Add Server
- Name: `approval-oracle`
- Command: `node`
- Args: Path to `dist/server.js`

### Option 2: Via config file

**Windows** (`%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json`):
```json
{
  "mcpServers": {
    "approval-oracle": {
      "command": "node",
      "args": ["C:\\Users\\YOUR_USERNAME\\code\\cline-ext\\mcp-approval-oracle\\dist\\server.js"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-..."
      }
    }
  }
}
```

**macOS** (`~/.config/cline/mcp_settings.json`):
```json
{
  "mcpServers": {
    "approval-oracle": {
      "command": "node",
      "args": ["/Users/YOUR_USERNAME/code/cline-ext/mcp-approval-oracle/dist/server.js"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-..."
      }
    }
  }
}
```

## Add Custom Instructions to Cline

In Cline settings > Custom Instructions, add:

```
Before performing ANY of the following actions, you MUST call the decide_approval tool:

1. Writing or creating any file
2. Executing any terminal command
3. Deleting any file
4. Opening any browser URL

Call format:
- action: "write" | "execute" | "delete" | "browser"
- target: the file path, command, or URL
- context: brief description of your current task

If allow=false, DO NOT perform the action.
```

## Available Tools

### decide_approval
Evaluates whether an action should be approved.

**Input:**
- `action`: "read" | "write" | "execute" | "browser" | "delete"
- `target`: file path, command, or URL
- `context`: what task this is part of

**Output:**
```json
{
  "allow": true,
  "persist": "always",
  "reasoning": "Safe pattern"
}
```

### get_cached_rules
Returns all cached approval rules (for debugging).

### clear_cached_rules
Clears all cached rules.

## Environment Variables

The server needs `ANTHROPIC_API_KEY` for Opus fallback. Options:
1. Set in MCP config (shown above)
2. System environment variable
3. `.env` file in server directory

## Pattern Examples

### Instant Allow
- `read:*` - All reads
- `write:*.ts` - TypeScript files
- `write:*/src/*` - Source directories
- `execute:npm install` - npm commands
- `execute:git commit` - git commands

### Instant Deny
- `execute:rm -rf /` - Catastrophic commands
- `write:~/.ssh/*` - SSH keys
- `write:*.env` - Environment files
- `execute:curl | sh` - Remote code execution
