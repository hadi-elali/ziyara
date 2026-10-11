import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.3';
import { dispatchWakeUpNotifications, type WakeUpNotificationClaim } from './handler.ts';

export async function dispatchWakeUpCalls(
  client: SupabaseClient,
  callId: number | null = null,
) {
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  return dispatchWakeUpNotifications({
    claimNotifications: async (requestedCallId) => {
      const { data, error } = await client.rpc('claim_due_wake_up_notifications', {
        p_call_id: requestedCallId,
      });
      if (error) throw error;
      return (data ?? []) as WakeUpNotificationClaim[];
    },
    sendNotifications: (notifications) =>
      fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken
            ? { Authorization: `Bearer ${accessToken}` }
            : {}),
        },
        body: JSON.stringify(notifications),
        signal: AbortSignal.timeout(15000),
      }),
    completeAttempt: async (result) => {
      const completed = await client.from('wake_up_notification_attempts')
        .update({
          accepted: result.accepted,
          completed_at: new Date().toISOString(),
          error_code: result.errorCode,
          expo_http_status: result.expoHttpStatus,
          expo_ticket_id: result.expoTicketId,
        }).eq('id', result.attemptId);
      if (completed.error) throw completed.error;
    },
  }, callId);
}
