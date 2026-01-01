import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import Anthropic from "@anthropic-ai/sdk";

// ============================================
// CROSS-PLATFORM PATH HANDLING
// ============================================

// Normalize paths for consistent matching (convert Windows \ to /)
function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

// ============================================
// APPROVAL ORACLE LOGIC
// ============================================

// All patterns use forward slashes - we normalize input before matching
const INSTANT_ALLOW: RegExp[] = [
  /^read:/,
  /^write:.*\.(ts|js|tsx|jsx|py|rb|go|rs|java|kt|swift|md|json|yaml|yml|css|scss|html|sql)$/i,
  /^write:.*\/src\//,
  /^write:.*\/lib\//,
  /^write:.*\/test\//,
  /^write:.*\/tests\//,
  /^write:.*\/spec\//,
  /^write:.*\/components\//,
  /^write:.*\/pages\//,
  /^write:.*\/app\//,
  /^write:.*\/public\//,
  /^write:.*\/assets\//,
  /^write:.*\/styles\//,
  /^write:.*\/utils\//,
  /^write:.*\/hooks\//,
  /^write:.*\/services\//,
  /^write:.*\/api\//,
  /^write:.*\/models\//,
  /^write:.*\/types\//,
  /^write:.*\/interfaces\//,
  /^write:.*\/contracts\//,
  /^write:.*\/\.cline\//,
  // npm/node
  /^execute:npm (install|ci|run|test|build|start|lint|format|typecheck|dev|preview)/,
  /^execute:npx /,
  /^execute:yarn /,
  /^execute:pnpm /,
  /^execute:bun /,
  /^execute:deno /,
  // Other package managers / build tools
  /^execute:cargo (build|run|test|check|clippy|fmt|add|remove)/,
  /^execute:go (build|run|test|mod|get|fmt|vet)/,
  /^execute:pip3? install/,
  /^execute:python3? /,
  /^execute:ruby /,
  /^execute:bundle /,
  /^execute:gem install/,
  /^execute:mix /,
  /^execute:elixir /,
  /^execute:dotnet /,
  /^execute:mvn /,
  /^execute:gradle /,
  /^execute:make($| )/,
  /^execute:cmake /,
  // Git (works same on both platforms)
  /^execute:git (status|diff|log|branch|checkout|add|commit|push|pull|fetch|stash|rebase|merge|clone|init|remote|tag|show|blame|reflog)/,
  // Unix commands (also available on Windows via Git Bash, WSL, or equivalents)
  /^execute:ls/,
  /^execute:ll/,
  /^execute:la/,
  /^execute:cat /,
  /^execute:head /,
  /^execute:tail /,
  /^execute:less /,
  /^execute:more /,
  /^execute:grep /,
  /^execute:find /,
  /^execute:echo /,
  /^execute:printf /,
  /^execute:mkdir /,
  /^execute:touch /,
  /^execute:cp /,
  /^execute:mv /,
  /^execute:cd /,
  /^execute:pwd/,
  /^execute:which /,
  /^execute:wc /,
  /^execute:sort /,
  /^execute:uniq /,
  // Windows-specific safe commands
  /^execute:dir($| )/,
  /^execute:type /,
  /^execute:copy /,
  /^execute:move /,
  /^execute:del (?!\/[fqsap])/,  // del without dangerous flags
  /^execute:md /,
  /^execute:rd /,
  /^execute:where /,
  /^execute:set($| )/,
  /^execute:echo\./,
  // Node/JS runtime
  /^execute:node /,
  /^execute:ts-node /,
  /^execute:tsx /,
  /^execute:esbuild /,
  /^execute:tsc($| )/,
  /^execute:eslint /,
  /^execute:prettier /,
  /^execute:jest /,
  /^execute:vitest /,
  /^execute:mocha /,
  /^execute:pytest /,
  /^execute:rspec /,
  /^execute:phpunit /,
  // Docker
  /^execute:docker (build|run|ps|images|logs|exec|stop|start|restart|pull|push|compose)/,
  /^execute:docker-compose /,
  /^execute:kubectl (get|describe|logs|apply|delete|exec|port-forward)/,
  /^execute:terraform (init|plan|apply|destroy|validate|fmt)/,
  // Local network only
  /^execute:curl .* localhost/,
  /^execute:curl .* 127\.0\.0\.1/,
  /^execute:wget .* localhost/,
  /^execute:http /,
  /^browser:localhost/,
  /^browser:127\.0\.0\.1/,
  /^browser:file:\/\//,
];

const INSTANT_DENY: RegExp[] = [
  // Unix catastrophic
  /^execute:rm -rf \/$/,
  /^execute:rm -rf \/\*$/,
  /^execute:rm -rf ~$/,
  /^execute:rm -rf ~\/\*$/,
  /^execute:rm -rf \.\.\//,
  /^execute:dd if=.*of=\/dev\//,
  /^execute:mkfs\./,
  /^execute:fdisk /,
  /^execute:parted /,

  // Windows catastrophic
  /^execute:rd \/s \/q [a-zA-Z]:\\$/,
  /^execute:del \/f \/s \/q [a-zA-Z]:\\$/,
  /^execute:format [a-zA-Z]:/,
  /^execute:diskpart/,

  // System paths (Unix)
  /^execute:.*>\/etc\//,
  /^execute:.*>\/usr\//,
  /^execute:.*>\/bin\//,
  /^execute:.*>\/sbin\//,
  /^execute:.*>\/boot\//,
  /^execute:.*>\/sys\//,
  /^execute:.*>\/proc\//,
  /^write:\/etc\//,
  /^write:\/usr\//,
  /^write:\/bin\//,
  /^write:\/sbin\//,
  /^write:\/boot\//,

  // System paths (Windows)
  /^write:[a-zA-Z]:\\Windows\\/i,
  /^write:[a-zA-Z]:\\Program Files/i,
  /^write:[a-zA-Z]:\\System/i,
  /^execute:.*>[a-zA-Z]:\\Windows\\/i,

  // Credential/secret files (cross-platform)
  /^write:.*\/\.env$/,
  /^write:.*\/\.env\.local$/,
  /^write:.*\/\.env\.production$/,
  /^write:.*\\\.env$/,
  /^write:.*\\\.env\.local$/,
  /^write:.*\/\.ssh\//,
  /^write:.*\\\.ssh\\/,
  /^write:.*\/\.aws\//,
  /^write:.*\\\.aws\\/,
  /^write:.*\/\.gcp\//,
  /^write:.*\/\.azure\//,
  /^write:.*\/credentials/i,
  /^write:.*\/secrets/i,
  /^write:.*\\credentials/i,
  /^write:.*\\secrets/i,
  /^write:.*\/\.netrc$/,
  /^write:.*\/\.npmrc$/,
  /^write:.*\/\.pypirc$/,

  // Dangerous execution patterns
  /^execute:curl.*\|.*sh$/,
  /^execute:curl.*\|.*bash$/,
  /^execute:wget.*\|.*sh$/,
  /^execute:wget.*\|.*bash$/,
  /^execute:powershell.*-enc/i,  // encoded commands
  /^execute:powershell.*downloadstring/i,
  /^execute:powershell.*invoke-webrequest.*\|.*iex/i,
  /^execute:chmod 777/,
  /^execute:chmod -R 777/,
  /^execute:chown.*:.*\//,
  /^execute:sudo /,
  /^execute:su /,
  /^execute:passwd/,
  /^execute:visudo/,
  /^execute:runas /i,

  // Network exfiltration
  /^execute:.*\| curl/,
  /^execute:.*\| nc /,
  /^execute:.*\| netcat/,
  /^execute:scp .* .*@.*:/,
  /^execute:rsync .* .*@.*:/,

  // Crypto/wallet/keys
  /^write:.*wallet/i,
  /^write:.*\.key$/,
  /^write:.*\.pem$/,
  /^write:.*private.*key/i,
  /^write:.*\\wallet/i,
];

const persistedRules = new Map<string, boolean>();

function extractPattern(action: string, target: string): string {
  // Normalize to forward slashes for consistent pattern matching
  const normalizedTarget = normalizePath(target)
    .replace(/\/[^\/]+\.(ts|js|tsx|jsx|py|json|yaml|yml|md)$/i, "/*.$1")
    .replace(/\/node_modules\/.*/, "/node_modules/*")
    .replace(/\/dist\/.*/, "/dist/*")
    .replace(/:\d+/, ":*")
    .replace(/\/\d+/g, "/*");
  return `${action}:${normalizedTarget}`;
}

async function decideWithOpus(
  client: Anthropic,
  action: string,
  target: string,
  context: string,
  pattern: string
): Promise<{ allow: boolean; persist: string; reasoning: string }> {
  try {
    const response = await client.messages.create({
      model: "claude-opus-4-5-20251101",
      max_tokens: 300,
      system: `You approve/deny actions for an autonomous coding agent.

Principles:
- Prefer "always" for recurring safe patterns
- Use "once" for sensitive or one-off actions
- Deny genuinely dangerous actions
- Be concise

Respond ONLY with JSON:
{"allow":true,"persist":"always","reasoning":"brief"}`,
      messages: [
        {
          role: "user",
          content: `Action: ${action}\nTarget: ${target}\nContext: ${context}\nPattern: ${pattern}\n\nDecide.`,
        },
      ],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const clean = text.replace(/```json\n?|\n?```/g, "").trim();
    return JSON.parse(clean);
  } catch (error) {
    console.error("Opus API error:", error);
    return { allow: true, persist: "once", reasoning: "API error, allowing once" };
  }
}

async function decide(
  client: Anthropic,
  action: string,
  target: string,
  context: string
): Promise<{ allow: boolean; persist: string; reasoning: string }> {
  // Normalize path separators for consistent matching
  const normalizedTarget = normalizePath(target);
  const pattern = extractPattern(action, target);
  const literal = `${action}:${normalizedTarget}`;

  // Check cache
  if (persistedRules.has(pattern)) {
    return {
      allow: persistedRules.get(pattern)!,
      persist: "always",
      reasoning: "Cached rule",
    };
  }

  // Fast deny
  if (INSTANT_DENY.some((re) => re.test(literal))) {
    persistedRules.set(pattern, false);
    return { allow: false, persist: "always", reasoning: "Blocked pattern" };
  }

  // Fast allow
  if (INSTANT_ALLOW.some((re) => re.test(literal))) {
    persistedRules.set(pattern, true);
    return { allow: true, persist: "always", reasoning: "Safe pattern" };
  }

  // Ask Opus
  const decision = await decideWithOpus(client, action, target, context, pattern);
  if (decision.persist === "always") {
    persistedRules.set(pattern, decision.allow);
  }
  return decision;
}

// ============================================
// MCP SERVER
// ============================================

const server = new Server(
  {
    name: "approval-oracle",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const anthropicClient = new Anthropic();

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "decide_approval",
        description: `Evaluates whether an action should be approved for an autonomous coding agent.
Returns: { allow: boolean, persist: "once"|"session"|"always", reasoning: string }

Use this BEFORE performing any:
- File writes
- Terminal commands
- Browser actions
- File deletions

The oracle uses fast-path rules for common safe/dangerous patterns and falls back to Opus for ambiguous cases.
Decisions are cached by pattern for efficiency.`,
        inputSchema: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["read", "write", "execute", "browser", "delete"],
              description: "The type of action being requested",
            },
            target: {
              type: "string",
              description: "The target of the action (file path, command, URL)",
            },
            context: {
              type: "string",
              description: "Brief description of what task this action is part of",
            },
          },
          required: ["action", "target", "context"],
        },
      },
      {
        name: "get_cached_rules",
        description: "Returns all cached approval rules for debugging",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "clear_cached_rules",
        description: "Clears all cached approval rules",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "decide_approval": {
      const { action, target, context } = args as {
        action: string;
        target: string;
        context: string;
      };
      const decision = await decide(anthropicClient, action, target, context);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(decision, null, 2),
          },
        ],
      };
    }

    case "get_cached_rules": {
      const rules = Object.fromEntries(persistedRules);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(rules, null, 2),
          },
        ],
      };
    }

    case "clear_cached_rules": {
      persistedRules.clear();
      return {
        content: [
          {
            type: "text",
            text: "Cached rules cleared",
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Approval Oracle MCP server running");
}

main().catch(console.error);
