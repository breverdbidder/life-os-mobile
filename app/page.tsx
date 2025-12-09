'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';

// Types
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  tokens?: number;
}

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  percentUsed: number;
}

interface Checkpoint {
  id: string;
  sessionId: string;
  taskDescription: string;
  completedSteps: string[];
  currentStep: string;
  nextSteps: string[];
  messages: Message[];
  tokenUsage: TokenUsage;
  continuationPrompt: string;
  status: string;
}

// Constants
const MODEL_LIMIT = 180000;
const CHECKPOINT_THRESHOLD = 0.70;
const WARNING_THRESHOLD = 0.85;

export default function LifeOSChat() {
  // State
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [tokenUsage, setTokenUsage] = useState<TokenUsage>({
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    percentUsed: 0,
  });
  const [showCheckpointModal, setShowCheckpointModal] = useState(false);
  const [activeCheckpoint, setActiveCheckpoint] = useState<Checkpoint | null>(null);
  const [checkpointTask, setCheckpointTask] = useState('');
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Initialize session
  useEffect(() => {
    const initSession = async () => {
      // Check for active checkpoint
      try {
        const res = await fetch('/api/checkpoint?active=true');
        const checkpoint = await res.json();
        if (checkpoint && checkpoint.status === 'active') {
          setActiveCheckpoint(checkpoint);
          setShowResumePrompt(true);
        }
      } catch (e) {
        console.log('No active checkpoint');
      }
      
      setSessionId(uuidv4());
    };
    
    initSession();
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Token estimation
  const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

  // Update token usage
  const updateTokenUsage = useCallback((newInputTokens: number, newOutputTokens: number) => {
    setTokenUsage(prev => {
      const totalTokens = prev.totalTokens + newInputTokens + newOutputTokens;
      return {
        inputTokens: prev.inputTokens + newInputTokens,
        outputTokens: prev.outputTokens + newOutputTokens,
        totalTokens,
        percentUsed: totalTokens / MODEL_LIMIT,
      };
    });
  }, []);

  // Check if checkpoint needed
  useEffect(() => {
    if (tokenUsage.percentUsed >= CHECKPOINT_THRESHOLD && !showCheckpointModal) {
      // Auto-prompt for checkpoint
      if (tokenUsage.percentUsed >= WARNING_THRESHOLD) {
        setShowCheckpointModal(true);
      }
    }
  }, [tokenUsage.percentUsed, showCheckpointModal]);

  // Resume from checkpoint
  const handleResume = async () => {
    if (!activeCheckpoint) return;
    
    setMessages(activeCheckpoint.messages);
    setTokenUsage(activeCheckpoint.tokenUsage);
    setSessionId(activeCheckpoint.sessionId);
    setShowResumePrompt(false);
    
    // Mark checkpoint as resumed and send continuation
    await fetch('/api/checkpoint', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: activeCheckpoint.id, status: 'resumed' }),
    });
    
    // Add system message about resuming
    const resumeMessage: Message = {
      id: uuidv4(),
      role: 'user',
      content: activeCheckpoint.continuationPrompt,
      timestamp: new Date().toISOString(),
    };
    
    setMessages(prev => [...prev, resumeMessage]);
    handleSend(activeCheckpoint.continuationPrompt);
  };

  // Start fresh
  const handleStartFresh = () => {
    if (activeCheckpoint) {
      fetch('/api/checkpoint', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: activeCheckpoint.id, status: 'abandoned' }),
      });
    }
    setShowResumePrompt(false);
    setActiveCheckpoint(null);
  };

  // Save checkpoint
  const handleSaveCheckpoint = async () => {
    const checkpoint = {
      id: uuidv4(),
      sessionId,
      timestamp: new Date().toISOString(),
      taskDescription: checkpointTask || 'Ongoing conversation',
      completedSteps: messages.filter(m => m.role === 'assistant').slice(-3).map(m => m.content.slice(0, 100)),
      currentStep: 'Awaiting continuation',
      nextSteps: ['Continue from checkpoint'],
      messages,
      tokenUsage,
      contextVariables: {},
      continuationPrompt: generateContinuationPrompt(),
      status: 'active',
    };
    
    try {
      await fetch('/api/checkpoint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(checkpoint),
      });
      
      setShowCheckpointModal(false);
      setCheckpointTask('');
      
      // Reset for new session
      setMessages([]);
      setTokenUsage({ inputTokens: 0, outputTokens: 0, totalTokens: 0, percentUsed: 0 });
      setSessionId(uuidv4());
      
    } catch (error) {
      console.error('Failed to save checkpoint:', error);
    }
  };

  // Generate continuation prompt
  const generateContinuationPrompt = (): string => {
    const recentMessages = messages.slice(-6);
    const summary = recentMessages
      .map(m => `${m.role.toUpperCase()}: ${m.content.slice(0, 150)}...`)
      .join('\n');
    
    return `## SESSION RESUME

**Task:** ${checkpointTask || 'Continuing previous conversation'}

### Recent Context:
${summary}

**INSTRUCTION:** Continue the conversation from where we left off. No need to reintroduce yourself or ask what we were doing - just pick up naturally.`;
  };

  // Send message
  const handleSend = async (overrideContent?: string) => {
    const content = overrideContent || input;
    if (!content.trim() || isLoading) return;
    
    const userMessage: Message = {
      id: uuidv4(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
      tokens: estimateTokens(content),
    };
    
    if (!overrideContent) {
      setMessages(prev => [...prev, userMessage]);
      setInput('');
    }
    
    setIsLoading(true);
    
    const assistantMessage: Message = {
      id: uuidv4(),
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
    };
    
    setMessages(prev => [...prev, assistantMessage]);
    
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content,
          })),
          sessionId,
        }),
      });
      
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === 'text') {
                fullContent += data.content;
                setMessages(prev => 
                  prev.map(m => 
                    m.id === assistantMessage.id 
                      ? { ...m, content: fullContent }
                      : m
                  )
                );
              } else if (data.type === 'done') {
                updateTokenUsage(data.usage.inputTokens, data.usage.outputTokens);
                setMessages(prev =>
                  prev.map(m =>
                    m.id === assistantMessage.id
                      ? { ...m, tokens: data.usage.outputTokens }
                      : m
                  )
                );
              } else if (data.type === 'error') {
                setMessages(prev =>
                  prev.map(m =>
                    m.id === assistantMessage.id
                      ? { ...m, content: `Error: ${data.message}` }
                      : m
                  )
                );
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (error) {
      console.error('Send error:', error);
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantMessage.id
            ? { ...m, content: 'Connection error. Check your internet and try again.' }
            : m
        )
      );
    }
    
    setIsLoading(false);
    inputRef.current?.focus();
  };

  // Get status color
  const getStatusColor = () => {
    if (tokenUsage.percentUsed >= WARNING_THRESHOLD) return 'bg-red-500';
    if (tokenUsage.percentUsed >= CHECKPOINT_THRESHOLD) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getStatusClass = () => {
    if (tokenUsage.percentUsed >= WARNING_THRESHOLD) return 'token-critical';
    if (tokenUsage.percentUsed >= CHECKPOINT_THRESHOLD) return 'token-warning';
    return '';
  };

  // Handle key press
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="h-screen flex flex-col bg-[#0a0a0f]">
      {/* Header with Token Monitor */}
      <header className="flex-none border-b border-[#1e1e2e] p-3 safe-area-top">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-sm font-bold">
              L
            </div>
            <span className="font-semibold">Life OS</span>
          </div>
          <div className="text-xs text-[#64748b]">
            {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
        
        {/* Token Progress Bar */}
        <div className={`${getStatusClass()}`}>
          <div className="flex justify-between text-xs text-[#64748b] mb-1">
            <span>Context: {Math.round(tokenUsage.percentUsed * 100)}%</span>
            <span>{tokenUsage.totalTokens.toLocaleString()} / {MODEL_LIMIT.toLocaleString()}</span>
          </div>
          <div className="h-1.5 bg-[#1e1e2e] rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-300 ${getStatusColor()}`}
              style={{ width: `${Math.min(tokenUsage.percentUsed * 100, 100)}%` }}
            />
          </div>
          {tokenUsage.percentUsed >= CHECKPOINT_THRESHOLD && (
            <button 
              onClick={() => setShowCheckpointModal(true)}
              className="mt-2 w-full py-1.5 text-xs bg-yellow-500/20 text-yellow-400 rounded border border-yellow-500/30 hover:bg-yellow-500/30 transition"
            >
              ⚡ Save Checkpoint & Continue Fresh
            </button>
          )}
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !showResumePrompt && (
          <div className="text-center text-[#64748b] mt-20">
            <div className="text-4xl mb-4">🧠</div>
            <p className="text-lg font-medium">Life OS Ready</p>
            <p className="text-sm mt-2">Direct Claude API • Zero Third-Party Exposure</p>
            <div className="mt-6 grid grid-cols-2 gap-2 max-w-xs mx-auto text-xs">
              <div className="p-2 bg-[#12121a] rounded border border-[#1e1e2e]">
                <div className="text-blue-400">📊 BUSINESS</div>
                <div className="text-[#64748b]">BrevardBidderAI</div>
              </div>
              <div className="p-2 bg-[#12121a] rounded border border-[#1e1e2e]">
                <div className="text-green-400">🏊 MICHAEL</div>
                <div className="text-[#64748b]">D1 Swimming</div>
              </div>
              <div className="p-2 bg-[#12121a] rounded border border-[#1e1e2e]">
                <div className="text-purple-400">👨‍👩‍👦 FAMILY</div>
                <div className="text-[#64748b]">Shabbat & Events</div>
              </div>
              <div className="p-2 bg-[#12121a] rounded border border-[#1e1e2e]">
                <div className="text-orange-400">🎯 PERSONAL</div>
                <div className="text-[#64748b]">ADHD Tracking</div>
              </div>
            </div>
          </div>
        )}
        
        {messages.map((message) => (
          <div 
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div 
              className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                message.role === 'user' 
                  ? 'bg-blue-600 text-white rounded-br-md' 
                  : 'bg-[#12121a] border border-[#1e1e2e] rounded-bl-md'
              }`}
            >
              <div className="whitespace-pre-wrap text-sm leading-relaxed">
                {message.content || (
                  <span className="flex gap-1">
                    <span className="typing-dot w-2 h-2 bg-[#64748b] rounded-full"></span>
                    <span className="typing-dot w-2 h-2 bg-[#64748b] rounded-full"></span>
                    <span className="typing-dot w-2 h-2 bg-[#64748b] rounded-full"></span>
                  </span>
                )}
              </div>
              {message.tokens && (
                <div className="text-[10px] mt-1 opacity-50">
                  {message.tokens.toLocaleString()} tokens
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </main>

      {/* Input */}
      <footer className="flex-none border-t border-[#1e1e2e] p-3 safe-area-bottom">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Life OS..."
            rows={1}
            className="flex-1 bg-[#12121a] border border-[#1e1e2e] rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-blue-500 transition placeholder:text-[#64748b]"
            style={{ maxHeight: '120px' }}
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isLoading}
            className="px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 rounded-xl transition flex items-center justify-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
            </svg>
          </button>
        </div>
      </footer>

      {/* Resume Prompt Modal */}
      {showResumePrompt && activeCheckpoint && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-[#12121a] border border-[#1e1e2e] rounded-2xl p-6 max-w-sm w-full">
            <div className="text-center mb-4">
              <div className="text-3xl mb-2">🔄</div>
              <h2 className="text-lg font-semibold">Resume Session?</h2>
              <p className="text-sm text-[#64748b] mt-2">
                Found an active checkpoint from your previous session.
              </p>
            </div>
            
            <div className="bg-[#0a0a0f] rounded-lg p-3 mb-4 text-xs">
              <div className="text-[#64748b]">Task:</div>
              <div className="font-medium">{activeCheckpoint.taskDescription}</div>
              <div className="text-[#64748b] mt-2">Progress:</div>
              <div>{Math.round(activeCheckpoint.tokenUsage.percentUsed * 100)}% context used</div>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={handleStartFresh}
                className="flex-1 py-3 bg-[#1e1e2e] hover:bg-[#2e2e3e] rounded-xl text-sm transition"
              >
                Start Fresh
              </button>
              <button
                onClick={handleResume}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 rounded-xl text-sm font-medium transition"
              >
                Resume
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Checkpoint Modal */}
      {showCheckpointModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-[#12121a] border border-[#1e1e2e] rounded-2xl p-6 max-w-sm w-full">
            <div className="text-center mb-4">
              <div className="text-3xl mb-2">💾</div>
              <h2 className="text-lg font-semibold">Save Checkpoint</h2>
              <p className="text-sm text-[#64748b] mt-2">
                Context at {Math.round(tokenUsage.percentUsed * 100)}%. Save now to continue fresh.
              </p>
            </div>
            
            <input
              type="text"
              value={checkpointTask}
              onChange={(e) => setCheckpointTask(e.target.value)}
              placeholder="What were we working on? (optional)"
              className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:border-blue-500"
            />
            
            <div className="flex gap-2">
              <button
                onClick={() => setShowCheckpointModal(false)}
                className="flex-1 py-3 bg-[#1e1e2e] hover:bg-[#2e2e3e] rounded-xl text-sm transition"
              >
                Not Yet
              </button>
              <button
                onClick={handleSaveCheckpoint}
                className="flex-1 py-3 bg-green-600 hover:bg-green-700 rounded-xl text-sm font-medium transition"
              >
                Save & Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
