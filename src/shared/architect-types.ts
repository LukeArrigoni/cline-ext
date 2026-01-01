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

// ============================================
// LLM CONTEXT
// ============================================

export interface LLMContext {
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
