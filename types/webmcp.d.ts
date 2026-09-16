interface WebMcpToolDefinition {
  name: string
  title?: string
  description: string
  inputSchema: Record<string, unknown>
  annotations?: {
    readOnlyHint?: boolean
    untrustedContentHint?: boolean
  }
  execute(input: unknown): unknown | Promise<unknown>
}

interface ModelContext {
  registerTool(
    tool: WebMcpToolDefinition,
    options?: { signal?: AbortSignal },
  ): void | Promise<void>
}

interface Document {
  readonly modelContext?: ModelContext
}
