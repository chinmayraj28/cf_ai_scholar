// NOTE: RESEARCH_WORKFLOW class has been moved to worker.ts
// This file is kept for type definitions and exports only
// The actual workflow class must be in the same file as the worker to avoid the
// "worker is not an actor but class name was requested" error

export interface WorkflowContext {
  query: string;
  sessionId: string;
}

export interface Env {
  AI: Ai;
  RESEARCH_CACHE: KVNamespace;
}

// Types are already exported above, no need to re-export
