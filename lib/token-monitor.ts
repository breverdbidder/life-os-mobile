/**
 * Life OS Token Monitor & Checkpoint System
 * 
 * Tracks token usage, auto-checkpoints before limits, enables session resume.
 * Zero third-party exposure - only Anthropic API + your Supabase.
 */

import { v4 as uuidv4 } from 'uuid';

// Claude model context limits (conservative estimates for safety margin)
const MODEL_LIMITS: Record<string, number> = {
  'claude-sonnet-4-20250514': 180000,
  'claude-opus-4-5-20251101': 180000,
  'claude-3-5-sonnet-20241022': 180000,
  'default': 150000,
};

// Checkpoint threshold - save when 70% of context used
const CHECKPOINT_THRESHOLD = 0.70;

// Warning threshold - alert user at 85%
const WARNING_THRESHOLD = 0.85;

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  percentUsed: number;
  model: string;
}

export interface SessionCheckpoint {
  id: string;
  sessionId: string;
  timestamp: string;
  taskDescription: string;
  completedSteps: string[];
  currentStep: string;
  nextSteps: string[];
  messages: Message[];
  tokenUsage: TokenUsage;
  contextVariables: Record<string, any>;
  status: 'active' | 'completed' | 'abandoned';
  continuationPrompt: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  tokens?: number;
}

export interface SessionState {
  sessionId: string;
  messages: Message[];
  tokenUsage: TokenUsage;
  checkpoints: SessionCheckpoint[];
  toolCallCount: number;
  lastCheckpoint: string | null;
  status: 'active' | 'warning' | 'critical';
}

/**
 * Estimate token count for a string (rough approximation)
 * ~4 characters per token for English text
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Calculate total token usage for a session
 */
export function calculateTokenUsage(messages: Message[], model: string): TokenUsage {
  const limit = MODEL_LIMITS[model] || MODEL_LIMITS.default;
  
  let inputTokens = 0;
  let outputTokens = 0;
  
  messages.forEach(msg => {
    const tokens = msg.tokens || estimateTokens(msg.content);
    if (msg.role === 'user') {
      inputTokens += tokens;
    } else {
      outputTokens += tokens;
    }
  });
  
  const totalTokens = inputTokens + outputTokens;
  const percentUsed = totalTokens / limit;
  
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    percentUsed,
    model,
  };
}

/**
 * Check if checkpoint is needed based on token usage
 */
export function needsCheckpoint(tokenUsage: TokenUsage): boolean {
  return tokenUsage.percentUsed >= CHECKPOINT_THRESHOLD;
}

/**
 * Check if at critical token level
 */
export function isCritical(tokenUsage: TokenUsage): boolean {
  return tokenUsage.percentUsed >= WARNING_THRESHOLD;
}

/**
 * Get session status based on token usage
 */
export function getSessionStatus(tokenUsage: TokenUsage): 'active' | 'warning' | 'critical' {
  if (tokenUsage.percentUsed >= WARNING_THRESHOLD) return 'critical';
  if (tokenUsage.percentUsed >= CHECKPOINT_THRESHOLD) return 'warning';
  return 'active';
}

/**
 * Create a new session state
 */
export function createSession(model: string = 'claude-sonnet-4-20250514'): SessionState {
  return {
    sessionId: uuidv4(),
    messages: [],
    tokenUsage: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      percentUsed: 0,
      model,
    },
    checkpoints: [],
    toolCallCount: 0,
    lastCheckpoint: null,
    status: 'active',
  };
}

/**
 * Generate continuation prompt for resuming session
 */
export function generateContinuationPrompt(checkpoint: SessionCheckpoint): string {
  const recentMessages = checkpoint.messages.slice(-5);
  const messagesSummary = recentMessages
    .map(m => `${m.role.toUpperCase()}: ${m.content.slice(0, 200)}...`)
    .join('\n');
  
  return `## SESSION RESUME - ${checkpoint.id}

**Task:** ${checkpoint.taskDescription}

### Progress
**Completed:**
${checkpoint.completedSteps.map(s => `- ✅ ${s}`).join('\n')}

**Current:** ${checkpoint.currentStep}

**Next Steps:**
${checkpoint.nextSteps.map(s => `- ⏳ ${s}`).join('\n')}

### Recent Context
${messagesSummary}

### Variables
${JSON.stringify(checkpoint.contextVariables, null, 2)}

**INSTRUCTION:** Continue from "${checkpoint.currentStep}" immediately. No confirmation needed.`;
}

/**
 * Create checkpoint from current session state
 */
export function createCheckpoint(
  session: SessionState,
  taskDescription: string,
  completedSteps: string[],
  currentStep: string,
  nextSteps: string[],
  contextVariables: Record<string, any> = {}
): SessionCheckpoint {
  const checkpoint: SessionCheckpoint = {
    id: uuidv4(),
    sessionId: session.sessionId,
    timestamp: new Date().toISOString(),
    taskDescription,
    completedSteps,
    currentStep,
    nextSteps,
    messages: session.messages,
    tokenUsage: session.tokenUsage,
    contextVariables,
    status: 'active',
    continuationPrompt: '',
  };
  
  checkpoint.continuationPrompt = generateContinuationPrompt(checkpoint);
  
  return checkpoint;
}

/**
 * Format token usage for display
 */
export function formatTokenUsage(usage: TokenUsage): string {
  const limit = MODEL_LIMITS[usage.model] || MODEL_LIMITS.default;
  const percent = Math.round(usage.percentUsed * 100);
  return `${usage.totalTokens.toLocaleString()} / ${limit.toLocaleString()} (${percent}%)`;
}

/**
 * Get progress bar segments for UI
 */
export function getProgressSegments(percentUsed: number): { safe: number; warning: number; critical: number } {
  const safe = Math.min(percentUsed, CHECKPOINT_THRESHOLD) / CHECKPOINT_THRESHOLD * 100;
  const warning = percentUsed > CHECKPOINT_THRESHOLD 
    ? Math.min((percentUsed - CHECKPOINT_THRESHOLD) / (WARNING_THRESHOLD - CHECKPOINT_THRESHOLD), 1) * 100 
    : 0;
  const critical = percentUsed > WARNING_THRESHOLD 
    ? Math.min((percentUsed - WARNING_THRESHOLD) / (1 - WARNING_THRESHOLD), 1) * 100 
    : 0;
  
  return { safe, warning, critical };
}
