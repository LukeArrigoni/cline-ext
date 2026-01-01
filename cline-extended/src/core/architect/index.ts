/**
 * Architect Mode - Two-model adversarial loop with extended thinking
 *
 * This module provides:
 * - ArchitectOrchestrator: Main orchestrator for the architect/editor loop
 * - ApprovalOracle: Intelligent action approval system
 * - PersonaLoader: Custom persona injection
 * - ArchitectureAnalyzer: Codebase architecture analysis
 * - LLMContextManager: Session context persistence
 */

export { ArchitectOrchestrator } from "./ArchitectOrchestrator";
export { ApprovalOracle } from "../approval/ApprovalOracle";
export { PersonaLoader } from "../persona/PersonaLoader";
export { ArchitectureAnalyzer } from "../architecture/ArchitectureAnalyzer";
export { LLMContextManager } from "../context/LLMContextManager";

// Re-export types
export type {
  ArchitectConfig,
  ArchitectState,
  ArchitectUpdate,
  ApprovalRequest,
  ApprovalDecision,
  ApprovalOracleConfig,
  PersonaConfig,
  ArchitectureConfig,
  LLMContext,
} from "../../shared/architect-types";
