import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import {
  dispatchAdminPushNotifications,
  type AdminPushNotificationClaim,
} from '../dispatch-admin-push/handler.ts';
import { handleGroupCheckPushRequest } from './handler.ts';

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
  if (!request.headers.get('Authorization')?.match(/^Bearer\s+(\S+)$/i)) {
    return reply(401, { code: 'unauthorized' });
  }
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return reply(500, { code: 'not_configured' });
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');

  const result = await handleGroupCheckPushRequest({
    method: request.method,
    authorization: request.headers.get('Authorization'),
    body: await request.json().catch(() => null),
  }, {
    getUserId: async (token) => {
      const { data, error } = await client.auth.getUser(token);
      return error ? null : data.user?.id ?? null;
    },
    isAdmin: async (userId) => {
      const result = await client.from('profiles').select('role').eq('user_id', userId).maybeSingle();
      if (result.error) throw result.error;
      return result.data?.role === 'admin';
    },
    dispatch: async (checkId, userId) => {
      await dispatchAdminPushNotifications({
        getAuthenticatedAdminId: async () => userId,
        claimNotifications: async (id, requesterId) => {
          const result = await client.rpc('claim_group_check_notifications', {
            p_check_id: id, p_requester_user_id: requesterId,
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
            ...notification, data: { kind: 'group_check_started', checkId, route: '/check-in' },
          }))),
          signal: AbortSignal.timeout(15000),
        }),
        completeAttempt: async (attempt) => {
          const result = await client.from('group_check_push_attempts').update({
            accepted: attempt.accepted,
            completed_at: new Date().toISOString(),
            error_code: attempt.errorCode,
            expo_http_status: attempt.expoHttpStatus,
            expo_ticket_id: attempt.expoTicketId,
          }).eq('id', attempt.attemptId).eq('check_id', checkId);
          if (result.error) throw result.error;
        },
      }, checkId, userId);

      const [failed, pending] = await Promise.all([
        client.from('group_check_push_attempts').select('id').eq('check_id', checkId)
          .eq('accepted', false).not('error_code', 'in', '(device_unregistered,already_answered)').limit(1),
        client.from('group_check_push_attempts').select('id').eq('check_id', checkId)
          .is('completed_at', null).limit(1),
      ]);
      if (failed.error) throw failed.error;
      if (pending.error) throw pending.error;
      return { pushFailed: Boolean(failed.data?.length || pending.data?.length) };
    },
  });
  return reply(result.status, result.body);
});
