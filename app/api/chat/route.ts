import Anthropic from '@anthropic-ai/sdk';
import { NextRequest } from 'next/server';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// Life OS System Prompt - your methodology stays private
const LIFE_OS_SYSTEM = `You are Claude, integrated with Ariel Shapira's Life OS - an ADHD-optimized productivity system.

## CORE IDENTITY
- User: Ariel Shapira (Managing Member, Everest Capital of Brevard LLC)
- Dual timezone: FL (America/New_York) | IL (Asia/Jerusalem)
- Family: Wife Mariam, Son Michael (16, D1 swimmer)
- Style: Direct, no softening language, action-oriented

## DOMAINS
1. BUSINESS - Foreclosure auctions, BrevardBidderAI, insurance agencies
2. MICHAEL D1 SWIMMING - Events: 50/100/200 Free, 100 Fly, 100 Back
3. FAMILY - Orthodox observance: Shabbat, holidays
4. ARIEL PERSONAL - Health, learning, productivity

## BREVARD BIDDER AI
- GitHub: breverdbidder/brevard-bidder-scraper
- Stack: GitHub + Supabase + Vercel + GitHub Actions
- Supabase: mocerqjnksmhcjzxrewo.supabase.co
- This is an "Agentic AI ecosystem" (NOT SaaS)
- Never ask execution questions - execute autonomously

## ADHD ACCOUNTABILITY
- Never let tasks be abandoned without acknowledgment
- Call out patterns honestly
- No softening, no excessive praise, just facts

## SESSION MANAGEMENT
- This interface has token monitoring built in
- Auto-checkpoint when approaching limits
- You'll see [CHECKPOINT] markers when state is saved
- On resume, you'll receive context to continue seamlessly`;

export async function POST(request: NextRequest) {
  try {
    const { messages, sessionId, model = 'claude-sonnet-4-20250514' } = await request.json();

    // Convert messages to Anthropic format
    const anthropicMessages = messages.map((m: { role: string; content: string }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // Create streaming response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let fullResponse = '';
        let inputTokens = 0;
        let outputTokens = 0;

        try {
          const response = await anthropic.messages.create({
            model,
            max_tokens: 8192,
            system: LIFE_OS_SYSTEM,
            messages: anthropicMessages,
            stream: true,
          });

          for await (const event of response) {
            if (event.type === 'content_block_delta') {
              const delta = event.delta;
              if ('text' in delta) {
                fullResponse += delta.text;
                // Send text chunk
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                  type: 'text', 
                  content: delta.text 
                })}\n\n`));
              }
            } else if (event.type === 'message_start') {
              inputTokens = event.message.usage?.input_tokens || 0;
            } else if (event.type === 'message_delta') {
              outputTokens = event.usage?.output_tokens || 0;
            }
          }

          // Send final token count
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: 'done',
            usage: {
              inputTokens,
              outputTokens,
              totalTokens: inputTokens + outputTokens,
            }
          })}\n\n`));

        } catch (error) {
          console.error('Claude API error:', error);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: 'error', 
            message: error instanceof Error ? error.message : 'Unknown error' 
          })}\n\n`));
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Request error:', error);
    return Response.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}
