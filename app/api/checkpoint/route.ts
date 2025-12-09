import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET - Load active checkpoint or specific checkpoint by ID
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const checkpointId = searchParams.get('id');
  const activeOnly = searchParams.get('active') === 'true';

  try {
    if (checkpointId) {
      // Load specific checkpoint
      const { data, error } = await supabase
        .from('session_checkpoints')
        .select('*')
        .eq('id', checkpointId)
        .single();

      if (error) throw error;
      return Response.json(data);
    }

    if (activeOnly) {
      // Load most recent active checkpoint
      const { data, error } = await supabase
        .from('session_checkpoints')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
      return Response.json(data || null);
    }

    // Load all checkpoints (most recent first)
    const { data, error } = await supabase
      .from('session_checkpoints')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;
    return Response.json(data);

  } catch (error) {
    console.error('Checkpoint load error:', error);
    return Response.json({ error: 'Failed to load checkpoint' }, { status: 500 });
  }
}

// POST - Save new checkpoint
export async function POST(request: NextRequest) {
  try {
    const checkpoint = await request.json();

    // Mark any existing active checkpoints as superseded
    await supabase
      .from('session_checkpoints')
      .update({ status: 'superseded' })
      .eq('status', 'active')
      .eq('session_id', checkpoint.sessionId);

    // Insert new checkpoint
    const { data, error } = await supabase
      .from('session_checkpoints')
      .insert({
        id: checkpoint.id,
        session_id: checkpoint.sessionId,
        task_description: checkpoint.taskDescription,
        completed_steps: checkpoint.completedSteps,
        current_step: checkpoint.currentStep,
        next_steps: checkpoint.nextSteps,
        messages: checkpoint.messages,
        token_usage: checkpoint.tokenUsage,
        context_variables: checkpoint.contextVariables,
        continuation_prompt: checkpoint.continuationPrompt,
        status: 'active',
        created_at: checkpoint.timestamp,
      })
      .select()
      .single();

    if (error) throw error;

    // Also log to activities table for Life OS tracking
    await supabase.from('activities').insert({
      activity_type: 'session_checkpoint',
      platform: 'life_os_mobile',
      domain: 'BUSINESS',
      start_time: checkpoint.timestamp,
      notes: JSON.stringify({
        checkpoint_id: checkpoint.id,
        task: checkpoint.taskDescription,
        token_percent: Math.round(checkpoint.tokenUsage.percentUsed * 100),
      }),
      timezone: 'America/New_York',
    });

    return Response.json(data);

  } catch (error) {
    console.error('Checkpoint save error:', error);
    return Response.json({ error: 'Failed to save checkpoint' }, { status: 500 });
  }
}

// PATCH - Update checkpoint status
export async function PATCH(request: NextRequest) {
  try {
    const { id, status } = await request.json();

    const { data, error } = await supabase
      .from('session_checkpoints')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return Response.json(data);

  } catch (error) {
    console.error('Checkpoint update error:', error);
    return Response.json({ error: 'Failed to update checkpoint' }, { status: 500 });
  }
}
