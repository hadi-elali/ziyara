import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import {
  dispatchAdminPushNotifications,
  type AdminPushNotificationClaim,
} from '../dispatch-admin-push/handler.ts';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

Deno.serve(async (request: Request) => {
  const reply = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), { headers, status });
  if (request.method === 'OPTIONS') return new Response(null, { headers, status: 204 });
  if (request.method !== 'POST') return reply(405, { code: 'method_not_allowed' });
  const token = request.headers.get('Authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return reply(401, { code: 'unauthorized' });

  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return reply(500, { code: 'not_configured' });
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');

  try {
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) return reply(401, { code: 'unauthorized' });
    const userId = data.user.id;
    const profile = await client.from('profiles').select('role')
      .eq('user_id', userId).maybeSingle();
    if (profile.error) throw profile.error;
    if (profile.data?.role !== 'admin' && profile.data?.role !== 'scholar') {
      return reply(403, { code: 'manager_required' });
    }
    const body: unknown = await request.json().catch(() => null);
    const roundId = body && typeof body === 'object' && 'roundId' in body ? body.roundId : null;
    if (typeof roundId !== 'number' || !Number.isSafeInteger(roundId) || roundId <= 0) {
      return reply(400, { code: 'invalid_round' });
    }

    // Reuse batching, Expo ticket parsing and privacy-safe completion logging.
    // The round-specific RPC independently checks the manager role per batch.
    await dispatchAdminPushNotifications({
      getAuthenticatedAdminId: async () => userId,
      claimNotifications: async (id, userId) => {
        const result = await client.rpc('claim_question_round_notifications', {
          p_round_id: id, p_requester_user_id: userId,
        });
        if (result.error) throw result.error;
        return (result.data ?? []) as AdminPushNotificationClaim[];
      },
      sendNotifications: (notifications) => fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(notifications.map((notification) => ({
          ...notification,
          data: { kind: 'question_round_opened', roundId, route: '/question-round' },
        }))),
        signal: AbortSignal.timeout(15000),
      }),
      completeAttempt: async (result) => {
        const completed = await client.from('question_round_push_attempts').update({
          accepted: result.accepted,
          completed_at: new Date().toISOString(),
          error_code: result.errorCode,
          expo_http_status: result.expoHttpStatus,
          expo_ticket_id: result.expoTicketId,
        }).eq('id', result.attemptId).eq('round_id', roundId);
        if (completed.error) throw completed.error;
      },
    }, roundId, userId);

    // Include earlier failed/uncertain attempts when resuming the same round.
    // Skipped devices are intentional exclusions, not delivery failures.
    const [failed, pending] = await Promise.all([
      client.from('question_round_push_attempts').select('id')
        .eq('round_id', roundId).eq('accepted', false)
        .not('error_code', 'in', '(device_unregistered,audience_changed)').limit(1),
      client.from('question_round_push_attempts').select('id')
        .eq('round_id', roundId).is('completed_at', null).limit(1),
    ]);
    if (failed.error) throw failed.error;
    if (pending.error) throw pending.error;
    return reply(200, {
      code: 'processed',
      pushFailed: Boolean(failed.data?.length || pending.data?.length),
    });
  } catch {
    return reply(500, { code: 'dispatch_failed' });
  }
});
