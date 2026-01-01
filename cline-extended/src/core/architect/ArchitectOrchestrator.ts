import { ApiHandler, buildApiHandler } from "../api";
import { PersonaLoader } from "../persona/PersonaLoader";
import { ApprovalOracle } from "../approval/ApprovalOracle";
import { ArchitectureAnalyzer } from "../architecture/ArchitectureAnalyzer";
import {
  ArchitectConfig,
  ArchitectState,
  ArchitectUpdate,
  ApprovalDecision,
} from "../../shared/architect-types";
import { ApiConfiguration } from "@shared/api";
import { ClineStorageMessage } from "../../shared/messages/content";

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
    apiConfig: ApiConfiguration,
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
    // Create modified configurations for each role
    const architectApiConfig: ApiConfiguration = {
      ...apiConfig,
      planModeApiProvider: config.architectProvider as any,
      actModeApiProvider: config.architectProvider as any,
      planModeApiModelId: config.architectModel,
      actModeApiModelId: config.architectModel,
      planModeThinkingBudgetTokens: config.thinkingBudget,
      actModeThinkingBudgetTokens: config.thinkingBudget,
    };

    const editorApiConfig: ApiConfiguration = {
      ...apiConfig,
      planModeApiProvider: config.editorProvider as any,
      actModeApiProvider: config.editorProvider as any,
      planModeApiModelId: config.editorModel,
      actModeApiModelId: config.editorModel,
    };

    this.architectHandler = buildApiHandler(architectApiConfig, "plan");
    this.editorHandler = buildApiHandler(editorApiConfig, "act");

    // Initialize ApprovalOracle if enabled
    if (config.approvalOracle?.enabled && apiKey) {
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

    const messages: ClineStorageMessage[] = [
      {
        role: "user" as const,
        content: `Context:\n${context}\n\nTask:\n${task}\n\nProvide your implementation plan.`,
      },
    ];

    const response = await this.collectStreamResponse(
      this.architectHandler,
      systemPrompt,
      messages
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

    const messages: ClineStorageMessage[] = [
      {
        role: "user" as const,
        content: `Context:\n${context}\n\n---\n\nArchitect's Plan:\n${plan}\n\nImplement this plan now.`,
      },
    ];

    const response = await this.collectStreamResponse(
      this.editorHandler,
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

    const messages: ClineStorageMessage[] = [
      {
        role: "user" as const,
        content: `Original Task:\n${task}\n\n---\n\nPlan:\n${plan}\n\n---\n\nImplementation:\n${implementation}\n\n---\n\nContext:\n${context}\n\nEvaluate the implementation.`,
      },
    ];

    const response = await this.collectStreamResponse(
      this.architectHandler,
      systemPrompt,
      messages
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

  private async collectStreamResponse(
    handler: ApiHandler,
    systemPrompt: string,
    messages: ClineStorageMessage[]
  ): Promise<any> {
    const stream = handler.createMessage(systemPrompt, messages);
    const blocks: any[] = [];

    for await (const chunk of stream) {
      if (chunk.type === "text") {
        // Collect text blocks
        blocks.push({ type: "text", text: chunk.text });
      } else if (chunk.type === "reasoning") {
        // Collect reasoning/thinking blocks
        blocks.push({ type: "thinking", thinking: chunk.reasoning });
      }
    }

    return { content: blocks };
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
