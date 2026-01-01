# Cline Extended Repository

This repository contains **Cline Extended**, a fork of Cline with advanced autonomous coding features.

## Contents

### `/cline-extended`
VS Code extension fork with:
- **Architect Mode**: Two-model adversarial loop (Opus plans, Sonnet implements)
- **ApprovalOracle**: Intelligent action approval with pattern matching
- **Persona Injection**: Custom model behavior via `.cline/persona.md`
- **Architecture Awareness**: Analyze changes against your codebase architecture
- **LLM Context Persistence**: Maintain context across sessions

**Installation:**
```bash
cd cline-extended
npm run install:all
npm run compile
npx vsce package --allow-package-secrets sendgrid
# Install cline-extended-1.0.0.vsix in VS Code
```

### `/mcp-approval-oracle`
Standalone MCP server that provides ApprovalOracle functionality to any Cline installation. Ships independently - no fork required.

**Installation:**
```bash
cd mcp-approval-oracle
npm install
npm run build
# Configure in Cline MCP settings
```

## Specification Documents

- `CLINE_EXTENDED_COMPLETE_SPEC.md` - Full implementation specification
- `MCP_APPROVAL_ORACLE_STANDALONE.md` - Standalone MCP server spec
- `LLM_CONTEXT_CHECKPOINT_SPEC.md` - Context persistence spec

## Quick Start

1. **Use ApprovalOracle now** (no extension changes needed):
   - Build and configure `mcp-approval-oracle`
   - Add custom instructions to Cline
   - Enjoy intelligent auto-approvals

2. **Use full Cline Extended**:
   - Build and install `cline-extended-1.0.0.vsix`
   - Configure Architect Mode in settings
   - Enable ApprovalOracle, persona, architecture features

## License

Apache-2.0
