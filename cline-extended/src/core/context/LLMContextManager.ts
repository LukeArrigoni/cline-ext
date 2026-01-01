import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { LLMContext } from "../../shared/architect-types";

/**
 * Manages LLM context persistence for cold boot recovery
 */
export class LLMContextManager {
  private workspaceRoot: string;
  private context: LLMContext = {};
  private contextPath: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.contextPath = path.join(workspaceRoot, ".cline", "llm-context.yaml");
  }

  /**
   * Load LLM context from file
   * Returns the context wrapped in XML tags for injection into prompts
   */
  async load(): Promise<string> {
    const locations = [
      path.join(this.workspaceRoot, ".cline", "llm-context.yaml"),
      path.join(this.workspaceRoot, ".cline", "llm-context.md"),
      path.join(this.workspaceRoot, "llm-context.yaml"),
      path.join(this.workspaceRoot, "llm-context.md"),
    ];

    for (const loc of locations) {
      if (fs.existsSync(loc)) {
        try {
          const content = fs.readFileSync(loc, "utf-8");
          if (loc.endsWith(".yaml") || loc.endsWith(".yml")) {
            this.context = yaml.load(content) as LLMContext;
            this.contextPath = loc;
          }
          return `<llm_context>\n${content}\n</llm_context>`;
        } catch (e) {
          console.error("Failed to load llm-context:", e);
        }
      }
    }

    return "";
  }

  /**
   * Save LLM context updates
   */
  async save(updates: {
    lastAction?: string;
    activeTask?: string | null;
    modifiedFiles?: string[];
    sessionNotes?: string;
    decisions?: Array<{ date: string; decision: string; rationale?: string }>;
  }): Promise<void> {
    // Ensure directory exists
    const dir = path.dirname(this.contextPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Load existing if exists
    let existing: LLMContext = this.context;
    if (fs.existsSync(this.contextPath)) {
      try {
        existing = yaml.load(fs.readFileSync(this.contextPath, "utf-8")) as LLMContext;
      } catch {
        // Start fresh if parse fails
      }
    }

    // Merge updates
    const updated: LLMContext = {
      ...existing,
      llm_context_version: 1,
      state: {
        ...existing.state,
        last_session: new Date().toISOString(),
        last_action: updates.lastAction || existing.state?.last_action,
        active_task: updates.activeTask !== undefined ? updates.activeTask : existing.state?.active_task,
      },
      files: {
        ...existing.files,
        modified_this_session: updates.modifiedFiles || [],
      },
      session_notes: updates.sessionNotes || existing.session_notes,
    };

    // Append new decisions if provided
    if (updates.decisions && updates.decisions.length > 0) {
      updated.decisions = [...(existing.decisions || []), ...updates.decisions];
      // Keep only last 20 decisions
      if (updated.decisions.length > 20) {
        updated.decisions = updated.decisions.slice(-20);
      }
    }

    // Write with nice formatting
    fs.writeFileSync(this.contextPath, yaml.dump(updated, { lineWidth: -1 }));
    this.context = updated;
  }

  /**
   * Get the current context object
   */
  getContext(): LLMContext {
    return { ...this.context };
  }

  /**
   * Update a specific field in context
   */
  updateField<K extends keyof LLMContext>(key: K, value: LLMContext[K]): void {
    this.context[key] = value;
  }

  /**
   * Mark a task as blocked
   */
  addBlocker(task: string, reason: string): void {
    if (!this.context.state) {
      this.context.state = {};
    }
    if (!this.context.state.blocked) {
      this.context.state.blocked = [];
    }
    this.context.state.blocked.push({ task, reason });
  }

  /**
   * Remove a blocker
   */
  removeBlocker(task: string): void {
    if (this.context.state?.blocked) {
      this.context.state.blocked = this.context.state.blocked.filter((b) => b.task !== task);
    }
  }

  /**
   * Add a file to the hot files list
   */
  addHotFile(filePath: string): void {
    if (!this.context.files) {
      this.context.files = {};
    }
    if (!this.context.files.hot) {
      this.context.files.hot = [];
    }
    if (!this.context.files.hot.includes(filePath)) {
      this.context.files.hot.push(filePath);
      // Keep only last 10 hot files
      if (this.context.files.hot.length > 10) {
        this.context.files.hot = this.context.files.hot.slice(-10);
      }
    }
  }

  /**
   * Record a decision
   */
  addDecision(decision: string, rationale?: string): void {
    if (!this.context.decisions) {
      this.context.decisions = [];
    }
    this.context.decisions.push({
      date: new Date().toISOString().split("T")[0],
      decision,
      rationale,
    });
  }

  /**
   * Add technical debt marker
   */
  addDebt(file: string, line: number, type: "TODO" | "HACK" | "FIXME", note: string): void {
    if (!this.context.debt) {
      this.context.debt = [];
    }
    this.context.debt.push({ file, line, type, note });
  }

  /**
   * Update momentum indicators
   */
  updateMomentum(velocity: "low" | "medium" | "high", risk?: string): void {
    if (!this.context.momentum) {
      this.context.momentum = {};
    }
    this.context.momentum.velocity = velocity;
    this.context.momentum.risk = risk || null;
    this.context.momentum.blockers_count = this.context.state?.blocked?.length || 0;
  }

  /**
   * Create initial context file if it doesn't exist
   */
  async initializeIfNeeded(): Promise<void> {
    if (!fs.existsSync(this.contextPath)) {
      const initial: LLMContext = {
        llm_context_version: 1,
        state: {
          active_task: null,
          blocked: [],
          next_tasks: [],
          git_branch: undefined,
          last_session: undefined,
          last_action: undefined,
        },
        decisions: [],
        files: {
          hot: [],
          modified_this_session: [],
          do_not_modify: [],
        },
        tests: {
          failing: [],
          skipped: [],
        },
        debt: [],
        momentum: {
          velocity: "medium",
          blockers_count: 0,
          risk: null,
        },
        session_notes: "",
        human_context: {},
      };

      // Ensure directory exists
      const dir = path.dirname(this.contextPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(this.contextPath, yaml.dump(initial, { lineWidth: -1 }));
      this.context = initial;
    }
  }
}
