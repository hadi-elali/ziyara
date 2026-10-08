import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.3';

type Claim = {
  attempt_id: number;
  call_id: number;
  expo_push_token: string;
  locale: string;
  message: string;
};

export async function dispatchWakeUpCalls(
  client: SupabaseClient,
  callId: number | null = null,
) {
  const { data, error } = await client.rpc('claim_due_wake_up_notifications', {
    p_call_id: callId,
  });
  if (error) throw error;
  const claims = (data ?? []) as Claim[];
  let accepted = 0;
  for (let offset = 0; offset < claims.length; offset += 100) {
    const batch = claims.slice(offset, offset + 100);
    let tickets: { status?: string }[] = [];
    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(Deno.env.get('EXPO_ACCESS_TOKEN')
            ? { Authorization: `Bearer ${Deno.env.get('EXPO_ACCESS_TOKEN')}` }
            : {}),
        },
        body: JSON.stringify(batch.map((claim) => ({
          to: claim.expo_push_token,
          title: claim.locale === 'ar'
            ? 'نداء إيقاظ'
            : claim.locale === 'en'
            ? 'Wake-up call'
            : 'Weckruf',
          body: claim.message,
          sound: 'default',
          priority: 'high',
          channelId: 'general-alarm',
          data: {
            kind: 'wake_up_call',
            callId: claim.call_id,
            route: '/alarm',
          },
        }))),
        signal: AbortSignal.timeout(15000),
      });
      if (response.ok) tickets = (await response.json()).data ?? [];
    } catch {
      /* Attempts remain claimed, preventing duplicate notification delivery. */
    }
    for (let index = 0; index < batch.length; index += 1) {
      const ok = tickets[index]?.status === 'ok';
      if (ok) {
        accepted += 1;
      }
      const completed = await client.from('wake_up_notification_attempts')
        .update({ accepted: ok, completed_at: new Date().toISOString() }).eq(
          'id',
          batch[index].attempt_id,
        );
      if (completed.error) throw completed.error;
    }
  }
  return {
    accepted,
    claimed: claims.length,
    failed: claims.length - accepted,
  };
}
