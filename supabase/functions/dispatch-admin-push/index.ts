import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { handleAdminPushRequest, type AdminPushNotificationClaim } from './handler.ts';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers, status: 204 });
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    return new Response(JSON.stringify({ code: 'not_configured' }), { headers, status: 500 });
  }
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  const result = await handleAdminPushRequest({
    method: request.method,
    authorization: request.headers.get('Authorization'),
    body: request.method === 'POST' ? await request.json().catch(() => null) : null,
  }, {
    getAuthenticatedAdminId: async (token) => {
      const { data, error } = await client.auth.getUser(token);
      if (error || !data.user) return null;
      const authorized = await client.rpc('can_dispatch_general_alarm', { p_user_id: data.user.id });
      return !authorized.error && authorized.data === true ? data.user.id : null;
    },
    claimNotifications: async (messageId, userId) => {
      const { data, error } = await client.rpc('claim_admin_push_notifications', {
        p_message_id: messageId, p_requester_user_id: userId,
      });
      if (error) throw error;
      return (data ?? []) as AdminPushNotificationClaim[];
    },
    sendNotifications: (notifications) => fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(notifications),
      signal: AbortSignal.timeout(15000),
    }),
    completeAttempt: async (result) => {
      const { error } = await client.from('admin_push_notification_attempts').update({
        accepted: result.accepted,
        completed_at: new Date().toISOString(),
        error_code: result.errorCode,
        expo_http_status: result.expoHttpStatus,
        expo_ticket_id: result.expoTicketId,
      }).eq('id', result.attemptId);
      if (error) throw error;
    },
  });
  return new Response(JSON.stringify(result.body), { headers, status: result.status });
});
