import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { dispatchWakeUpCalls } from '../_shared/wake-up-dispatch/index.ts';
import { dispatchDailyPrograms } from '../_shared/daily-program-dispatch/index.ts';

import {
  handleDispatchGeneralAlarmRequest,
  type DispatchGeneralAlarmDependencies,
  type GeneralAlarmNotificationClaim,
  type GeneralAlarmSendResult,
} from './handler.ts';

const corsHeaders = {
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-general-alarm-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

type ExpoPushTicket = {
  details?: { error?: string };
  id?: string;
  message?: string;
  status?: string;
};

type GroupedNotification = {
  attemptIds: number[];
  body: string;
  claims: GeneralAlarmNotificationClaim[];
  title: string;
  to: string;
};

const translations = {
  ar: {
    body: (codes: string, status: string) => `${codes}: يرجى تأكيد «${status}» الآن.`,
    departure: (minutes: number) =>
      minutes > 0 ? `المغادرة بعد ${minutes} دقيقة.` : 'حان وقت المغادرة.',
    statuses: { boarded: 'في الحافلة', on_way: 'أنا في الطريق', read: 'تمت القراءة' },
    title: 'صعود الحافلة',
    urgentTitle: 'صعود الحافلة – المغادرة وشيكة',
  },
  de: {
    body: (codes: string, status: string) => `${codes}: Bitte jetzt „${status}“ bestätigen.`,
    departure: (minutes: number) =>
      minutes > 0 ? `Abfahrt in ${minutes} Minuten.` : 'Abfahrt ist jetzt fällig.',
    statuses: { boarded: 'Im Bus', on_way: 'Ich bin unterwegs', read: 'Gelesen' },
    title: 'Boarding',
    urgentTitle: 'Boarding – Abfahrt dringend',
  },
  en: {
    body: (codes: string, status: string) => `${codes}: Please confirm “${status}” now.`,
    departure: (minutes: number) =>
      minutes > 0 ? `Departure in ${minutes} minutes.` : 'Departure is due now.',
    statuses: { boarded: 'On the bus', on_way: 'I am on my way', read: 'Read' },
    title: 'Boarding',
    urgentTitle: 'Boarding – departure imminent',
  },
} as const;

function groupClaims(claims: GeneralAlarmNotificationClaim[]) {
  const groups = new Map<string, GeneralAlarmNotificationClaim[]>();

  for (const claim of claims) {
    const key = `${claim.expo_push_token}:${claim.expected_status}:${claim.is_urgent}`;
    groups.set(key, [...(groups.get(key) ?? []), claim]);
  }

  return [...groups.values()].map<GroupedNotification>((group) => {
    const first = group[0];
    const locale = first.locale === 'ar' || first.locale === 'en' ? first.locale : 'de';
    const copy = translations[locale];
    const codes = group.map((claim) => claim.participant_code).join(', ');
    const departureMinutes = Math.max(
      0,
      Math.ceil((new Date(first.departure_at).getTime() - Date.now()) / 60_000),
    );
    const statusBody = copy.body(codes, copy.statuses[first.expected_status]);
    return {
      attemptIds: group.map((claim) => claim.attempt_id),
      body:
        first.expected_status === 'read'
          ? `${copy.departure(departureMinutes)} ${statusBody}`
          : statusBody,
      claims: group,
      title: first.is_urgent ? copy.urgentTitle : copy.title,
      to: first.expo_push_token,
    };
  });
}

async function sendToExpo(
  claims: GeneralAlarmNotificationClaim[],
  accessToken: string | null,
): Promise<GeneralAlarmSendResult[]> {
  const groups = groupClaims(claims);
  const results: GeneralAlarmSendResult[] = [];

  for (let offset = 0; offset < groups.length; offset += 100) {
    const batch = groups.slice(offset, offset + 100);
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      body: JSON.stringify(
        batch.map((group) => ({
          body: group.body,
          channelId: 'general-alarm',
          data: { kind: 'general_alarm', route: '/bus' },
          priority: 'high',
          sound: 'default',
          title: group.title,
          to: group.to,
        })),
      ),
      headers: {
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });

    if (!response.ok) {
      const errorCode = `expo_http_${response.status}`;
      results.push(
        ...batch.map((group) => ({
          accepted: false,
          attemptIds: group.attemptIds,
          errorCode,
        })),
      );
      continue;
    }

    const payload = (await response.json()) as { data?: ExpoPushTicket[] };
    const tickets = payload.data ?? [];
    results.push(
      ...batch.map((group, index) => {
        const ticket = tickets[index];
        const accepted = ticket?.status === 'ok';
        return {
          accepted,
          attemptIds: group.attemptIds,
          errorCode: accepted
            ? null
            : (ticket?.details?.error ?? ticket?.message ?? 'expo_ticket_error'),
        };
      }),
    );
  }

  return results;
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ code: 'dispatch_failed', message: 'Service is not configured.' }),
      { headers: corsHeaders, status: 500 },
    );
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const dependencies: DispatchGeneralAlarmDependencies = {
    dispatchDailyPrograms: async () => {
      const result = await dispatchDailyPrograms(adminClient);
      if (result.failed > 0) throw new Error('Daily-program push dispatch failed.');
    },
    dispatchWakeUpCalls: async () => {
      const result = await dispatchWakeUpCalls(adminClient);
      if (result.failed > 0) throw new Error('Wake-up push dispatch failed.');
    },
    claimDueNotifications: async () => {
      const { data, error } = await adminClient.rpc(
        'claim_due_general_alarm_notifications',
      );
      if (error) throw error;
      return (data ?? []) as GeneralAlarmNotificationClaim[];
    },
    completeAttempts: async (result) => {
      const { error } = await adminClient.rpc(
        'complete_general_alarm_notification_attempts',
        {
          p_accepted: result.accepted,
          p_attempt_ids: result.attemptIds,
          p_error_code: result.errorCode ?? '',
        },
      );
      if (error) throw error;
    },
    getAuthenticatedUserId: async (accessToken) => {
      const { data, error } = await adminClient.auth.getUser(accessToken);
      return error ? null : (data.user?.id ?? null);
    },
    isAdminUser: async (userId) => {
      const { data, error } = await adminClient.rpc('can_dispatch_general_alarm', {
        p_user_id: userId,
      });
      if (error) throw error;
      return data === true;
    },
    sendNotifications: (claims) =>
      sendToExpo(claims, Deno.env.get('EXPO_ACCESS_TOKEN') ?? null),
  };
  const result = await handleDispatchGeneralAlarmRequest(
    {
      authorization: request.headers.get('Authorization'),
      configuredCronSecret: Deno.env.get('GENERAL_ALARM_CRON_SECRET') ?? null,
      cronSecret: request.headers.get('x-general-alarm-cron-secret'),
      method: request.method,
    },
    dependencies,
  );

  return new Response(JSON.stringify(result.body), {
    headers: corsHeaders,
    status: result.status,
  });
});
