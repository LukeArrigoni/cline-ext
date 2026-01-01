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
