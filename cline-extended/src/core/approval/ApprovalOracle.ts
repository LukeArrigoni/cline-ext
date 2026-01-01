import Anthropic from "@anthropic-ai/sdk";
import { ApprovalRequest, ApprovalDecision, ApprovalOracleConfig } from "../../shared/architect-types";

export class ApprovalOracle {
  private client: Anthropic;
  private persistedRules: Map<string, boolean> = new Map();
  private config: ApprovalOracleConfig;

  // Fast-path patterns - no Opus call needed
  private readonly INSTANT_ALLOW: RegExp[] = [
    /^read:/,
    /^write:.*\.(ts|js|tsx|jsx|py|rb|go|rs|java|kt|swift|c|cpp|h|hpp|md|json|yaml|yml|toml|css|scss|less|html|xml|sql|sh|bash|zsh|fish|ps1|dockerfile|makefile|txt|csv|env\.example)$/i,
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
    /^execute:npm (install|ci|run|test|build|start|lint|format|typecheck|dev|preview)/,
    /^execute:npx /,
    /^execute:yarn /,
    /^execute:pnpm /,
    /^execute:bun /,
    /^execute:deno /,
    /^execute:cargo (build|run|test|check|clippy|fmt|add|remove)/,
    /^execute:go (build|run|test|mod|get|fmt|vet)/,
    /^execute:pip install/,
    /^execute:pip3 install/,
    /^execute:python /,
    /^execute:python3 /,
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
    /^execute:git (status|diff|log|branch|checkout|add|commit|push|pull|fetch|stash|rebase|merge|clone|init|remote|tag|show|blame|reflog)/,
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
    /^execute:where /,
    /^execute:whoami/,
    /^execute:date/,
    /^execute:time /,
    /^execute:wc /,
    /^execute:sort /,
    /^execute:uniq /,
    /^execute:sed /,
    /^execute:awk /,
    /^execute:cut /,
    /^execute:tr /,
    /^execute:tee /,
    /^execute:xargs /,
    /^execute:env($| )/,
    /^execute:export /,
    /^execute:source /,
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
    /^execute:docker (build|run|ps|images|logs|exec|stop|start|restart|pull|push|compose)/,
    /^execute:docker-compose /,
    /^execute:kubectl (get|describe|logs|apply|delete|exec|port-forward)/,
    /^execute:terraform (init|plan|apply|destroy|validate|fmt)/,
    /^execute:curl .* localhost/,
    /^execute:curl .* 127\.0\.0\.1/,
    /^execute:wget .* localhost/,
    /^execute:http /,  // httpie
    /^browser:localhost/,
    /^browser:127\.0\.0\.1/,
    /^browser:file:\/\//,
    // Windows-specific safe commands
    /^execute:dir($| )/,
    /^execute:type /,
    /^execute:copy /,
    /^execute:move /,
    /^execute:md /,
    /^execute:rd /,
    /^execute:set($| )/,
  ];

  private readonly INSTANT_DENY: RegExp[] = [
    // Catastrophic file operations
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

    // System modification
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

    // Credential/secret files
    /^write:.*\/\.env$/,
    /^write:.*\/\.env\.local$/,
    /^write:.*\/\.env\.production$/,
    /^write:.*\/\.ssh\//,
    /^write:.*\/\.aws\//,
    /^write:.*\/\.gcp\//,
    /^write:.*\/\.azure\//,
    /^write:.*\/credentials/i,
    /^write:.*\/secrets/i,
    /^write:.*\/\.netrc$/,
    /^write:.*\/\.npmrc$/,  // can contain tokens
    /^write:.*\/\.pypirc$/,

    // Dangerous patterns
    /^execute:curl.*\|.*sh$/,
    /^execute:curl.*\|.*bash$/,
    /^execute:wget.*\|.*sh$/,
    /^execute:wget.*\|.*bash$/,
    /^execute:powershell.*-enc/i,
    /^execute:powershell.*downloadstring/i,
    /^execute:chmod 777/,
    /^execute:chmod -R 777/,
    /^execute:chown.*:.*\//,
    /^execute:sudo /,
    /^execute:su /,
    /^execute:passwd/,
    /^execute:visudo/,
    /^execute:runas /i,

    // Network exfiltration patterns
    /^execute:.*\| curl/,
    /^execute:.*\| nc /,
    /^execute:.*\| netcat/,
    /^execute:scp .* .*@.*:/,
    /^execute:rsync .* .*@.*:/,

    // Crypto/wallet
    /^write:.*wallet/i,
    /^write:.*\.key$/,
    /^write:.*\.pem$/,
    /^write:.*private.*key/i,
  ];

  constructor(apiKey: string, config?: Partial<ApprovalOracleConfig>) {
    this.client = new Anthropic({ apiKey });
    this.config = {
      enabled: true,
      showRoutineApprovals: false,
      customAllowPatterns: [],
      customDenyPatterns: [],
      ...config,
    };

    // Add custom patterns
    if (this.config.customAllowPatterns.length > 0) {
      this.INSTANT_ALLOW.push(
        ...this.config.customAllowPatterns.map((p) => new RegExp(p))
      );
    }
    if (this.config.customDenyPatterns.length > 0) {
      this.INSTANT_DENY.push(
        ...this.config.customDenyPatterns.map((p) => new RegExp(p))
      );
    }
  }

  async decide(request: ApprovalRequest): Promise<ApprovalDecision> {
    const pattern = this.extractPattern(request);
    // Normalize path separators for consistent matching
    const normalizedTarget = request.target.replace(/\\/g, "/");
    const literal = `${request.action}:${normalizedTarget}`;

    // Check persisted rules first
    if (this.persistedRules.has(pattern)) {
      return {
        allow: this.persistedRules.get(pattern)!,
        persist: "always",
        reasoning: "Cached rule",
      };
    }

    // Fast-path deny (check first for security)
    if (this.INSTANT_DENY.some((re) => re.test(literal))) {
      this.persistedRules.set(pattern, false);
      return { allow: false, persist: "always", reasoning: "Blocked pattern" };
    }

    // Fast-path allow
    if (this.INSTANT_ALLOW.some((re) => re.test(literal))) {
      this.persistedRules.set(pattern, true);
      return { allow: true, persist: "always", reasoning: "Safe pattern" };
    }

    // Opus decides ambiguous cases
    return this.askOpus(request, pattern);
  }

  private async askOpus(
    request: ApprovalRequest,
    pattern: string
  ): Promise<ApprovalDecision> {
    try {
      const response = await this.client.messages.create({
        model: "claude-opus-4-5-20251101",
        max_tokens: 300,
        system: `You approve/deny actions for an autonomous coding agent.

Principles:
- Optimize for efficiency. Prefer "always" for recurring safe patterns.
- Use "once" for sensitive or one-off actions.
- Deny genuinely dangerous actions: credential access, system modification, data exfiltration.
- When uncertain, allow with "once".
- Be concise.

Respond ONLY with valid JSON, no markdown:
{"allow":true,"persist":"always","reasoning":"brief reason"}`,
        messages: [
          {
            role: "user",
            content: `Action: ${request.action}
Target: ${request.target}
Context: ${request.context}
Generalized pattern: ${pattern}

Decide.`,
          },
        ],
      });

      const decision = this.parseResponse(response);

      if (decision.persist === "always") {
        this.persistedRules.set(pattern, decision.allow);
      }

      return decision;
    } catch (error) {
      // On API error, allow once (fail open for usability)
      console.error("ApprovalOracle API error:", error);
      return {
        allow: true,
        persist: "once",
        reasoning: "API error, allowing once",
      };
    }
  }

  private extractPattern(request: ApprovalRequest): string {
    // Generalize specific paths to patterns for caching
    // Normalize path separators first
    const target = request.target
      .replace(/\\/g, "/")
      // File extensions
      .replace(/\/[^\/]+\.(ts|js|tsx|jsx|py|rb|go|rs|java|kt|json|yaml|yml|md|css|html)$/i, "/*.$1")
      // Common directories
      .replace(/\/node_modules\/.*/, "/node_modules/*")
      .replace(/\/dist\/.*/, "/dist/*")
      .replace(/\/build\/.*/, "/build/*")
      .replace(/\/\.next\/.*/, "/.next/*")
      .replace(/\/target\/.*/, "/target/*")
      .replace(/\/vendor\/.*/, "/vendor/*")
      .replace(/\/__pycache__\/.*/, "/__pycache__/*")
      // Numbers (ports, IDs)
      .replace(/:\d+/, ":*")
      .replace(/\/\d+/g, "/*");

    return `${request.action}:${target}`;
  }

  private parseResponse(response: any): ApprovalDecision {
    const text = response.content[0]?.text || "";
    try {
      const clean = text.replace(/```json\n?|\n?```/g, "").trim();
      const parsed = JSON.parse(clean);

      // Validate structure
      if (typeof parsed.allow !== "boolean") {
        throw new Error("Missing allow field");
      }
      if (!["once", "session", "always"].includes(parsed.persist)) {
        parsed.persist = "once";
      }
      if (typeof parsed.reasoning !== "string") {
        parsed.reasoning = "No reason provided";
      }

      return parsed;
    } catch {
      return {
        allow: true,
        persist: "once",
        reasoning: "Parse failed, allowing once",
      };
    }
  }

  // Public API for debugging/UI
  getPersistedRules(): Map<string, boolean> {
    return new Map(this.persistedRules);
  }

  clearPersistedRules(): void {
    this.persistedRules.clear();
  }

  exportRules(): Record<string, boolean> {
    return Object.fromEntries(this.persistedRules);
  }

  importRules(rules: Record<string, boolean>): void {
    for (const [pattern, allow] of Object.entries(rules)) {
      this.persistedRules.set(pattern, allow);
    }
  }
}
