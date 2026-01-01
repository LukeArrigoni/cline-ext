# Cline Extended: Complete Implementation Spec

**Target:** Fork Cline, add Architect Mode, ApprovalOracle, Persona injection, unlimited tokens, architectural awareness.

**Executor:** Cursor
**Architect:** Claude (external context)

---

## Part 0: Prerequisites

```bash
# Uninstall existing Cline
code --uninstall-extension saoudrizwan.claude-dev

# Clone
git clone https://github.com/cline/cline.git cline-extended
cd cline-extended

# Install dependencies
npm run install:all

# Verify it builds
npm run build
```

---

## Part 1: Rename Extension

### 1.1 package.json (root)
```json
{
  "name": "cline-extended",
  "displayName": "Cline Extended",
  "publisher": "local",
  "description": "Cline with Architect Mode, ApprovalOracle, and architectural awareness"
}
```

### 1.2 webview-ui/package.json
Update `name` field to `cline-extended-webview`.

### 1.3 Search and replace
Find all instances of `"cline"` or `"Cline"` in user-facing strings and update to `"Cline Extended"` where appropriate. Keep import paths unchanged.

---

## Part 2: Type Definitions

### 2.1 Create src/shared/architect-types.ts

```typescript
/**
 * Architect Mode configuration and state types
 */

// ============================================
// PERSONA
// ============================================

export interface PersonaConfig {
  enabled: boolean;
  markdown: string;
  applyTo: "architect" | "editor" | "both";
  position: "prepend" | "append";
}

// ============================================
// APPROVAL ORACLE
// ============================================

export interface ApprovalOracleConfig {
  enabled: boolean;
  showRoutineApprovals: boolean;
  customAllowPatterns: string[];
  customDenyPatterns: string[];
}

export interface ApprovalRequest {
  action: "read" | "write" | "execute" | "browser" | "delete";
  target: string;
  context: string;
  previousDecisions: Map<string, string>;
}

export interface ApprovalDecision {
  allow: boolean;
  persist: "once" | "session" | "always";
  reasoning: string;
}

// ============================================
// ARCHITECTURE
// ============================================

export type ArchitectureStyle = "monolith" | "modular_monolith" | "microservices" | "serverless";
export type ProjectStage = "mvp" | "growth" | "scale" | "enterprise";

export interface ExtractionSignals {
  fileLines: number;
  directoryFiles: number;
  circularImports: boolean;
  mixedDomains: boolean;
  independentScaling: boolean;
  independentDeployment: boolean;
  teamBoundary: boolean;
}

export interface ConsolidationSignals {
  serviceLoc: number;
  sharedState: boolean;
  syncCallsOnly: boolean;
  singleConsumer: boolean;
}

export interface ArchitectureConfig {
  enabled: boolean;
  style: ArchitectureStyle;
  stage: ProjectStage;
  domains: string[];
  extractionSignals: Partial<ExtractionSignals>;
  consolidationSignals: Partial<ConsolidationSignals>;
  typesPath: string;        // path to types.yaml
  contractsPath: string;    // path to contracts/ directory
}

// ============================================
// ARCHITECT MODE (main config)
// ============================================

export interface ArchitectConfig {
  enabled: boolean;
  
  // Models
  architectModel: string;
  architectProvider: string;
  editorModel: string;
  editorProvider: string;
  
  // Tokens (undefined = unlimited)
  thinkingBudget?: number;
  maxTokens?: number;
  
  // Loop control
  maxIterations: number;
  
  // Sub-configs
  persona?: PersonaConfig;
  approvalOracle?: ApprovalOracleConfig;
  architecture?: ArchitectureConfig;
}

export const DEFAULT_ARCHITECT_CONFIG: ArchitectConfig = {
  enabled: false,
  architectModel: "claude-opus-4-5-20251101",
  architectProvider: "anthropic",
  editorModel: "claude-sonnet-4-5-20250929",
  editorProvider: "anthropic",
  thinkingBudget: undefined,  // unlimited
  maxTokens: undefined,        // model max
  maxIterations: 5,
};

// ============================================
// ORCHESTRATOR STATE
// ============================================

export interface ArchitectState {
  phase: "planning" | "implementing" | "evaluating" | "complete" | "failed";
  currentIteration: number;
  plan: string | null;
  implementation: string | null;
  evaluation: string | null;
  thinkingContent: string | null;
}

export type ArchitectUpdate =
  | { type: "phase"; phase: string; iteration: number }
  | { type: "thinking"; content: string }
  | { type: "plan"; content: string; thinking?: string }
  | { type: "implementation"; content: string }
  | { type: "evaluation"; content: string; thinking?: string }
  | { type: "approval_request"; action: string; target: string; decision: ApprovalDecision }
  | { type: "architecture_review"; message: string; options: string[] }
  | { type: "complete"; iterations: number }
  | { type: "max_iterations"; iterations: number };
```

---

## Part 3: Approval Oracle

### 3.1 Create src/core/approval/ApprovalOracle.ts

```typescript
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
    /^execute:chmod 777/,
    /^execute:chmod -R 777/,
    /^execute:chown.*:.*\//,
    /^execute:sudo /,
    /^execute:su /,
    /^execute:passwd/,
    /^execute:visudo/,
    
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
    const literal = `${request.action}:${request.target}`;

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
    const target = request.target
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
```

---

## Part 4: Persona Loader

### 4.1 Create src/core/persona/PersonaLoader.ts

```typescript
import * as fs from "fs";
import * as path from "path";
import { PersonaConfig } from "../../shared/architect-types";

export class PersonaLoader {
  /**
   * Load persona from file path
   */
  static fromFile(filePath: string): string {
    try {
      if (!fs.existsSync(filePath)) {
        console.warn(`Persona file not found: ${filePath}`);
        return "";
      }
      return fs.readFileSync(filePath, "utf-8");
    } catch (e) {
      console.error(`Failed to load persona from ${filePath}:`, e);
      return "";
    }
  }

  /**
   * Load persona from workspace .cline/persona.md if exists
   */
  static fromWorkspace(workspaceRoot: string): string | null {
    const locations = [
      path.join(workspaceRoot, ".cline", "persona.md"),
      path.join(workspaceRoot, ".cursor", "persona.md"),
      path.join(workspaceRoot, "persona.md"),
    ];

    for (const location of locations) {
      if (fs.existsSync(location)) {
        return this.fromFile(location);
      }
    }

    return null;
  }

  /**
   * Inject persona into system prompt
   */
  static inject(
    systemPrompt: string,
    persona: string,
    position: "prepend" | "append"
  ): string {
    if (!persona.trim()) return systemPrompt;

    const wrapped = `<persona>\n${persona.trim()}\n</persona>`;

    if (position === "prepend") {
      return `${wrapped}\n\n${systemPrompt}`;
    } else {
      return `${systemPrompt}\n\n${wrapped}`;
    }
  }

  /**
   * Inject persona based on config
   */
  static injectFromConfig(
    systemPrompt: string,
    config: PersonaConfig | undefined,
    role: "architect" | "editor"
  ): string {
    if (!config?.enabled || !config.markdown) {
      return systemPrompt;
    }

    if (config.applyTo === role || config.applyTo === "both") {
      return this.inject(systemPrompt, config.markdown, config.position);
    }

    return systemPrompt;
  }
}
```

---

## Part 5: Architecture Analyzer

### 5.1 Create src/core/architecture/ArchitectureAnalyzer.ts

```typescript
import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { ArchitectureConfig, ExtractionSignals } from "../../shared/architect-types";

export interface ArchitectureReview {
  needsReview: boolean;
  signals: string[];
  recommendation: string;
  options: string[];
}

export interface TypeDefinitions {
  types: Record<string, any>;
  namingConventions?: {
    case?: string;
    ids?: string;
    timestamps?: string;
    money?: string;
  };
}

export interface ServiceContract {
  service: string;
  status?: string;
  endpoints?: any[];
  messages?: Record<string, any>;
  types_used?: string[];
}

export class ArchitectureAnalyzer {
  private config: ArchitectureConfig;
  private workspaceRoot: string;
  private types: TypeDefinitions | null = null;
  private contracts: Map<string, ServiceContract> = new Map();

  constructor(config: ArchitectureConfig, workspaceRoot: string) {
    this.config = config;
    this.workspaceRoot = workspaceRoot;
    this.loadTypes();
    this.loadContracts();
  }

  private loadTypes(): void {
    const typesPath = path.join(this.workspaceRoot, this.config.typesPath || ".cline/contracts/types.yaml");
    if (fs.existsSync(typesPath)) {
      try {
        this.types = yaml.load(fs.readFileSync(typesPath, "utf-8")) as TypeDefinitions;
      } catch (e) {
        console.error("Failed to load types.yaml:", e);
      }
    }
  }

  private loadContracts(): void {
    const contractsDir = path.join(this.workspaceRoot, this.config.contractsPath || ".cline/contracts/services");
    if (!fs.existsSync(contractsDir)) return;

    try {
      const files = fs.readdirSync(contractsDir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
      for (const file of files) {
        const content = yaml.load(fs.readFileSync(path.join(contractsDir, file), "utf-8")) as ServiceContract;
        if (content.service) {
          this.contracts.set(content.service, content);
        }
      }
    } catch (e) {
      console.error("Failed to load contracts:", e);
    }
  }

  /**
   * Analyze a file change for architectural concerns
   */
  async analyzeChange(filePath: string, newContent: string): Promise<ArchitectureReview> {
    const signals: string[] = [];
    
    // Check file size
    const lines = newContent.split("\n").length;
    const threshold = this.config.extractionSignals?.fileLines || 500;
    if (lines > threshold) {
      signals.push(`File exceeds ${threshold} lines (${lines} lines)`);
    }

    // Check directory bloat
    const dir = path.dirname(filePath);
    const dirSignal = await this.checkDirectorySize(dir);
    if (dirSignal) signals.push(dirSignal);

    // Check domain mixing
    const domainSignal = this.checkDomainMixing(filePath, newContent);
    if (domainSignal) signals.push(domainSignal);

    // Check naming conventions against types.yaml
    const namingSignals = this.checkNamingConventions(newContent);
    signals.push(...namingSignals);

    // Build recommendation
    if (signals.length === 0) {
      return { needsReview: false, signals: [], recommendation: "", options: [] };
    }

    const recommendation = this.buildRecommendation(signals, filePath);
    const options = this.buildOptions(signals, filePath);

    return {
      needsReview: true,
      signals,
      recommendation,
      options,
    };
  }

  private async checkDirectorySize(dir: string): Promise<string | null> {
    try {
      const fullPath = path.join(this.workspaceRoot, dir);
      if (!fs.existsSync(fullPath)) return null;

      const files = fs.readdirSync(fullPath).filter((f) => {
        const stat = fs.statSync(path.join(fullPath, f));
        return stat.isFile() && !f.startsWith(".");
      });

      const threshold = this.config.extractionSignals?.directoryFiles || 15;
      if (files.length > threshold) {
        return `Directory ${dir} has ${files.length} files (threshold: ${threshold})`;
      }
    } catch {
      // Ignore errors
    }
    return null;
  }

  private checkDomainMixing(filePath: string, content: string): string | null {
    if (!this.config.domains || this.config.domains.length === 0) return null;

    // Determine which domain this file belongs to
    const fileDomain = this.config.domains.find((d) => filePath.includes(`/${d}/`));
    if (!fileDomain) return null;

    // Check if content references other domains
    const otherDomains = this.config.domains.filter((d) => d !== fileDomain);
    const violations: string[] = [];

    for (const domain of otherDomains) {
      // Simple heuristic: check for imports or references
      const patterns = [
        new RegExp(`from.*['"].*/${domain}/`, "g"),
        new RegExp(`import.*['"].*/${domain}/`, "g"),
        new RegExp(`require.*['"].*/${domain}/`, "g"),
      ];

      for (const pattern of patterns) {
        if (pattern.test(content)) {
          violations.push(domain);
          break;
        }
      }
    }

    if (violations.length > 0) {
      return `File in ${fileDomain} domain imports from: ${violations.join(", ")}`;
    }

    return null;
  }

  private checkNamingConventions(content: string): string[] {
    const signals: string[] = [];
    if (!this.types?.namingConventions) return signals;

    const conventions = this.types.namingConventions;

    // Check case convention
    if (conventions.case === "snake_case") {
      // Look for camelCase in likely identifier positions
      const camelCasePattern = /["']([a-z]+[A-Z][a-zA-Z]*)['"]\s*:/g;
      const matches = content.match(camelCasePattern);
      if (matches && matches.length > 0) {
        signals.push(`Found camelCase identifiers (expected snake_case): ${matches.slice(0, 3).join(", ")}...`);
      }
    }

    // Check ID naming
    if (conventions.ids) {
      const expected = conventions.ids; // e.g., "{entity}_id"
      if (expected.includes("_id")) {
        // Look for entityId pattern instead of entity_id
        const badIdPattern = /["']([a-z]+Id)['"]/g;
        const matches = content.match(badIdPattern);
        if (matches && matches.length > 0) {
          signals.push(`Found incorrect ID format (expected *_id): ${matches.slice(0, 3).join(", ")}...`);
        }
      }
    }

    return signals;
  }

  private buildRecommendation(signals: string[], filePath: string): string {
    const style = this.config.style;
    const stage = this.config.stage;

    if (style === "monolith") {
      return "Monolith style: Consider refactoring for clarity but no extraction needed.";
    }

    if (signals.some((s) => s.includes("exceeds") || s.includes("files"))) {
      if (style === "microservices") {
        return "Consider extracting to a separate service.";
      } else {
        return "Consider extracting to a separate module.";
      }
    }

    if (signals.some((s) => s.includes("domain imports"))) {
      return "Domain boundary violation. Consider moving shared logic to a common module or defining an interface.";
    }

    if (signals.some((s) => s.includes("naming"))) {
      return "Naming convention violation. Update to match types.yaml definitions.";
    }

    return "Review the signals and decide on appropriate action.";
  }

  private buildOptions(signals: string[], filePath: string): string[] {
    const options: string[] = [];

    if (signals.some((s) => s.includes("exceeds") || s.includes("files"))) {
      options.push("Extract to new module");
      if (this.config.style === "microservices") {
        options.push("Extract to new service");
      }
      options.push("Refactor into submodules");
      options.push("Keep as-is with justification");
    }

    if (signals.some((s) => s.includes("domain imports"))) {
      options.push("Move shared code to common/");
      options.push("Define interface/contract");
      options.push("Accept coupling with justification");
    }

    if (signals.some((s) => s.includes("naming"))) {
      options.push("Fix naming to match conventions");
      options.push("Update types.yaml to allow this pattern");
    }

    return options;
  }

  /**
   * Get types.yaml content for injection into context
   */
  getTypesContext(): string {
    if (!this.types) return "";
    return `<types_definitions>\n${yaml.dump(this.types)}\n</types_definitions>`;
  }

  /**
   * Get relevant contract for a service
   */
  getContractContext(serviceName: string): string {
    const contract = this.contracts.get(serviceName);
    if (!contract) return "";
    return `<service_contract service="${serviceName}">\n${yaml.dump(contract)}\n</service_contract>`;
  }

  /**
   * Detect which service a file belongs to based on path
   */
  detectService(filePath: string): string | null {
    for (const [serviceName] of this.contracts) {
      if (filePath.includes(`/${serviceName}/`) || filePath.includes(`\\${serviceName}\\`)) {
        return serviceName;
      }
    }
    return null;
  }
}
```

---

## Part 6: Architect Orchestrator

### 6.1 Create src/core/architect/ArchitectOrchestrator.ts

```typescript
import { ApiHandler, buildApiHandler } from "../../api";
import { PersonaLoader } from "../persona/PersonaLoader";
import { ApprovalOracle } from "../approval/ApprovalOracle";
import { ArchitectureAnalyzer } from "../architecture/ArchitectureAnalyzer";
import {
  ArchitectConfig,
  ArchitectState,
  ArchitectUpdate,
  ApprovalDecision,
} from "../../shared/architect-types";

export class ArchitectOrchestrator {
  private architectHandler: ApiHandler;
  private editorHandler: ApiHandler;
  private config: ArchitectConfig;
  private state: ArchitectState;
  private approvalOracle: ApprovalOracle | null = null;
  private architectureAnalyzer: ArchitectureAnalyzer | null = null;
  private apiKey: string;
  private workspaceRoot: string;

  constructor(
    config: ArchitectConfig,
    apiConfig: any,
    apiKey: string,
    workspaceRoot: string
  ) {
    this.config = config;
    this.apiKey = apiKey;
    this.workspaceRoot = workspaceRoot;

    this.state = {
      phase: "planning",
      currentIteration: 0,
      plan: null,
      implementation: null,
      evaluation: null,
      thinkingContent: null,
    };

    // Build separate handlers for architect and editor
    this.architectHandler = buildApiHandler({
      ...apiConfig,
      apiProvider: config.architectProvider,
      apiModelId: config.architectModel,
    });

    this.editorHandler = buildApiHandler({
      ...apiConfig,
      apiProvider: config.editorProvider,
      apiModelId: config.editorModel,
    });

    // Initialize ApprovalOracle if enabled
    if (config.approvalOracle?.enabled) {
      this.approvalOracle = new ApprovalOracle(apiKey, config.approvalOracle);
    }

    // Initialize ArchitectureAnalyzer if enabled
    if (config.architecture?.enabled) {
      this.architectureAnalyzer = new ArchitectureAnalyzer(
        config.architecture,
        workspaceRoot
      );
    }
  }

  async *run(
    task: string,
    codebaseContext: string
  ): AsyncGenerator<ArchitectUpdate> {
    // Inject types context if available
    if (this.architectureAnalyzer) {
      const typesContext = this.architectureAnalyzer.getTypesContext();
      if (typesContext) {
        codebaseContext = `${typesContext}\n\n${codebaseContext}`;
      }
    }

    while (this.state.currentIteration < this.config.maxIterations) {
      this.state.currentIteration++;

      // Phase 1: Architect plans
      this.state.phase = "planning";
      yield {
        type: "phase",
        phase: "planning",
        iteration: this.state.currentIteration,
      };

      const plan = await this.architectPlan(task, codebaseContext);
      this.state.plan = plan.content;
      this.state.thinkingContent = plan.thinking;

      if (plan.thinking) {
        yield { type: "thinking", content: plan.thinking };
      }
      yield { type: "plan", content: plan.content, thinking: plan.thinking };

      // Phase 2: Editor implements
      this.state.phase = "implementing";
      yield {
        type: "phase",
        phase: "implementing",
        iteration: this.state.currentIteration,
      };

      const implementation = await this.editorImplement(
        plan.content,
        codebaseContext
      );
      this.state.implementation = implementation;
      yield { type: "implementation", content: implementation };

      // Phase 2.5: Architecture review (if enabled)
      if (this.architectureAnalyzer) {
        const review = await this.reviewArchitecture(implementation);
        if (review) {
          yield review;
          // If architecture review is needed, don't auto-approve
          // The review will be part of the evaluation context
        }
      }

      // Phase 3: Architect evaluates
      this.state.phase = "evaluating";
      yield {
        type: "phase",
        phase: "evaluating",
        iteration: this.state.currentIteration,
      };

      const evaluation = await this.architectEvaluate(
        task,
        plan.content,
        implementation,
        codebaseContext
      );
      this.state.evaluation = evaluation.content;

      if (evaluation.thinking) {
        yield { type: "thinking", content: evaluation.thinking };
      }
      yield {
        type: "evaluation",
        content: evaluation.content,
        thinking: evaluation.thinking,
      };

      // Check if complete
      if (this.isComplete(evaluation.content)) {
        this.state.phase = "complete";
        yield { type: "complete", iterations: this.state.currentIteration };
        return;
      }

      // Feed evaluation back for next iteration
      codebaseContext = this.updateContext(
        codebaseContext,
        implementation,
        evaluation.content
      );
    }

    this.state.phase = "failed";
    yield { type: "max_iterations", iterations: this.state.currentIteration };
  }

  /**
   * Request approval for an action
   */
  async requestApproval(
    action: "read" | "write" | "execute" | "browser" | "delete",
    target: string,
    context: string
  ): Promise<ApprovalDecision> {
    if (!this.approvalOracle) {
      // No oracle, auto-approve
      return { allow: true, persist: "once", reasoning: "Oracle disabled" };
    }

    return this.approvalOracle.decide({
      action,
      target,
      context,
      previousDecisions: new Map(),
    });
  }

  private async architectPlan(
    task: string,
    context: string
  ): Promise<{ content: string; thinking: string }> {
    let systemPrompt = `You are the Architect. Your role is to reason deeply about the task and produce a detailed implementation plan.

You will NOT write code. You will:
1. Analyze the task requirements thoroughly
2. Identify the files that need to be created or modified
3. Specify the exact changes needed in each file
4. Anticipate edge cases and failure modes
5. Provide clear, unambiguous instructions for the Editor

Your plan will be passed to a separate Editor model that will implement it.
The Editor cannot see your thinking process, only your final plan.
Be precise and explicit.

Format your plan as:
## Analysis
[Your understanding of the task]

## Files to Modify
[List each file with what needs to change]

## Implementation Steps
[Numbered steps the Editor should follow]

## Edge Cases
[What could go wrong and how to handle it]

## Acceptance Criteria
[How to verify the implementation is correct]`;

    // Inject persona if configured for architect
    systemPrompt = PersonaLoader.injectFromConfig(
      systemPrompt,
      this.config.persona,
      "architect"
    );

    const messages = [
      {
        role: "user" as const,
        content: `Context:\n${context}\n\nTask:\n${task}\n\nProvide your implementation plan.`,
      },
    ];

    // Build request options
    const requestOptions: any = {};

    // Add thinking if not explicitly disabled
    requestOptions.thinking = { type: "enabled" };
    if (
      this.config.thinkingBudget !== undefined &&
      this.config.thinkingBudget > 0
    ) {
      requestOptions.thinking.budget_tokens = this.config.thinkingBudget;
    }

    const response = await this.architectHandler.createMessage(
      systemPrompt,
      messages,
      requestOptions
    );

    return this.extractThinkingAndContent(response);
  }

  private async editorImplement(
    plan: string,
    context: string
  ): Promise<string> {
    let systemPrompt = `You are the Editor. Your role is to implement the Architect's plan precisely.

You will:
1. Follow the plan exactly as specified
2. Write clean, working code
3. Make only the changes specified in the plan
4. Include all necessary imports and dependencies
5. Handle the edge cases mentioned in the plan

If the plan is ambiguous on a specific point, make your best judgment and note it clearly.

Output your implementation as a series of file changes:

<file path="path/to/file.ts">
[complete file contents]
</file>

<file path="path/to/other.ts">
[complete file contents]
</file>

Include the complete file contents, not diffs.`;

    // Inject persona if configured for editor
    systemPrompt = PersonaLoader.injectFromConfig(
      systemPrompt,
      this.config.persona,
      "editor"
    );

    const messages = [
      {
        role: "user" as const,
        content: `Context:\n${context}\n\n---\n\nArchitect's Plan:\n${plan}\n\nImplement this plan now.`,
      },
    ];

    const response = await this.editorHandler.createMessage(
      systemPrompt,
      messages
    );

    return this.extractContent(response);
  }

  private async architectEvaluate(
    task: string,
    plan: string,
    implementation: string,
    context: string
  ): Promise<{ content: string; thinking: string }> {
    // Get architecture context if available
    let architectureContext = "";
    if (this.architectureAnalyzer) {
      // Check for any architectural concerns
      // This is a simplified version - in practice you'd parse the implementation
      const typesContext = this.architectureAnalyzer.getTypesContext();
      if (typesContext) {
        architectureContext = `\n\n${typesContext}\n\nVerify the implementation follows these type definitions and naming conventions.`;
      }
    }

    let systemPrompt = `You are the Architect reviewing the Editor's implementation.

Evaluate thoroughly:
1. Does the implementation match the plan?
2. Does it satisfy the original task requirements?
3. Are there bugs, edge cases, or issues?
4. Is the code clean, maintainable, and follows best practices?
5. Are naming conventions consistent?
6. Are all acceptance criteria met?

${architectureContext}

If the implementation is acceptable, respond starting with: "APPROVED: " followed by a brief summary.

If changes are needed, respond starting with: "REVISION NEEDED: " followed by:
- Specific issues found
- Exact corrections required
- Any clarifications to the plan`;

    // Inject persona if configured for architect
    systemPrompt = PersonaLoader.injectFromConfig(
      systemPrompt,
      this.config.persona,
      "architect"
    );

    const messages = [
      {
        role: "user" as const,
        content: `Original Task:\n${task}\n\n---\n\nPlan:\n${plan}\n\n---\n\nImplementation:\n${implementation}\n\n---\n\nContext:\n${context}\n\nEvaluate the implementation.`,
      },
    ];

    // Build request options
    const requestOptions: any = {};
    requestOptions.thinking = { type: "enabled" };
    if (
      this.config.thinkingBudget !== undefined &&
      this.config.thinkingBudget > 0
    ) {
      requestOptions.thinking.budget_tokens = this.config.thinkingBudget;
    }

    const response = await this.architectHandler.createMessage(
      systemPrompt,
      messages,
      requestOptions
    );

    return this.extractThinkingAndContent(response);
  }

  private async reviewArchitecture(
    implementation: string
  ): Promise<ArchitectUpdate | null> {
    if (!this.architectureAnalyzer) return null;

    // Parse implementation to find file paths and contents
    const filePattern = /<file path="([^"]+)">([\s\S]*?)<\/file>/g;
    let match;
    const issues: string[] = [];

    while ((match = filePattern.exec(implementation)) !== null) {
      const [, filePath, content] = match;
      const review = await this.architectureAnalyzer.analyzeChange(
        filePath,
        content
      );
      if (review.needsReview) {
        issues.push(
          `${filePath}:\n  Signals: ${review.signals.join(", ")}\n  Recommendation: ${review.recommendation}`
        );
      }
    }

    if (issues.length === 0) return null;

    return {
      type: "architecture_review",
      message: `Architectural concerns detected:\n\n${issues.join("\n\n")}`,
      options: ["Proceed with current implementation", "Revise to address concerns"],
    };
  }

  private isComplete(evaluation: string): boolean {
    const normalized = evaluation.trim().toUpperCase();
    return normalized.startsWith("APPROVED");
  }

  private updateContext(
    context: string,
    implementation: string,
    evaluation: string
  ): string {
    return `${context}

---

## Previous Iteration

### Implementation Attempt
${implementation}

### Architect Feedback
${evaluation}

---

Address the feedback above in the next iteration.`;
  }

  private extractThinkingAndContent(
    response: any
  ): { content: string; thinking: string } {
    let thinking = "";
    let content = "";

    // Handle async generator response
    if (typeof response[Symbol.asyncIterator] === "function") {
      // This shouldn't happen with our usage, but handle it
      console.warn("Received async iterator, expected direct response");
      return { thinking: "", content: "" };
    }

    // Handle direct response object
    for (const block of response.content || []) {
      if (block.type === "thinking") {
        thinking += block.thinking || "";
      } else if (block.type === "text") {
        content += block.text || "";
      }
    }

    return { thinking, content };
  }

  private extractContent(response: any): string {
    if (!response.content) return "";

    return response.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("");
  }

  // Expose state for UI
  getState(): ArchitectState {
    return { ...this.state };
  }
}
```

---

## Part 7: Integration with Cline Core

### 7.1 Find and modify src/core/Cline.ts

Locate the main Cline class. Add:

**Imports:**
```typescript
import { ArchitectOrchestrator } from "./architect/ArchitectOrchestrator";
import { ApprovalOracle } from "./approval/ApprovalOracle";
import { ArchitectConfig, DEFAULT_ARCHITECT_CONFIG } from "../shared/architect-types";
```

**Class properties:**
```typescript
private architectConfig: ArchitectConfig;
private approvalOracle: ApprovalOracle | null = null;
```

**In constructor or initialization:**
```typescript
// Load architect config from settings or use defaults
this.architectConfig = this.loadArchitectConfig() || DEFAULT_ARCHITECT_CONFIG;

// Initialize approval oracle if enabled (even without full architect mode)
if (this.architectConfig.approvalOracle?.enabled) {
  this.approvalOracle = new ApprovalOracle(
    this.apiConfiguration.apiKey,
    this.architectConfig.approvalOracle
  );
}
```

**Add LLM context loader:**
```typescript
import * as yaml from "js-yaml";

interface LLMContext {
  llm_context_version?: number;
  state?: {
    active_task?: string | null;
    blocked?: Array<{ task: string; reason: string }>;
    next_tasks?: string[];
    git_branch?: string;
    last_session?: string;
    last_action?: string;
  };
  decisions?: Array<{ date: string; decision: string; rationale?: string }>;
  files?: {
    hot?: string[];
    modified_this_session?: string[];
    do_not_modify?: string[];
  };
  tests?: {
    failing?: string[];
    skipped?: string[];
  };
  debt?: Array<{ file: string; line: number; type: string; note: string }>;
  momentum?: {
    velocity?: string;
    blockers_count?: number;
    risk?: string | null;
  };
  session_notes?: string;
  human_context?: Record<string, any>;
}

private llmContext: LLMContext = {};

private async loadLLMContext(): Promise<string> {
  const locations = [
    path.join(this.workspaceRoot, ".cline", "llm-context.yaml"),
    path.join(this.workspaceRoot, ".cline", "llm-context.md"),
    path.join(this.workspaceRoot, "llm-context.yaml"),
  ];

  for (const loc of locations) {
    if (fs.existsSync(loc)) {
      try {
        const content = fs.readFileSync(loc, "utf-8");
        if (loc.endsWith(".yaml") || loc.endsWith(".yml")) {
          this.llmContext = yaml.load(content) as LLMContext;
        }
        return `<llm_context>\n${content}\n</llm_context>`;
      } catch (e) {
        console.error("Failed to load llm-context:", e);
      }
    }
  }
  return "";
}

private async saveLLMContext(updates: {
  lastAction?: string;
  activeTask?: string;
  modifiedFiles?: string[];
  sessionNotes?: string;
}): Promise<void> {
  const contextPath = path.join(this.workspaceRoot, ".cline", "llm-context.yaml");
  
  // Ensure directory exists
  const dir = path.dirname(contextPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Load existing or start fresh
  let existing: LLMContext = this.llmContext;
  if (fs.existsSync(contextPath)) {
    try {
      existing = yaml.load(fs.readFileSync(contextPath, "utf-8")) as LLMContext;
    } catch {}
  }

  // Merge updates
  const updated: LLMContext = {
    ...existing,
    llm_context_version: 1,
    state: {
      ...existing.state,
      last_session: new Date().toISOString(),
      last_action: updates.lastAction || existing.state?.last_action,
      active_task: updates.activeTask || existing.state?.active_task,
    },
    files: {
      ...existing.files,
      modified_this_session: updates.modifiedFiles || [],
    },
    session_notes: updates.sessionNotes || existing.session_notes,
  };

  fs.writeFileSync(contextPath, yaml.dump(updated, { lineWidth: -1 }));
}
```

**Replace or wrap the permission request method:**

Search for methods like `askPermission`, `requestPermission`, `askUser`, or similar that handle approval prompts. Wrap them:

```typescript
private async requestPermission(
  action: "read" | "write" | "execute" | "browser" | "delete",
  target: string
): Promise<boolean> {
  // If approval oracle is enabled, use it
  if (this.approvalOracle) {
    const decision = await this.approvalOracle.decide({
      action,
      target,
      context: this.currentTask?.description || "autonomous task",
      previousDecisions: new Map(),
    });

    // Log non-routine decisions
    if (decision.persist !== "always" || !decision.allow) {
      await this.say(
        "text",
        `[Oracle] ${action} ${target}: ${decision.allow ? "✓" : "✗"} (${decision.persist})`
      );
    }

    return decision.allow;
  }

  // Fall back to original behavior
  return this.originalRequestPermission(action, target);
}
```

**Add architect mode task runner:**

```typescript
private async runArchitectMode(task: string): Promise<void> {
  // Load LLM context for cold boot recovery
  const llmContext = await this.loadLLMContext();
  let context = await this.gatherCodebaseContext();
  
  // Prepend llm-context if available
  if (llmContext) {
    context = `${llmContext}\n\n${context}`;
  }
  
  const orchestrator = new ArchitectOrchestrator(
    this.architectConfig,
    this.apiConfiguration,
    this.apiConfiguration.apiKey,
    this.workspaceRoot
  );

  const modifiedFiles: string[] = [];
  let lastAction = "";

  for await (const update of orchestrator.run(task, context)) {
    switch (update.type) {
      case "phase":
        await this.say(
          "text",
          `\n### ${update.phase.toUpperCase()} (Iteration ${update.iteration})\n`
        );
        lastAction = `${update.phase} iteration ${update.iteration}`;
        break;

      case "thinking":
        await this.say("reasoning", update.content);
        break;

      case "plan":
        await this.say("text", `**Architect Plan:**\n${update.content}`);
        break;

      case "implementation":
        // Parse and apply the implementation
        const files = await this.applyImplementation(update.content);
        modifiedFiles.push(...files);
        break;

      case "evaluation":
        await this.say("text", `**Architect Evaluation:**\n${update.content}`);
        break;

      case "architecture_review":
        await this.say(
          "text",
          `**Architecture Review:**\n${update.message}\n\nOptions:\n${update.options.map((o, i) => `${i + 1}. ${o}`).join("\n")}`
        );
        break;

      case "complete":
        await this.say(
          "text",
          `\n✓ Task completed in ${update.iterations} iteration(s).`
        );
        lastAction = `completed: ${task.substring(0, 50)}...`;
        break;

      case "max_iterations":
        await this.say(
          "text",
          `\n⚠ Max iterations (${update.iterations}) reached. Review output.`
        );
        lastAction = `max iterations reached: ${task.substring(0, 50)}...`;
        break;
    }
  }

  // Save LLM context for next session
  await this.saveLLMContext({
    lastAction,
    activeTask: task,
    modifiedFiles,
  });
}

private async applyImplementation(implementation: string): Promise<string[]> {
  // Parse file blocks from implementation
  const filePattern = /<file path="([^"]+)">([\s\S]*?)<\/file>/g;
  let match;
  const modifiedFiles: string[] = [];

  while ((match = filePattern.exec(implementation)) !== null) {
    const [, filePath, content] = match;
    
    // Request approval for each file write
    const approved = await this.requestPermission("write", filePath);
    if (!approved) {
      await this.say("text", `Skipped writing ${filePath} (not approved)`);
      continue;
    }

    // Write the file using Cline's existing file writing mechanism
    await this.writeFile(filePath, content.trim());
    await this.say("text", `Wrote ${filePath}`);
    modifiedFiles.push(filePath);
  }

  return modifiedFiles;
}
```

**Modify task initiation to check for architect mode:**

Find where tasks are initiated (likely `initiateTask`, `startTask`, or similar):

```typescript
async initiateTask(task: string): Promise<void> {
  if (this.architectConfig.enabled) {
    return this.runArchitectMode(task);
  }
  
  // Original task handling
  return this.originalInitiateTask(task);
}
```

---

## Part 8: UI Components

### 8.1 Find webview-ui/src/components/settings/ and add architect mode controls

Create or modify the settings component to include:

```tsx
// ArchitectModeSettings.tsx

import React from "react";
import { ArchitectConfig, DEFAULT_ARCHITECT_CONFIG } from "../../../../src/shared/architect-types";

interface Props {
  config: ArchitectConfig;
  onChange: (config: ArchitectConfig) => void;
}

export const ArchitectModeSettings: React.FC<Props> = ({ config, onChange }) => {
  const update = (partial: Partial<ArchitectConfig>) => {
    onChange({ ...config, ...partial });
  };

  return (
    <div className="architect-mode-settings">
      <h3>Architect Mode</h3>
      <p className="description">
        Two-model adversarial loop: Architect (with extended thinking) reasons and
        evaluates, Editor implements.
      </p>

      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={config.enabled}
          onChange={(e) => update({ enabled: e.target.checked })}
        />
        Enable Architect Mode
      </label>

      {config.enabled && (
        <>
          {/* Model Configuration */}
          <div className="section">
            <h4>Architect Model (Reasoning)</h4>
            <select
              value={config.architectProvider}
              onChange={(e) => update({ architectProvider: e.target.value })}
            >
              <option value="anthropic">Anthropic</option>
              <option value="openrouter">OpenRouter</option>
              <option value="bedrock">AWS Bedrock</option>
              <option value="vertex">GCP Vertex</option>
            </select>
            <input
              type="text"
              placeholder="claude-opus-4-5-20251101"
              value={config.architectModel}
              onChange={(e) => update({ architectModel: e.target.value })}
            />
          </div>

          <div className="section">
            <h4>Editor Model (Implementation)</h4>
            <select
              value={config.editorProvider}
              onChange={(e) => update({ editorProvider: e.target.value })}
            >
              <option value="anthropic">Anthropic</option>
              <option value="openrouter">OpenRouter</option>
              <option value="bedrock">AWS Bedrock</option>
              <option value="vertex">GCP Vertex</option>
            </select>
            <input
              type="text"
              placeholder="claude-sonnet-4-5-20250929"
              value={config.editorModel}
              onChange={(e) => update({ editorModel: e.target.value })}
            />
          </div>

          {/* Token Configuration */}
          <div className="section">
            <h4>Token Limits</h4>
            <label>
              Thinking Budget:
              <input
                type="text"
                placeholder="unlimited"
                value={config.thinkingBudget ?? ""}
                onChange={(e) => {
                  const val = e.target.value.trim();
                  update({ thinkingBudget: val === "" ? undefined : parseInt(val) });
                }}
              />
              <span className="hint">Leave empty for unlimited</span>
            </label>
            <label>
              Max Output Tokens:
              <input
                type="text"
                placeholder="model max"
                value={config.maxTokens ?? ""}
                onChange={(e) => {
                  const val = e.target.value.trim();
                  update({ maxTokens: val === "" ? undefined : parseInt(val) });
                }}
              />
              <span className="hint">Leave empty for model maximum</span>
            </label>
          </div>

          {/* Iteration Control */}
          <div className="section">
            <label>
              Max Iterations:
              <input
                type="number"
                min={1}
                max={10}
                value={config.maxIterations}
                onChange={(e) => update({ maxIterations: parseInt(e.target.value) })}
              />
            </label>
          </div>

          {/* Approval Oracle */}
          <div className="section">
            <h4>Approval Oracle</h4>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={config.approvalOracle?.enabled ?? false}
                onChange={(e) =>
                  update({
                    approvalOracle: {
                      ...config.approvalOracle,
                      enabled: e.target.checked,
                      showRoutineApprovals: config.approvalOracle?.showRoutineApprovals ?? false,
                      customAllowPatterns: config.approvalOracle?.customAllowPatterns ?? [],
                      customDenyPatterns: config.approvalOracle?.customDenyPatterns ?? [],
                    },
                  })
                }
              />
              Enable Approval Oracle (auto-approve safe actions)
            </label>
            {config.approvalOracle?.enabled && (
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={config.approvalOracle.showRoutineApprovals}
                  onChange={(e) =>
                    update({
                      approvalOracle: {
                        ...config.approvalOracle!,
                        showRoutineApprovals: e.target.checked,
                      },
                    })
                  }
                />
                Show routine approvals in output
              </label>
            )}
          </div>

          {/* Persona */}
          <div className="section">
            <h4>Persona</h4>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={config.persona?.enabled ?? false}
                onChange={(e) =>
                  update({
                    persona: {
                      ...config.persona,
                      enabled: e.target.checked,
                      markdown: config.persona?.markdown ?? "",
                      applyTo: config.persona?.applyTo ?? "both",
                      position: config.persona?.position ?? "prepend",
                    },
                  })
                }
              />
              Enable Custom Persona
            </label>
            {config.persona?.enabled && (
              <>
                <label>
                  Apply to:
                  <select
                    value={config.persona.applyTo}
                    onChange={(e) =>
                      update({
                        persona: {
                          ...config.persona!,
                          applyTo: e.target.value as any,
                        },
                      })
                    }
                  >
                    <option value="architect">Architect only</option>
                    <option value="editor">Editor only</option>
                    <option value="both">Both</option>
                  </select>
                </label>
                <label>
                  Position:
                  <select
                    value={config.persona.position}
                    onChange={(e) =>
                      update({
                        persona: {
                          ...config.persona!,
                          position: e.target.value as any,
                        },
                      })
                    }
                  >
                    <option value="prepend">Before system prompt</option>
                    <option value="append">After system prompt</option>
                  </select>
                </label>
                <label>
                  Persona (Markdown):
                  <textarea
                    rows={10}
                    placeholder="Paste your persona markdown here..."
                    value={config.persona.markdown}
                    onChange={(e) =>
                      update({
                        persona: {
                          ...config.persona!,
                          markdown: e.target.value,
                        },
                      })
                    }
                  />
                </label>
              </>
            )}
          </div>

          {/* Architecture */}
          <div className="section">
            <h4>Architecture Awareness</h4>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={config.architecture?.enabled ?? false}
                onChange={(e) =>
                  update({
                    architecture: {
                      ...config.architecture,
                      enabled: e.target.checked,
                      style: config.architecture?.style ?? "modular_monolith",
                      stage: config.architecture?.stage ?? "growth",
                      domains: config.architecture?.domains ?? [],
                      extractionSignals: config.architecture?.extractionSignals ?? {},
                      consolidationSignals: config.architecture?.consolidationSignals ?? {},
                      typesPath: config.architecture?.typesPath ?? ".cline/contracts/types.yaml",
                      contractsPath: config.architecture?.contractsPath ?? ".cline/contracts/services",
                    },
                  })
                }
              />
              Enable Architecture Analysis
            </label>
            {config.architecture?.enabled && (
              <>
                <label>
                  Style:
                  <select
                    value={config.architecture.style}
                    onChange={(e) =>
                      update({
                        architecture: {
                          ...config.architecture!,
                          style: e.target.value as any,
                        },
                      })
                    }
                  >
                    <option value="monolith">Monolith</option>
                    <option value="modular_monolith">Modular Monolith</option>
                    <option value="microservices">Microservices</option>
                    <option value="serverless">Serverless</option>
                  </select>
                </label>
                <label>
                  Stage:
                  <select
                    value={config.architecture.stage}
                    onChange={(e) =>
                      update({
                        architecture: {
                          ...config.architecture!,
                          stage: e.target.value as any,
                        },
                      })
                    }
                  >
                    <option value="mvp">MVP</option>
                    <option value="growth">Growth</option>
                    <option value="scale">Scale</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </label>
                <label>
                  Domains (comma-separated):
                  <input
                    type="text"
                    placeholder="clearance, enforcement, detection"
                    value={config.architecture.domains?.join(", ") ?? ""}
                    onChange={(e) =>
                      update({
                        architecture: {
                          ...config.architecture!,
                          domains: e.target.value.split(",").map((d) => d.trim()).filter(Boolean),
                        },
                      })
                    }
                  />
                </label>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};
```

### 8.2 Integrate into main settings

Find the main settings component (likely `ApiOptions.tsx` or `Settings.tsx`) and add:

```tsx
import { ArchitectModeSettings } from "./ArchitectModeSettings";

// In the render, add:
<ArchitectModeSettings
  config={apiConfiguration.architectMode || DEFAULT_ARCHITECT_CONFIG}
  onChange={(architectMode) => updateApiConfiguration({ architectMode })}
/>
```

---

## Part 9: Build and Install

```bash
cd cline-extended

# Build
npm run build

# Package
npm install -g @vscode/vsce
vsce package

# Install (VS Code)
code --install-extension cline-extended-*.vsix

# Install (Cursor)
cursor --install-extension cline-extended-*.vsix
```

---

## Part 10: Project Configuration Files

Create these in any project that uses Cline Extended:

### 10.1 .cline/llm-context.yaml (auto-managed)

This file is read on cold boot and written at session end. Machine-readable, not for humans.

```yaml
llm_context_version: 1

state:
  active_task: null
  blocked: []
  next_tasks: []
  git_branch: main
  last_session: null
  last_action: null

decisions: []

files:
  hot: []
  modified_this_session: []
  do_not_modify: []

tests:
  failing: []
  skipped: []

debt: []

architecture:
  style: modular_monolith
  stage: growth
  domains: []
  violations: []
  extraction_candidates: []

contracts:
  # service_name: current | stale
  
momentum:
  velocity: medium
  blockers_count: 0
  risk: null

session_notes: ""

human_context: {}
```

### 10.2 .cline/persona.md (example)
```markdown
# Staff Engineer

You have 15 years of experience across distributed systems, real-time data pipelines, and ML infrastructure.

## Communication
- Direct, no hedging
- Lead with conclusions
- Use concrete examples
- Challenge weak assumptions

## Technical Values
- Composition over inheritance
- Explicit over implicit
- Readability over cleverness
- Test at boundaries

## Review Lens
- Does this solve the root cause or a symptom?
- What breaks if this assumption is wrong?
- Where is complexity hiding?
```

### 10.2 .cline/contracts/types.yaml (example)
```yaml
types:
  RightsHolder:
    id: string
    display_name: string
    entity_type:
      enum: [individual, estate, corporation]

  Violation:
    id: string
    rights_holder_id: string
    platform_id: string
    detected_at: iso8601
    confidence: float
    
  LicenseOffer:
    id: string
    rights_holder_id: string
    price_cents: integer
    currency: iso4217
    duration_seconds: integer

naming_conventions:
  case: snake_case
  ids: "{entity}_id"
  timestamps: "*_at as iso8601"
  money: "*_cents as integer"
```

### 10.3 .cline/contracts/services/clearance.yaml (example)
```yaml
service: clearance
status: implementation

types_used:
  - RightsHolder
  - Violation
  - LicenseOffer

messages:
  ClearanceRequest:
    prompt: string
    platform_id: string
    timestamp: iso8601
    
  ClearanceResponse:
    cleared: boolean
    violations: array<Violation>
    license_options: array<LicenseOffer>

endpoints:
  - method: POST
    path: /v1/check
    request: ClearanceRequest
    response: ClearanceResponse
    latency_p99_ms: 200

invariants:
  - "cleared=true implies violations is empty"
  - "response_time_p99 < 200ms"
```

### 10.4 .cline/architecture.yaml (example)
```yaml
stage: growth
style: modular_monolith

domains:
  - clearance
  - enforcement
  - detection
  - registry
  - platform
  - billing

extraction_signals:
  file_lines: 500
  directory_files: 15
  mixed_domains: true

extraction_candidates:
  detection:
    trigger: independent_scaling
    notes: "Embedding computation is GPU-bound"
  platform:
    trigger: independent_deployment
    notes: "Each platform ships independently"
```

---

## Verification Checklist

After installation:

1. [ ] Extension appears as "Cline Extended" in sidebar
2. [ ] Settings show Architect Mode toggle
3. [ ] With Architect Mode OFF, behaves like standard Cline
4. [ ] With Architect Mode ON:
   - [ ] Shows Architect and Editor model selectors
   - [ ] Thinking budget field accepts empty (unlimited)
   - [ ] Max tokens field accepts empty (model max)
   - [ ] Approval Oracle toggle works
   - [ ] Persona textarea appears when enabled
   - [ ] Architecture section shows style/stage/domains
5. [ ] Task execution shows: planning → implementing → evaluating flow
6. [ ] Extended thinking content visible in UI
7. [ ] Approval Oracle auto-approves safe patterns without prompting
8. [ ] Ambiguous approvals invoke Opus and cache decision
9. [ ] Dangerous patterns are blocked
10. [ ] Architecture warnings appear when thresholds crossed
11. [ ] Persona affects model behavior when enabled

---

## Known Integration Points to Find

Cline's codebase may have changed. Search for these patterns to find integration points:

- `askPermission` / `requestPermission` / `askUser` - approval flow
- `createMessage` / `streamMessage` - API calls
- `ApiHandler` / `buildApiHandler` - handler factory
- `say` / `addMessage` - UI output
- `writeFile` / `createFile` - file operations
- Settings state management (likely React context or VS Code configuration)

---

## End of Spec

Pass this entire document to Cursor. It has everything needed to build Cline Extended.
