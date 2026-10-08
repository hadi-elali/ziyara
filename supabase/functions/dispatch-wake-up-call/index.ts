import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { dispatchWakeUpCalls } from '../_shared/wake-up-dispatch/index.ts';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { headers, status });
Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers, status: 204 });
  }
  if (request.method !== 'POST') return reply({ error: 'POST required.' }, 405);
  const token = request.headers.get('Authorization')?.match(/^Bearer\s+(\S+)$/i)
    ?.[1];
  if (!token) return reply({ error: 'Authentication required.' }, 401);
  const body = await request.json().catch(() => null);
  if (!Number.isSafeInteger(body?.callId) || body.callId <= 0) {
    return reply({ error: 'Valid callId required.' }, 400);
  }
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return reply({ error: 'Service is not configured.' }, 500);
  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  try {
    const { data: auth, error } = await client.auth.getUser(token);
    if (error || !auth.user) {
      return reply({ error: 'Authentication required.' }, 401);
    }
    const authorized = await client.rpc('can_dispatch_general_alarm', {
      p_user_id: auth.user.id,
    });
    if (authorized.error || authorized.data !== true) {
      return reply({ error: 'Admin access required.' }, 403);
    }
    return reply(await dispatchWakeUpCalls(client, body.callId));
  } catch {
    return reply({ error: 'Push notifications could not be dispatched.' }, 500);
  }
});
