import { VSCodeCheckbox, VSCodeDropdown, VSCodeOption, VSCodeTextField } from "@vscode/webview-ui-toolkit/react"
import { memo, useState } from "react"
import Section from "../Section"

interface ArchitectModeSectionProps {
	renderSectionHeader: (tabId: string) => JSX.Element | null
}

// Type for Architect Mode configuration
interface ArchitectModeConfig {
	enabled: boolean
	architectModel: string
	architectProvider: string
	editorModel: string
	editorProvider: string
	thinkingBudget: number | undefined
	maxTokens: number | undefined
	maxIterations: number
	persona: {
		enabled: boolean
		markdown: string
		applyTo: "architect" | "editor" | "both"
		position: "prepend" | "append"
	}
	approvalOracle: {
		enabled: boolean
		showRoutineApprovals: boolean
		customAllowPatterns: string[]
		customDenyPatterns: string[]
	}
	architecture: {
		enabled: boolean
		style: "monolith" | "modular_monolith" | "microservices" | "serverless"
		stage: "mvp" | "growth" | "scale" | "enterprise"
		domains: string[]
		extractionSignals: Record<string, unknown>
		consolidationSignals: Record<string, unknown>
		typesPath: string
		contractsPath: string
	}
}

// Default configuration for Architect Mode
const DEFAULT_ARCHITECT_CONFIG: ArchitectModeConfig = {
	enabled: false,
	architectModel: "claude-opus-4-5-20251101",
	architectProvider: "anthropic",
	editorModel: "claude-sonnet-4-5-20250929",
	editorProvider: "anthropic",
	thinkingBudget: undefined,
	maxTokens: undefined,
	maxIterations: 5,
	persona: {
		enabled: false,
		markdown: "",
		applyTo: "both",
		position: "prepend",
	},
	approvalOracle: {
		enabled: true,
		showRoutineApprovals: false,
		customAllowPatterns: [],
		customDenyPatterns: [],
	},
	architecture: {
		enabled: false,
		style: "modular_monolith",
		stage: "growth",
		domains: [],
		extractionSignals: {},
		consolidationSignals: {},
		typesPath: ".cline/contracts/types.yaml",
		contractsPath: ".cline/contracts/services",
	},
}

const ArchitectModeSection = ({ renderSectionHeader }: ArchitectModeSectionProps) => {
	// Use local state - in a full implementation this would be wired to extension state via proto
	const [config, setConfig] = useState(DEFAULT_ARCHITECT_CONFIG)

	const update = (partial: Partial<typeof config>) => {
		const newConfig = { ...config, ...partial }
		setConfig(newConfig)
		// TODO: Wire to extension state via proto when architectModeConfig is added to UpdateSettingsRequest
		console.log("Architect Mode config updated:", newConfig)
	}

	return (
		<div>
			{renderSectionHeader("architect")}
			<Section>
				<div style={{ marginBottom: 20 }}>
					{/* Main Enable Toggle */}
					<div
						className="relative p-3 mb-3 rounded-md"
						style={{
							border: "1px solid var(--vscode-widget-border)",
							backgroundColor: "var(--vscode-list-hoverBackground)",
						}}>
						<div
							className="absolute -top-2 -right-2 px-2 py-0.5 rounded text-xs font-semibold"
							style={{
								backgroundColor: "var(--vscode-button-secondaryBackground)",
								color: "var(--vscode-button-secondaryForeground)",
							}}>
							EXTENDED
						</div>

						<VSCodeCheckbox
							checked={config.enabled}
							onChange={(e: any) => update({ enabled: e.target.checked })}>
							<span className="font-semibold">Enable Architect Mode</span>
						</VSCodeCheckbox>
						<p className="text-xs mt-1 mb-0 text-description">
							Two-model adversarial loop: Architect (with extended thinking) reasons and evaluates, Editor
							implements. Enables deeper reasoning and iterative refinement.
						</p>
					</div>

					{config.enabled && (
						<>
							{/* Architect Model Configuration */}
							<div className="mt-4 p-3 rounded-md" style={{ border: "1px solid var(--vscode-widget-border)" }}>
								<h4 className="text-sm font-medium mb-2">Architect Model (Reasoning)</h4>
								<div className="mb-2">
									<label className="block text-xs mb-1">Provider</label>
									<VSCodeDropdown
										className="w-full"
										currentValue={config.architectProvider}
										onChange={(e: any) => update({ architectProvider: e.target.currentValue })}>
										<VSCodeOption value="anthropic">Anthropic</VSCodeOption>
										<VSCodeOption value="openrouter">OpenRouter</VSCodeOption>
										<VSCodeOption value="bedrock">AWS Bedrock</VSCodeOption>
										<VSCodeOption value="vertex">GCP Vertex</VSCodeOption>
									</VSCodeDropdown>
								</div>
								<div>
									<label className="block text-xs mb-1">Model ID</label>
									<VSCodeTextField
										className="w-full"
										placeholder="claude-opus-4-5-20251101"
										value={config.architectModel}
										onChange={(e: any) => update({ architectModel: e.target.value })}
									/>
								</div>
							</div>

							{/* Editor Model Configuration */}
							<div className="mt-3 p-3 rounded-md" style={{ border: "1px solid var(--vscode-widget-border)" }}>
								<h4 className="text-sm font-medium mb-2">Editor Model (Implementation)</h4>
								<div className="mb-2">
									<label className="block text-xs mb-1">Provider</label>
									<VSCodeDropdown
										className="w-full"
										currentValue={config.editorProvider}
										onChange={(e: any) => update({ editorProvider: e.target.currentValue })}>
										<VSCodeOption value="anthropic">Anthropic</VSCodeOption>
										<VSCodeOption value="openrouter">OpenRouter</VSCodeOption>
										<VSCodeOption value="bedrock">AWS Bedrock</VSCodeOption>
										<VSCodeOption value="vertex">GCP Vertex</VSCodeOption>
									</VSCodeDropdown>
								</div>
								<div>
									<label className="block text-xs mb-1">Model ID</label>
									<VSCodeTextField
										className="w-full"
										placeholder="claude-sonnet-4-5-20250929"
										value={config.editorModel}
										onChange={(e: any) => update({ editorModel: e.target.value })}
									/>
								</div>
							</div>

							{/* Token Configuration */}
							<div className="mt-3 p-3 rounded-md" style={{ border: "1px solid var(--vscode-widget-border)" }}>
								<h4 className="text-sm font-medium mb-2">Token Limits</h4>
								<div className="mb-2">
									<label className="block text-xs mb-1">Thinking Budget</label>
									<VSCodeTextField
										className="w-32"
										placeholder="unlimited"
										value={config.thinkingBudget?.toString() ?? ""}
										onChange={(e: any) => {
											const val = e.target.value.trim()
											update({ thinkingBudget: val === "" ? undefined : parseInt(val) })
										}}
									/>
									<p className="text-xs text-description mt-1">Leave empty for unlimited</p>
								</div>
								<div className="mb-2">
									<label className="block text-xs mb-1">Max Output Tokens</label>
									<VSCodeTextField
										className="w-32"
										placeholder="model max"
										value={config.maxTokens?.toString() ?? ""}
										onChange={(e: any) => {
											const val = e.target.value.trim()
											update({ maxTokens: val === "" ? undefined : parseInt(val) })
										}}
									/>
									<p className="text-xs text-description mt-1">Leave empty for model maximum</p>
								</div>
								<div>
									<label className="block text-xs mb-1">Max Iterations (1-10)</label>
									<VSCodeTextField
										className="w-20"
										value={String(config.maxIterations)}
										onChange={(e: any) => {
											const val = parseInt(e.target.value) || 5
											update({ maxIterations: Math.max(1, Math.min(10, val)) })
										}}
									/>
								</div>
							</div>

							{/* Approval Oracle */}
							<div className="mt-3 p-3 rounded-md" style={{ border: "1px solid var(--vscode-widget-border)" }}>
								<h4 className="text-sm font-medium mb-2">Approval Oracle</h4>
								<VSCodeCheckbox
									checked={config.approvalOracle?.enabled ?? false}
									onChange={(e: any) =>
										update({
											approvalOracle: {
												...config.approvalOracle,
												enabled: e.target.checked,
											},
										})
									}>
									Enable Approval Oracle
								</VSCodeCheckbox>
								<p className="text-xs text-description mt-1">
									Auto-approve safe actions using pattern matching. Falls back to Opus for ambiguous cases.
								</p>

								{config.approvalOracle?.enabled && (
									<div className="mt-2 ml-4">
										<VSCodeCheckbox
											checked={config.approvalOracle?.showRoutineApprovals ?? false}
											onChange={(e: any) =>
												update({
													approvalOracle: {
														...config.approvalOracle,
														showRoutineApprovals: e.target.checked,
													},
												})
											}>
											Show routine approvals in output
										</VSCodeCheckbox>
									</div>
								)}
							</div>

							{/* Persona Configuration */}
							<div className="mt-3 p-3 rounded-md" style={{ border: "1px solid var(--vscode-widget-border)" }}>
								<h4 className="text-sm font-medium mb-2">Persona</h4>
								<VSCodeCheckbox
									checked={config.persona?.enabled ?? false}
									onChange={(e: any) =>
										update({
											persona: {
												...config.persona,
												enabled: e.target.checked,
											},
										})
									}>
									Enable Custom Persona
								</VSCodeCheckbox>
								<p className="text-xs text-description mt-1">
									Inject a custom persona into the system prompt to influence model behavior.
								</p>

								{config.persona?.enabled && (
									<div className="mt-3 ml-0">
										<div className="mb-2">
											<label className="block text-xs mb-1">Apply to</label>
											<VSCodeDropdown
												className="w-full"
												currentValue={config.persona?.applyTo ?? "both"}
												onChange={(e: any) =>
													update({
														persona: {
															...config.persona,
															applyTo: e.target.currentValue,
														},
													})
												}>
												<VSCodeOption value="architect">Architect only</VSCodeOption>
												<VSCodeOption value="editor">Editor only</VSCodeOption>
												<VSCodeOption value="both">Both</VSCodeOption>
											</VSCodeDropdown>
										</div>
										<div className="mb-2">
											<label className="block text-xs mb-1">Position</label>
											<VSCodeDropdown
												className="w-full"
												currentValue={config.persona?.position ?? "prepend"}
												onChange={(e: any) =>
													update({
														persona: {
															...config.persona,
															position: e.target.currentValue,
														},
													})
												}>
												<VSCodeOption value="prepend">Before system prompt</VSCodeOption>
												<VSCodeOption value="append">After system prompt</VSCodeOption>
											</VSCodeDropdown>
										</div>
										<div>
											<label className="block text-xs mb-1">Persona (Markdown)</label>
											<textarea
												className="w-full h-32 p-2 text-xs rounded"
												placeholder="Paste your persona markdown here..."
												value={config.persona?.markdown ?? ""}
												onChange={(e) =>
													update({
														persona: {
															...config.persona,
															markdown: e.target.value,
														},
													})
												}
												style={{
													backgroundColor: "var(--vscode-input-background)",
													color: "var(--vscode-input-foreground)",
													border: "1px solid var(--vscode-input-border)",
												}}
											/>
										</div>
									</div>
								)}
							</div>

							{/* Architecture Configuration */}
							<div className="mt-3 p-3 rounded-md" style={{ border: "1px solid var(--vscode-widget-border)" }}>
								<h4 className="text-sm font-medium mb-2">Architecture Awareness</h4>
								<VSCodeCheckbox
									checked={config.architecture?.enabled ?? false}
									onChange={(e: any) =>
										update({
											architecture: {
												...config.architecture,
												enabled: e.target.checked,
											},
										})
									}>
									Enable Architecture Analysis
								</VSCodeCheckbox>
								<p className="text-xs text-description mt-1">
									Analyze code changes for architectural concerns based on types.yaml and service contracts.
								</p>

								{config.architecture?.enabled && (
									<div className="mt-3">
										<div className="mb-2">
											<label className="block text-xs mb-1">Style</label>
											<VSCodeDropdown
												className="w-full"
												currentValue={config.architecture?.style ?? "modular_monolith"}
												onChange={(e: any) =>
													update({
														architecture: {
															...config.architecture,
															style: e.target.currentValue,
														},
													})
												}>
												<VSCodeOption value="monolith">Monolith</VSCodeOption>
												<VSCodeOption value="modular_monolith">Modular Monolith</VSCodeOption>
												<VSCodeOption value="microservices">Microservices</VSCodeOption>
												<VSCodeOption value="serverless">Serverless</VSCodeOption>
											</VSCodeDropdown>
										</div>
										<div className="mb-2">
											<label className="block text-xs mb-1">Stage</label>
											<VSCodeDropdown
												className="w-full"
												currentValue={config.architecture?.stage ?? "growth"}
												onChange={(e: any) =>
													update({
														architecture: {
															...config.architecture,
															stage: e.target.currentValue,
														},
													})
												}>
												<VSCodeOption value="mvp">MVP</VSCodeOption>
												<VSCodeOption value="growth">Growth</VSCodeOption>
												<VSCodeOption value="scale">Scale</VSCodeOption>
												<VSCodeOption value="enterprise">Enterprise</VSCodeOption>
											</VSCodeDropdown>
										</div>
										<div>
											<label className="block text-xs mb-1">Domains (comma-separated)</label>
											<VSCodeTextField
												className="w-full"
												placeholder="clearance, enforcement, detection"
												value={config.architecture?.domains?.join(", ") ?? ""}
												onChange={(e: any) =>
													update({
														architecture: {
															...config.architecture,
															domains: e.target.value
																.split(",")
																.map((d: string) => d.trim())
																.filter(Boolean),
														},
													})
												}
											/>
										</div>
									</div>
								)}
							</div>
						</>
					)}
				</div>
			</Section>
		</div>
	)
}

export default memo(ArchitectModeSection)
