import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { ArchitectureConfig } from "../../shared/architect-types";

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
    const fileDomain = this.config.domains.find((d) => filePath.includes(`/${d}/`) || filePath.includes(`\\${d}\\`));
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
