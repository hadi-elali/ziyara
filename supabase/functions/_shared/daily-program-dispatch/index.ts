import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.112.3';
import {
  dispatchAdminPushNotifications,
  type AdminPushDispatchDependencies,
  type AdminPushNotificationClaim,
} from '../../dispatch-admin-push/handler.ts';

export type DailyProgramNotificationClaim = AdminPushNotificationClaim & { program_id: number; item_id: number };

type DailyProgramPush = {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  priority: 'high';
  channelId: 'general-alarm';
  data: { kind: 'daily_program'; programId: number; itemId: number; route: '/program' };
};

type Dependencies = {
  claimNotifications: () => Promise<DailyProgramNotificationClaim[]>;
  completeAttempt: AdminPushDispatchDependencies['completeAttempt'];
  sendNotifications: (notifications: DailyProgramPush[]) => ReturnType<AdminPushDispatchDependencies['sendNotifications']>;
};

export async function dispatchDailyProgramNotifications(dependencies: Dependencies) {
  let programId = 0;
  let itemId = 0;
  // The RPC returns at most 100 devices from one agenda item per batch. Reuse the
  // established Expo ticket/error handling and never retry uncertain claims.
  return dispatchAdminPushNotifications({
    getAuthenticatedAdminId: async () => null,
    claimNotifications: async () => {
      const claims = await dependencies.claimNotifications();
      programId = claims[0]?.program_id ?? 0;
      itemId = claims[0]?.item_id ?? 0;
      return claims;
    },
    completeAttempt: dependencies.completeAttempt,
    sendNotifications: (notifications) => dependencies.sendNotifications(notifications.map((notification) => ({
      ...notification,
      data: { kind: 'daily_program', programId, itemId, route: '/program' },
    }))),
  }, 0, '');
}


export function dispatchDailyPrograms(client: SupabaseClient) {
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  return dispatchDailyProgramNotifications({
    claimNotifications: async () => {
      const { data, error } = await client.rpc('claim_due_daily_program_notifications');
      if (error) throw error;
      return (data ?? []) as DailyProgramNotificationClaim[];
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
      const { error } = await client.from('daily_program_push_attempts').update({
        accepted: result.accepted,
        completed_at: new Date().toISOString(),
        error_code: result.errorCode,
        expo_http_status: result.expoHttpStatus,
        expo_ticket_id: result.expoTicketId,
      }).eq('id', result.attemptId);
      if (error) throw error;
    },
  });
}
