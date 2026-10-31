export type GeneralAlarmNotificationClaim = {
  attempt_id: number;
  boarding_id: number;
  departure_at: string;
  expected_status: 'boarded' | 'on_way' | 'read';
  expo_push_token: string;
  is_urgent: boolean;
  locale: string;
  participant_code: string;
  participant_id: number;
  platform: string;
  title: string;
};

export type GeneralAlarmSendResult = {
  accepted: boolean;
  attemptIds: number[];
  errorCode: string | null;
};

export type DispatchGeneralAlarmDependencies = {
  dispatchDailyPrograms?: () => Promise<void>;
  dispatchWakeUpCalls?: () => Promise<void>;
  claimDueNotifications: () => Promise<GeneralAlarmNotificationClaim[]>;
  completeAttempts: (result: GeneralAlarmSendResult) => Promise<void>;
  getAuthenticatedUserId: (accessToken: string) => Promise<string | null>;
  isAdminUser: (userId: string) => Promise<boolean>;
  sendNotifications: (
    claims: GeneralAlarmNotificationClaim[],
  ) => Promise<GeneralAlarmSendResult[]>;
};

export type DispatchGeneralAlarmRequest = {
  authorization: string | null;
  configuredCronSecret: string | null;
  cronSecret: string | null;
  method: string;
};

export type DispatchGeneralAlarmResponse = {
  body: {
    accepted?: number;
    claimed?: number;
    code: 'dispatched' | 'dispatch_failed' | 'method_not_allowed' | 'unauthorized';
    failed?: number;
    message: string;
  };
  status: number;
};

function getBearerToken(authorization: string | null) {
  return authorization?.match(/^Bearer\s+([^\s]+)$/i)?.[1] ?? null;
}

async function isAuthorized(
  request: DispatchGeneralAlarmRequest,
  dependencies: DispatchGeneralAlarmDependencies,
) {
  if (
    request.configuredCronSecret &&
    request.cronSecret &&
    request.cronSecret === request.configuredCronSecret
  ) {
    return true;
  }

  const accessToken = getBearerToken(request.authorization);
  if (!accessToken) return false;
  const userId = await dependencies.getAuthenticatedUserId(accessToken);
  return userId ? dependencies.isAdminUser(userId) : false;
}

export async function handleDispatchGeneralAlarmRequest(
  request: DispatchGeneralAlarmRequest,
  dependencies: DispatchGeneralAlarmDependencies,
): Promise<DispatchGeneralAlarmResponse> {
  if (request.method !== 'POST') {
    return {
      body: { code: 'method_not_allowed', message: 'POST is required.' },
      status: 405,
    };
  }

  try {
    if (!(await isAuthorized(request, dependencies))) {
      return {
        body: { code: 'unauthorized', message: 'Admin or scheduler authorization is required.' },
        status: 401,
      };
    }

    // All jobs run after authorization, even when there is no active boarding.
    const [boarding, wakeUp, dailyProgram] = await Promise.allSettled([
      dependencies.claimDueNotifications(),
      dependencies.dispatchWakeUpCalls?.(),
      dependencies.dispatchDailyPrograms?.(),
    ]);
    if (boarding.status === 'rejected') throw boarding.reason;
    const claims = boarding.value;
    if (claims.length === 0) {
      if (wakeUp.status === 'rejected') throw wakeUp.reason;
      if (dailyProgram.status === 'rejected') throw dailyProgram.reason;
      return {
        body: {
          accepted: 0,
          claimed: 0,
          code: 'dispatched',
          failed: 0,
          message: 'No general-alarm notification is due.',
        },
        status: 200,
      };
    }

    const results = await dependencies.sendNotifications(claims);
    await Promise.all(results.map((result) => dependencies.completeAttempts(result)));
    if (wakeUp.status === 'rejected') throw wakeUp.reason;
    if (dailyProgram.status === 'rejected') throw dailyProgram.reason;
    const accepted = results
      .filter((result) => result.accepted)
      .reduce((count, result) => count + result.attemptIds.length, 0);

    return {
      body: {
        accepted,
        claimed: claims.length,
        code: 'dispatched',
        failed: claims.length - accepted,
        message: 'Due general-alarm notifications were processed.',
      },
      status: 200,
    };
  } catch {
    return {
      body: {
        code: 'dispatch_failed',
        message: 'General-alarm notifications could not be dispatched.',
      },
      status: 500,
    };
  }
}
